import { describe, expect, it } from 'vitest';

import UndoableHistory, { applyUndoableUpdate } from './undoableHistory';
import type { UndoableSetOptions } from './undoableHistory';
import EditHistoryOrder, { coalesceWindowMs } from './editHistoryOrder';

describe('UndoableHistory', () => {
  it('steps back and forward through edits', () => {
    const history = new UndoableHistory('a');
    expect(history.set('b')).toBe('added');
    expect(history.set('c')).toBe('added');
    expect(history.back()).toBe(true);
    expect(history.current).toBe('b');
    expect(history.forward()).toBe(true);
    expect(history.current).toBe('c');
    expect(history.forward()).toBe(false);
  });

  it('ignores an update that changes nothing', () => {
    const history = new UndoableHistory('a');
    expect(history.set('a')).toBe('unchanged');
    expect(history.back()).toBe(false);
  });

  it('extends the latest step, but never the first one or one left behind by an undo', () => {
    const history = new UndoableHistory('');
    expect(history.set('H', { extend: true })).toBe('added');
    expect(history.set('He', { extend: true })).toBe('extended');
    history.back();
    expect(history.current).toBe('');
    history.forward();
    history.set('Hey');
    history.back();
    expect(history.set('Hex', { extend: true })).toBe('added');
  });

  it('applies bookkeeping in place without adding a step', () => {
    const history = new UndoableHistory('a');
    history.set('b');
    history.replaceCurrent('b+pin');
    expect(history.current).toBe('b+pin');
    history.back();
    expect(history.current).toBe('a');
  });

  it('drops forward steps after a new edit', () => {
    const history = new UndoableHistory('a');
    history.set('b');
    history.back();
    history.set('c');
    expect(history.forward()).toBe(false);
    expect(history.current).toBe('c');
  });

  it('keeps undoing the latest edits once it is full', () => {
    const history = new UndoableHistory(0, 100);
    for (let value = 1; value <= 105; value += 1) expect(history.set(value)).toBe('added');
    // The cursor stays on the newest step when the oldest ones are dropped.
    expect(history.current).toBe(105);
    expect(history.back()).toBe(true);
    expect(history.current).toBe(104);
    let undos = 1;
    while (history.back()) undos += 1;
    expect(undos).toBe(99);
    expect(history.current).toBe(6);
    expect(history.forward()).toBe(true);
    expect(history.current).toBe(7);
  });

  it('starts over from a reset', () => {
    const history = new UndoableHistory('a');
    history.set('b');
    history.reset('x');
    expect(history.current).toBe('x');
    expect(history.back()).toBe(false);
    expect(history.forward()).toBe(false);
  });
});

/** Separately stored pieces of state sharing one undo order, updated the way useUndoableState does. */
function createEditor(capacity = 100) {
  let time = 0;
  const order = new EditHistoryOrder<'segments' | 'text' | 'gain'>(() => time);
  const create = <T, >(domain: 'segments' | 'text' | 'gain', initial: T) => {
    const history = new UndoableHistory(initial, capacity);
    const tracker = order.tracker(domain);
    return {
      history,
      get value() { return history.current; },
      set: (next: T, options?: UndoableSetOptions) => applyUndoableUpdate(history, next, tracker, options),
      reset: (value: T) => { history.reset(value); tracker.reset(); },
    };
  };
  const segments = create('segments', 0);
  const text = create('text', '');
  const gain = create('gain', 0);
  const histories = { segments: segments.history, text: text.history, gain: gain.history };
  return {
    order,
    segments,
    text,
    gain,
    undo: () => order.undo(histories),
    redo: () => order.redo(histories),
    advance: (ms: number) => { time += ms; },
  };
}

describe('EditHistoryOrder', () => {
  it('undoes and redoes the edits of a group in one step', () => {
    const { order, segments, text, gain, undo, redo } = createEditor();
    segments.set(1);
    text.set('Hi');
    order.group(() => {
      segments.set(2);
      text.set('');
      gain.set(0); // unchanged: no part of the step
      gain.set(3);
    });
    expect(segments.value).toBe(2);
    expect(undo()).toBe('segments');
    expect([segments.value, text.value, gain.value]).toEqual([1, 'Hi', 0]);
    expect(redo()).toBe('segments');
    expect([segments.value, text.value, gain.value]).toEqual([2, '', 3]);
    expect(undo()).toBe('segments');
    // The edits before the group are separate steps, as before.
    expect(undo()).toBe('text');
    expect(text.value).toBe('');
    expect(segments.value).toBe(1);
  });

  it('never lets a group join an earlier coalescing step', () => {
    const { order, text, undo } = createEditor();
    text.set('a', { coalesceKey: 'k' });
    order.group(() => text.set('ab', { coalesceKey: 'k' }));
    undo();
    expect(text.value).toBe('a');
  });

  it('undoes the most recent edit across separately stored state', () => {
    const { segments, text, undo, redo } = createEditor();
    segments.set(1);
    text.set('Sample Text');

    // The text came last, so it is undone first and the segment edit survives.
    expect(undo()).toBe('text');
    expect(text.value).toBe('');
    expect(segments.value).toBe(1);

    expect(undo()).toBe('segments');
    expect(segments.value).toBe(0);

    expect(redo()).toBe('segments');
    expect(redo()).toBe('text');
    expect(text.value).toBe('Sample Text');
  });

  it('merges a continuous drag or typing burst into one step', () => {
    const { text, undo, advance } = createEditor();
    text.set('H', { coalesceKey: 'text:1' });
    advance(200);
    text.set('He', { coalesceKey: 'text:1' });
    advance(200);
    text.set('Hey', { coalesceKey: 'text:1' });
    expect(undo()).toBe('text');
    expect(text.value).toBe('');
    expect(undo()).toBeUndefined();
  });

  it('starts a new step after a pause or with a different key', () => {
    const { text, undo, advance } = createEditor();
    text.set('a', { coalesceKey: 'k' });
    advance(coalesceWindowMs + 1);
    text.set('ab', { coalesceKey: 'k' });
    text.set('abc', { coalesceKey: 'other' });
    undo();
    expect(text.value).toBe('ab');
    undo();
    expect(text.value).toBe('a');
  });

  it('does not fold an edit into an older step after an edit elsewhere', () => {
    // Gain, then text, then the same gain slider again within the coalescing window.
    const { gain, text, undo, advance } = createEditor();
    gain.set(-3, { coalesceKey: 'stream:1' });
    advance(100);
    text.set('A', { coalesceKey: 'text:1' });
    advance(100);
    gain.set(-6, { coalesceKey: 'stream:1' });

    expect(undo()).toBe('gain');
    expect(gain.value).toBe(-3);
    expect(text.value).toBe('A');
    expect(undo()).toBe('text');
    expect(undo()).toBe('gain');
    expect(gain.value).toBe(0);
  });

  it('does not fold an edit into a step after an undo or redo', () => {
    const { gain, text, undo, redo, advance } = createEditor();
    gain.set(-3, { coalesceKey: 'stream:1' });
    advance(100);
    text.set('A', { coalesceKey: 'text:1' });
    advance(100);
    expect(undo()).toBe('text');
    // The gain step is the latest again, but the undo ended its gesture.
    gain.set(-6, { coalesceKey: 'stream:1' });
    expect(redo()).toBeUndefined();
    expect(undo()).toBe('gain');
    expect(gain.value).toBe(-3);

    expect(redo()).toBe('gain');
    gain.set(-9, { coalesceKey: 'stream:1' });
    expect(undo()).toBe('gain');
    expect(gain.value).toBe(-6);
  });

  it('keeps the edit order once segment history is full', () => {
    const { segments, gain, undo, advance } = createEditor();
    gain.set(-3, { coalesceKey: 'stream:1' });
    advance(coalesceWindowMs + 1);
    for (let value = 1; value <= 102; value += 1) segments.set(value);

    expect(undo()).toBe('segments');
    expect(segments.value).toBe(101);

    gain.set(-6, { coalesceKey: 'stream:1' });
    advance(coalesceWindowMs + 1);
    segments.set(103);
    expect(undo()).toBe('segments');
    expect(segments.value).toBe(101);
    expect(gain.value).toBe(-6);
    expect(undo()).toBe('gain');
    expect(gain.value).toBe(-3);
    expect(undo()).toBe('segments');
    expect(segments.value).toBe(100);
  });

  it('skips entries whose history is gone and clears redo on a new edit', () => {
    const { segments, text, undo, redo } = createEditor();
    text.set('y');
    segments.set(1);
    segments.reset(0); // e.g. a file was reopened: nothing to step back to
    expect(undo()).toBe('text');

    text.set('z');
    expect(redo()).toBeUndefined();
  });

  it('records several updates made in one go as separate steps, in order', () => {
    const { segments, text, undo } = createEditor();
    segments.set(1);
    text.set('A');
    segments.set(2);
    expect(undo()).toBe('segments');
    expect(segments.value).toBe(1);
    expect(undo()).toBe('text');
    expect(undo()).toBe('segments');
    expect(segments.value).toBe(0);
  });

  it('applies bookkeeping merges without an undo step or ending a gesture', () => {
    const { text, gain, undo, advance } = createEditor();
    text.set('a', { coalesceKey: 'k' });
    gain.set(-1, { merge: true });
    advance(100);
    text.set('ab', { coalesceKey: 'k' });
    expect(undo()).toBe('text');
    expect(text.value).toBe('');
    expect(undo()).toBeUndefined();
    expect(gain.value).toBe(-1);
  });

  it('ends a gesture when its state is reset', () => {
    const { text, undo } = createEditor();
    text.set('a', { coalesceKey: 'k' });
    text.reset('loaded');
    text.set('loaded+b', { coalesceKey: 'k' });
    expect(undo()).toBe('text');
    expect(text.value).toBe('loaded');
  });
});
