import { describe, expect, it } from 'vitest';

import { resetSegmentHistory } from './segmentHistory';

interface Segment { name: string }

/**
 * Stand-in for the history object returned by react-use's `useStateWithHistory`,
 * mirroring how that hook drives its array and cursor (see
 * node_modules/react-use/lib/useStateWithHistory.js): `history` is the live array,
 * `go` clamps to it, and `forward` refuses to move when already at the last entry.
 */
function createHistory(capacity = 100) {
  let history: Segment[][] = [[]];
  let position = 0;
  return {
    get history() { return history; },
    get state() { return history[position]!; },
    get position() { return position; },
    set(next: Segment[]) {
      if (position < history.length - 1) history = history.slice(0, position + 1);
      position = history.push(next) - 1;
      if (history.length > capacity) {
        history = history.slice(history.length - capacity);
        position = history.length - 1;
      }
    },
    back() {
      if (!position) return;
      position -= 1;
    },
    forward() {
      if (position === history.length - 1) return;
      position += 1;
    },
    go(next: number) {
      if (next === position) return;
      position = next < 0 ? Math.max(history.length + next, 0) : Math.min(history.length - 1, next);
    },
  };
}

describe('resetSegmentHistory', () => {
  it('leaves a single empty entry and no redo target', () => {
    const h = createHistory();
    h.set([{ name: 'a' }]);
    h.set([{ name: 'a' }, { name: 'b' }]);

    resetSegmentHistory(h);

    expect(h.history).toEqual([[]]);
    expect(h.position).toBe(0);
    expect(h.state).toEqual([]);

    // Redo must not resurrect the previous file's segments
    h.forward();
    expect(h.state).toEqual([]);
    h.back();
    expect(h.state).toEqual([]);
  });

  it('still resets after an undo, when the cursor is already at position 0', () => {
    const h = createHistory();
    h.set([{ name: 'a' }]);
    h.back();
    expect(h.position).toBe(0);

    resetSegmentHistory(h);

    expect(h.history).toEqual([[]]);
    h.forward();
    expect(h.state).toEqual([]);
  });

  it('resets even after the history has grown past its capacity', () => {
    // Overwriting only history[0] is wrong here: once the hook slices the array,
    // index 0 is an old state, not the initial empty one.
    const h = createHistory(3);
    for (let i = 0; i < 10; i += 1) h.set([{ name: `seg${i}` }]);
    expect(h.history.length).toBe(3);
    expect(h.history[0]).not.toEqual([]);

    resetSegmentHistory(h);

    expect(h.history).toEqual([[]]);
    expect(h.state).toEqual([]);
    h.forward();
    expect(h.state).toEqual([]);
  });
});
