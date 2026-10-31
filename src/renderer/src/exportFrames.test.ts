import { describe, expect, it } from 'vitest';

import pickExportFrames from './exportFrames';

const frames = Array.from({ length: 61 }, (_, second) => ({ time: second, url: `f${second}` }));

describe('pickExportFrames', () => {
  it('spreads the pictures evenly over one clip', () => {
    expect(pickExportFrames(frames, [{ start: 10, end: 20 }], 5)).toEqual(['f11', 'f13', 'f15', 'f17', 'f19']);
  });

  it('follows the clips in their order, each for its share of the export', () => {
    // 4 s then 12 s: one picture from the first clip, three from the second.
    expect(pickExportFrames(frames, [{ start: 50, end: 54 }, { start: 0, end: 12 }], 4)).toEqual(['f52', 'f2', 'f6', 'f10']);
  });

  it('takes the nearest frame when the filmstrip is sparse', () => {
    const sparse = [{ time: 0, url: 'a' }, { time: 30, url: 'b' }, { time: 60, url: 'c' }];
    expect(pickExportFrames(sparse, [{ start: 20, end: 60 }], 2)).toEqual(['b', 'c']);
  });

  it('has nothing to show without frames or clips', () => {
    expect(pickExportFrames([], [{ start: 0, end: 10 }], 4)).toEqual([]);
    expect(pickExportFrames(frames, [], 4)).toEqual([]);
    expect(pickExportFrames(frames, [{ start: 5, end: 5 }], 4)).toEqual([]);
  });
});
