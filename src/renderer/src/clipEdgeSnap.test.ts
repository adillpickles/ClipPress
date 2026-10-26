import { describe, expect, it } from 'vitest';

import { getEdgeSnapDistance, getNewClipEnd, snapCutEnd, snapCutStart } from './clipEdgeSnap';

describe('getEdgeSnapDistance', () => {
  it('is a few pixels of the timeline in view', () => {
    expect(getEdgeSnapDistance({ visibleDuration: 30, fps: 60 })).toBeCloseTo(0.21);
  });

  it('is never less than a frame and a half, nor more than half a second', () => {
    expect(getEdgeSnapDistance({ visibleDuration: 2, fps: 60 })).toBeCloseTo(1.5 / 60);
    expect(getEdgeSnapDistance({ visibleDuration: 2, fps: undefined })).toBeCloseTo(1.5 / 30);
    expect(getEdgeSnapDistance({ visibleDuration: 900, fps: 60 })).toBe(0.5);
  });
});

describe('snapCutStart', () => {
  const clips = [{ start: 4, end: 8 }, { start: 20, end: 25 }];

  it('locks onto a clip end the playhead is just inside or just past', () => {
    expect(snapCutStart({ time: 7.97, clips, distance: 0.1 })).toBe(8);
    expect(snapCutStart({ time: 8.05, clips, distance: 0.1 })).toBe(8);
    expect(snapCutStart({ time: 25.02, clips, distance: 0.1 })).toBe(25);
  });

  it('leaves the playhead alone away from an end, and near a start', () => {
    expect(snapCutStart({ time: 8.3, clips, distance: 0.1 })).toBeUndefined();
    expect(snapCutStart({ time: 4.02, clips, distance: 0.1 })).toBeUndefined();
    expect(snapCutStart({ time: 19.98, clips, distance: 0.1 })).toBeUndefined();
  });

  it('takes the closer of two ends', () => {
    expect(snapCutStart({ time: 10.04, clips: [{ start: 0, end: 10 }, { start: 5, end: 10.1 }], distance: 0.1 })).toBe(10);
    expect(snapCutStart({ time: 10.07, clips: [{ start: 0, end: 10 }, { start: 5, end: 10.1 }], distance: 0.1 })).toBe(10.1);
  });

  it('skips a clip with no end yet', () => {
    expect(snapCutStart({ time: 8, clips: [{ start: 4 }], distance: 0.1 })).toBeUndefined();
  });
});

describe('snapCutEnd', () => {
  const clips = [{ start: 4, end: 9 }, { start: 12, end: 18 }];

  it('locks onto where the next clip starts', () => {
    expect(snapCutEnd({ time: 11.96, clips, currentIndex: 0, distance: 0.1 })).toBe(12);
    expect(snapCutEnd({ time: 12.04, clips, currentIndex: 0, distance: 0.1 })).toBe(12);
  });

  it('never snaps to its own edges or to a clip starting before it', () => {
    expect(snapCutEnd({ time: 4.05, clips, currentIndex: 0, distance: 0.1 })).toBeUndefined();
    expect(snapCutEnd({ time: 4.02, clips, currentIndex: 1, distance: 0.1 })).toBeUndefined();
    expect(snapCutEnd({ time: 12.02, clips, currentIndex: 1, distance: 0.1 })).toBeUndefined();
  });
});

describe('getNewClipEnd', () => {
  it('stops a new clip where the next one starts', () => {
    expect(getNewClipEnd({ start: 8, length: 10, duration: 90, clips: [{ start: 4, end: 8 }, { start: 12, end: 15 }] })).toBe(12);
  });

  it('is the usual length otherwise, within the recording', () => {
    expect(getNewClipEnd({ start: 8, length: 10, duration: 90, clips: [{ start: 4, end: 8 }] })).toBe(18);
    expect(getNewClipEnd({ start: 85, length: 10, duration: 90, clips: [] })).toBe(90);
  });
});
