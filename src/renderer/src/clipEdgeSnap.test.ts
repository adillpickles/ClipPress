import { describe, expect, it } from 'vitest';

import { findClipEdge, getEdgeSnapDistance, getNewClipEnd, snapCutEnd, snapCutStart, snapDraggedEdge } from './clipEdgeSnap';

describe('getEdgeSnapDistance', () => {
  it('is about 3 px of the timeline with the whole recording in view: at least 3 frames, at most 0.3 s', () => {
    expect(getEdgeSnapDistance({ duration: 90, zoom: 1, fps: 60, laneWidthPx: 1100 })).toBeCloseTo((3 * 90) / 1100);
    // A 5 s recording: 3 px is less than 3 frames.
    expect(getEdgeSnapDistance({ duration: 5, zoom: 1, fps: 60, laneWidthPx: 1100 })).toBeCloseTo(3.05 / 60);
    // A 2-minute one or longer: capped.
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1, fps: 60, laneWidthPx: 1100 })).toBe(0.3);
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1, fps: undefined })).toBeCloseTo(3.05 / 30);
  });

  it('zoomed in: 1 frame, never across a gap you can see', () => {
    expect(getEdgeSnapDistance({ duration: 120, zoom: 1.5, fps: 60, laneWidthPx: 1100 })).toBeCloseTo(1.05 / 60);
    // Deep zoom: a frame is many pixels wide, so it's 2 px.
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

describe('snapDraggedEdge', () => {
  // 10 px a second on screen.
  const toPx = (at: number) => at * 10;
  const px = toPx;
  const clips = [{ start: 0, end: 10 }, { start: 12, end: 20 }, { start: 25, end: 30 }];

  it("locks clip 2's start onto clip 1's end within 8 px, from either side", () => {
    expect(snapDraggedEdge({ pointerPx: px(10.5), edge: 'start', clips, currentIndex: 1, toPx })).toBe(10);
    expect(snapDraggedEdge({ pointerPx: px(9.3), edge: 'start', clips, currentIndex: 1, toPx })).toBe(10);
    expect(snapDraggedEdge({ pointerPx: px(11), edge: 'start', clips, currentIndex: 1, toPx })).toBeUndefined();
    // Dragged further, it goes past.
    expect(snapDraggedEdge({ pointerPx: px(8), edge: 'start', clips, currentIndex: 1, toPx })).toBeUndefined();
  });

  it("locks clip 2's end onto clip 3's start", () => {
    expect(snapDraggedEdge({ pointerPx: px(24.4), edge: 'end', clips, currentIndex: 1, toPx })).toBe(25);
    expect(snapDraggedEdge({ pointerPx: px(22), edge: 'end', clips, currentIndex: 1, toPx })).toBeUndefined();
  });

  it('never locks a start onto a start or an end onto an end, nor onto its own edges, nor so the clip is empty', () => {
    expect(snapDraggedEdge({ pointerPx: px(12.2), edge: 'start', clips, currentIndex: 1, toPx })).toBeUndefined();
    expect(snapDraggedEdge({ pointerPx: px(30.3), edge: 'end', clips, currentIndex: 1, toPx })).toBeUndefined();
    // Clip 3's start dragged right up to... nothing ends after its own end: no lock.
    expect(snapDraggedEdge({ pointerPx: px(29.9), edge: 'start', clips, currentIndex: 2, toPx })).toBeUndefined();
    // Clip 1's end dragged back near 0: no later start there.
    expect(snapDraggedEdge({ pointerPx: px(0.2), edge: 'end', clips, currentIndex: 0, toPx })).toBeUndefined();
  });

  it('measures on screen, so zoomed in it needs the pointer closer in time', () => {
    const zoomed = (at: number) => at * 100;
    expect(snapDraggedEdge({ pointerPx: zoomed(10.5), edge: 'start', clips, currentIndex: 1, toPx: zoomed })).toBeUndefined();
    expect(snapDraggedEdge({ pointerPx: zoomed(10.05), edge: 'start', clips, currentIndex: 1, toPx: zoomed })).toBe(10);
  });

  it('compares the pointer with the edges in the layout it is given', () => {
    // A layout where clip 3's start is at 135 px: a pointer at 160 px is 25 px away.
    const rescaled = (at: number) => (at === 25 ? 135 : at * 10);
    expect(snapDraggedEdge({ pointerPx: 160, edge: 'end', clips, currentIndex: 1, toPx: rescaled })).toBeUndefined();
    expect(snapDraggedEdge({ pointerPx: 137, edge: 'end', clips, currentIndex: 1, toPx: rescaled })).toBe(25);
  });
});
