import { describe, expect, it } from 'vitest';

import UndoableHistory, { coalesceWindowMs } from './undoableHistory';
import EditHistoryOrder from './editHistoryOrder';

function createHistory(initial: string) {
  let time = 0;
  const history = new UndoableHistory(initial, 100, () => time);
  return { history, advance: (ms: number) => { time += ms; } };
}

describe('UndoableHistory', () => {
  it('steps back and forward through edits', () => {
    const { history } = createHistory('a');
    expect(history.set('b')).toBe(true);
    expect(history.set('c')).toBe(true);
    expect(history.back()).toBe(true);
    expect(history.current).toBe('b');
    expect(history.forward()).toBe(true);
    expect(history.current).toBe('c');
    expect(history.forward()).toBe(false);
  });

  it('merges a continuous drag or typing burst into one step', () => {
    const { history, advance } = createHistory('');
    history.set('H', { coalesceKey: 'text:1' });
    advance(200);
    expect(history.set('He', { coalesceKey: 'text:1' })).toBe(false);
    advance(200);
    history.set('Hey', { coalesceKey: 'text:1' });
    history.back();
    expect(history.current).toBe('');
  });

  it('starts a new step after a pause, a different key, or an undo', () => {
    const { history, advance } = createHistory('');
    history.set('a', { coalesceKey: 'k' });
    advance(coalesceWindowMs + 1);
    expect(history.set('ab', { coalesceKey: 'k' })).toBe(true);
    expect(history.set('abc', { coalesceKey: 'other' })).toBe(true);
    history.back();
    expect(history.set('abX', { coalesceKey: 'other' })).toBe(true);
  });

  it('never folds an edit into the initial state', () => {
    const { history } = createHistory('start');
    history.set('one', { coalesceKey: 'k' });
    history.back();
    history.forward();
    history.back();
    expect(history.current).toBe('start');
  });

  it('applies bookkeeping merges without adding a step', () => {
    const { history } = createHistory('a');
    history.set('b');
    expect(history.set('b+pin', { merge: true })).toBe(false);
    history.back();
    expect(history.current).toBe('a');
  });

  it('drops forward steps after a new edit', () => {
    const { history } = createHistory('a');
    history.set('b');
    history.back();
    history.set('c');
    expect(history.forward()).toBe(false);
    expect(history.current).toBe('c');
  });
});

describe('EditHistoryOrder', () => {
  function domain(initial: string) {
    const { history } = createHistory(initial);
    return history;
  }

  it('undoes the most recent edit across separately stored state', () => {
    const segments = domain('no crop');
    const text = domain('no text');
    const order = new EditHistoryOrder<'segments' | 'text'>();
    const histories = { segments, text };

    segments.set('cropped');
    order.record('segments');
    text.set('Sample Text');
    order.record('text');

    // The text came last, so it is undone first and the crop survives.
    expect(order.undo(histories)).toBe('text');
    expect(text.current).toBe('no text');
    expect(segments.current).toBe('cropped');

    expect(order.undo(histories)).toBe('segments');
    expect(segments.current).toBe('no crop');

    expect(order.redo(histories)).toBe('segments');
    expect(order.redo(histories)).toBe('text');
    expect(text.current).toBe('Sample Text');
  });

  it('skips entries whose history is gone and clears redo on a new edit', () => {
    const segments = domain('a');
    const text = domain('x');
    const order = new EditHistoryOrder<'segments' | 'text'>();
    const histories = { segments, text };

    text.set('y');
    order.record('text');
    order.record('segments'); // e.g. a reset, with nothing to step back to
    expect(order.undo(histories)).toBe('text');

    text.set('z');
    order.record('text');
    expect(order.redo(histories)).toBeUndefined();
  });
});
