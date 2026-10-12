import { describe, expect, it } from 'vitest';

import { getAudioTempoFilter, getPreviewSegmentSpeed, getSegmentOutputDuration, getSegmentPlaybackRate, getSegmentSpeed, getSpeedForOutputDuration, isSegmentSpeedValid } from './segmentSpeed';
import { createSegment, mapSaveableSegments } from './segments';
import { llcProjectV3Schema } from './types';

describe('segment speed', () => {
  it('keeps old segments at normal speed and rejects invalid speeds', () => {
    expect(getSegmentSpeed({})).toBe(1);
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.24, 4.01]) {
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
    expect(getSpeedForOutputDuration(10, 100)).toBe(0.25);
    expect(getSpeedForOutputDuration(10, 1)).toBe(4);
    expect(getSpeedForOutputDuration(10, 0)).toBe(4);
    expect(getSpeedForOutputDuration(10, -5)).toBe(4);
  });

  it('snaps close drags back to normal speed', () => {
    expect(getSpeedForOutputDuration(10, 10.2)).toBe(1);
    expect(getSpeedForOutputDuration(10, 9.8)).toBe(1);
    expect(getSpeedForOutputDuration(10, 10.5)).toBe(0.95);
    expect(getSpeedForOutputDuration(0, 5)).toBe(1);
  });
});
