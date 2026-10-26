import { describe, expect, it } from 'vitest';

import { findClipEdge, getEdgeSnapDistance, getNewClipEnd, snapCutEnd, snapCutStart } from './clipEdgeSnap';

describe('getEdgeSnapDistance', () => {
  it('is 3 frames with the whole recording in view, 1 frame once zoomed in', () => {
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1, fps: 60, laneWidthPx: 1100 })).toBeCloseTo(3 / 60);
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1.5, fps: 60, laneWidthPx: 1100 })).toBeCloseTo(1 / 60);
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1, fps: undefined })).toBeCloseTo(3 / 30);
  });

  it('never snaps across a gap you can see', () => {
    // A 5 s recording: 3 frames would be 11 px of the timeline, so it's 2 px.
    expect(getEdgeSnapDistance({ duration: 5, zoom: 1, fps: 60, laneWidthPx: 1100 })).toBeCloseTo((2 * 5) / 1100);
    // Deep zoom: a frame is many pixels wide.
    expect(getEdgeSnapDistance({ duration: 120, zoom: 40, fps: 60, laneWidthPx: 1100 })).toBeCloseTo((2 * 3) / 1100);
  });
});

describe('findClipEdge', () => {
  const clips = [{ start: 4, end: 8 }, { start: 20, end: 25 }];
  const frame = 1 / 60;

  it('goes to the clip edge before or after, with the recording start and end as edges too', () => {
    expect(findClipEdge({ time: 10, clips, duration: 90, direction: -1, frame })).toBe(8);
    expect(findClipEdge({ time: 10, clips, duration: 90, direction: 1, frame })).toBe(20);
    expect(findClipEdge({ time: 2, clips, duration: 90, direction: -1, frame })).toBe(0);
    expect(findClipEdge({ time: 30, clips, duration: 90, direction: 1, frame })).toBe(90);
  });

  it('passes the edge the playhead is already on, and stops at the ends', () => {
    expect(findClipEdge({ time: 8.004, clips, duration: 90, direction: -1, frame })).toBe(4);
    expect(findClipEdge({ time: 8, clips, duration: 90, direction: 1, frame })).toBe(20);
    expect(findClipEdge({ time: 0, clips, duration: 90, direction: -1, frame })).toBeUndefined();
    expect(findClipEdge({ time: 90, clips, duration: 90, direction: 1, frame })).toBeUndefined();
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
