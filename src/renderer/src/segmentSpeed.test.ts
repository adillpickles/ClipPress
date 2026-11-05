import { describe, expect, it } from 'vitest';

import { getAudioTempoFilter, getPreviewSegmentSpeed, getSegmentOutputDuration, getSegmentPlaybackRate, getSegmentSpeed, getSpeedForOutputDuration, isSegmentSpeedValid } from './segmentSpeed';
import { createSegment, mapSaveableSegments } from './segments';
import { getVideoPlaybackRate, stepUserPlaybackRate } from './previewPlaybackRate';
import { llcProjectV3Schema } from './types';

describe('segment speed', () => {
  it('keeps old segments at normal speed and rejects invalid speeds', () => {
    expect(getSegmentSpeed({})).toBe(1);
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.09, 16.01]) {
      expect(isSegmentSpeedValid(speed)).toBe(false);
      expect(getSegmentSpeed({ speed })).toBe(1);
    }
  });

  it('calculates each output duration using both segment and global speed', () => {
    expect(getSegmentOutputDuration({ start: 10, end: 18, speed: 2 })).toBe(4);
    expect(getSegmentOutputDuration({ start: 10, end: 18, speed: 0.5 })).toBe(16);
    expect(getSegmentOutputDuration({ start: 10, end: 18, speed: 2 }, 0.5)).toBe(8);
    expect(getSegmentOutputDuration({ start: 0, speed: 2 }, 1, 20)).toBe(10);
    expect(() => getSegmentPlaybackRate({}, 0)).toThrow();
  });

  it('preserves audio pitch at the full supported speed range', () => {
    expect(getAudioTempoFilter(1)).toBe('');
    expect(getAudioTempoFilter(0.25)).toBe('atempo=0.5,atempo=0.5');
    expect(getAudioTempoFilter(4)).toBe('atempo=2,atempo=2');
    // 10% and 1600%, the ends of the range: every stage within atempo's 0.5-2 (product 0.1 and 16).
    expect(getAudioTempoFilter(0.1)).toBe('atempo=0.5,atempo=0.5,atempo=0.5,atempo=0.8');
    expect(getAudioTempoFilter(16)).toBe('atempo=2,atempo=2,atempo=2,atempo=2');
    expect(getAudioTempoFilter(1.5)).toBe('atempo=1.5');
  });

  it('uses the active repeated segment during preview and resets outside segments', () => {
    const segments = [{ start: 2, end: 6, speed: 2 }, { start: 2, end: 6, speed: 0.5 }];
    expect(getPreviewSegmentSpeed(segments, 0, 3)).toBe(2);
    expect(getPreviewSegmentSpeed(segments, 1, 3)).toBe(0.5);
    expect(getPreviewSegmentSpeed(segments, 1, 7)).toBe(1);
    expect(getPreviewSegmentSpeed([{ start: 0, speed: 2 }], 0, 3, 10)).toBe(1);
  });

  it('round-trips segment speeds through saved projects and keeps old projects readable', () => {
    const segment = { ...createSegment({ start: 3, end: 9, speed: 0.5 }), segColorIndex: 0 };
    const project = llcProjectV3Schema.parse({ version: 3, cutSegments: mapSaveableSegments([segment]) });
    expect(createSegment(project.cutSegments[0]).speed).toBe(0.5);
    expect(llcProjectV3Schema.parse({ version: 3, cutSegments: [{ start: 0, end: 4, name: '' }] }).cutSegments[0]?.speed).toBeUndefined();
    expect(() => llcProjectV3Schema.parse({ version: 3, cutSegments: [{ start: 0, end: 4, name: '', speed: 0 }] })).toThrow();
  });
});

describe('getSpeedForOutputDuration', () => {
  it('slows down when the output is stretched and speeds up when it is shortened', () => {
    expect(getSpeedForOutputDuration(10, 20)).toBe(0.5);
    expect(getSpeedForOutputDuration(10, 4)).toBe(2.5);
    expect(getSpeedForOutputDuration(10, 13.333)).toBe(0.75);
  });

  it('clamps to the supported range, including drags past the segment start', () => {
    expect(getSpeedForOutputDuration(10, 1000)).toBe(0.1);
    expect(getSpeedForOutputDuration(10, 0.5)).toBe(16);
    expect(getSpeedForOutputDuration(10, 0)).toBe(16);
    expect(getSpeedForOutputDuration(10, -5)).toBe(16);
  });

  it('snaps close drags back to normal speed', () => {
    expect(getSpeedForOutputDuration(10, 10.2)).toBe(1);
    expect(getSpeedForOutputDuration(10, 9.8)).toBe(1);
    expect(getSpeedForOutputDuration(10, 10.5)).toBe(0.95);
    expect(getSpeedForOutputDuration(0, 5)).toBe(1);
  });
});

describe('clip speed from 10% to 1600%', () => {
  it('takes both ends of the range, and nothing past them', () => {
    for (const speed of [0.1, 0.25, 4, 8, 16]) expect(isSegmentSpeedValid(speed)).toBe(true);
    expect(getSegmentSpeed({ speed: 16 })).toBe(16);
    expect(getSegmentSpeed({ speed: 0.1 })).toBe(0.1);
  });

  it('turns a dragged length into a speed within the range', () => {
    expect(getSpeedForOutputDuration(16, 1)).toBe(16);
    expect(getSpeedForOutputDuration(16, 0.5)).toBe(16);
    expect(getSpeedForOutputDuration(10, 100)).toBe(0.1);
    expect(getSpeedForOutputDuration(10, 1000)).toBe(0.1);
    expect(getSpeedForOutputDuration(16, 0)).toBe(16);
  });

  it('saves and loads 1600% and 10% clips in projects', () => {
    for (const speed of [0.1, 16]) {
      const segment = { ...createSegment({ start: 3, end: 9, speed }), segColorIndex: 0 };
      const project = llcProjectV3Schema.parse({ version: 3, mediaFileName: 'a.mp4', cutSegments: mapSaveableSegments([segment]) });
      expect(project.cutSegments[0]?.speed).toBe(speed);
    }
    // A speed from a newer version plays at 100% here, rather than the whole project failing to open.
    const fromNewer = llcProjectV3Schema.parse({ version: 3, mediaFileName: 'a.mp4', cutSegments: [{ start: 0, end: 1, name: '', speed: 32 }] });
    expect(getSegmentSpeed(fromNewer.cutSegments[0]!)).toBe(1);
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => llcProjectV3Schema.parse({ version: 3, mediaFileName: 'a.mp4', cutSegments: [{ start: 0, end: 1, name: '', speed }] })).toThrow();
    }
  });
});

describe('preview playback rate', () => {
  it('never asks the video for more than 16× or less than 1/16×, whatever the clip and J/L ask', () => {
    expect(getVideoPlaybackRate({ userRate: 1, speeds: 16 })).toBe(16);
    expect(getVideoPlaybackRate({ userRate: 2, speeds: 16 })).toBe(16);
    expect(getVideoPlaybackRate({ userRate: 8, speeds: 4 })).toBe(16);
    expect(getVideoPlaybackRate({ userRate: 0.5, speeds: 0.1 })).toBe(1 / 16);
    expect(getVideoPlaybackRate({ userRate: 1.5, speeds: 2 })).toBe(3);
  });

  it("steps J and L's own factor, up to 8×, whatever the capped rate the video plays at", () => {
    // Three L presses: 2×.
    let userRate = 1;
    for (let i = 0; i < 3; i += 1) userRate = stepUserPlaybackRate({ userRate, direction: 1 });
    expect(userRate).toBeCloseTo(2, 5);
    // In a 1600% clip the video is capped at 16×; one more L is still a step up of J and L's own factor...
    expect(getVideoPlaybackRate({ userRate, speeds: 16 })).toBe(16);
    userRate = stepUserPlaybackRate({ userRate, direction: 1 });
    expect(userRate).toBeCloseTo(2 ** (4 / 3), 5);
    // ...so a 100% clip after it plays at that, not at a factor worked back from 16×.
    expect(getVideoPlaybackRate({ userRate, speeds: 1 })).toBeCloseTo(2 ** (4 / 3), 5);
    for (let i = 0; i < 20; i += 1) userRate = stepUserPlaybackRate({ userRate, direction: 1 });
    expect(userRate).toBe(8);
  });

  it('slows J down from its own factor in a 10% clip, never speeding up', () => {
    let userRate = 1;
    for (let i = 0; i < 3; i += 1) userRate = stepUserPlaybackRate({ userRate, direction: -1 });
    expect(userRate).toBeCloseTo(0.5, 5);
    // In a 25% clip (0.125×, above the 1/16 floor) one more J plays slower still.
    const before = getVideoPlaybackRate({ userRate, speeds: 0.25 });
    userRate = stepUserPlaybackRate({ userRate, direction: -1 });
    expect(getVideoPlaybackRate({ userRate, speeds: 0.25 })).toBeLessThan(before);
    expect(userRate).toBeLessThan(0.5);
    // In a 10% clip J only ever slows down or stays at the floor.
    expect(getVideoPlaybackRate({ userRate, speeds: 0.1 })).toBe(1 / 16);
  });
});
