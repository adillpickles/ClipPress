import { describe, expect, it } from 'vitest';

import pickExportFrames, { getExportClipSpans, pickExportWaveform } from './exportFrames';

const frames = Array.from({ length: 61 }, (_, second) => ({ time: second, url: `f${second}` }));
const clip = (start: number, end: number, speed = 1) => ({ start, end, outputDuration: (end - start) / speed });

describe('pickExportFrames', () => {
  it('spreads the pictures evenly over one clip', () => {
    expect(pickExportFrames(frames, [clip(10, 20)], 5).map(({ url }) => url)).toEqual(['f11', 'f13', 'f15', 'f17', 'f19']);
  });

  it('follows the clips in their order, each for its share of the export, with the clip it is from', () => {
    // 4 s then 12 s: one picture from the first clip, three from the second.
    expect(pickExportFrames(frames, [clip(50, 54), clip(0, 12)], 4)).toEqual([
      { url: 'f52', clip: 0 }, { url: 'f2', clip: 1 }, { url: 'f6', clip: 1 }, { url: 'f10', clip: 1 },
    ]);
  });

  it('gives a sped-up clip its share of the export, not of the recording', () => {
    // 40 s at 400% lasts 10 s, as long as the 10 s clip after it: two pictures each.
    expect(pickExportFrames(frames, [clip(0, 40, 4), clip(40, 50)], 4).map(({ clip: index }) => index)).toEqual([0, 0, 1, 1]);
  });

  it('takes the nearest frame when the filmstrip is sparse', () => {
    const sparse = [{ time: 0, url: 'a' }, { time: 30, url: 'b' }, { time: 60, url: 'c' }];
    expect(pickExportFrames(sparse, [clip(20, 60)], 2).map(({ url }) => url)).toEqual(['b', 'c']);
  });

  it('has nothing to show without frames or clips', () => {
    expect(pickExportFrames([], [clip(0, 10)], 4)).toEqual([]);
    expect(pickExportFrames(frames, [], 4)).toEqual([]);
    expect(pickExportFrames(frames, [clip(5, 5)], 4)).toEqual([]);
  });
});

describe('pickExportWaveform', () => {
  it('takes the loudest peak over each bar', () => {
    // A peak per second: loud only from 10 to 11 s.
    const peaks = new Float32Array(60).fill(0.1);
    peaks[10] = 1;
    const bars = pickExportWaveform({ peaks, bucketSeconds: 1 }, [clip(0, 20)], 4);
    expect(bars).toHaveLength(4);
    expect(bars[1]).toBe(1);
    expect(bars[3]).toBeCloseTo(0.1);
  });

  it('has nothing without peaks', () => {
    expect(pickExportWaveform({ peaks: new Float32Array(0), bucketSeconds: 1 }, [clip(0, 20)], 4)).toEqual([]);
  });
});

describe('getExportClipSpans', () => {
  it('gives each clip its share of the strip', () => {
    expect(getExportClipSpans([clip(0, 40, 4), clip(40, 70)])).toEqual([{ from: 0, to: 0.25 }, { from: 0.25, to: 1 }]);
  });
});
