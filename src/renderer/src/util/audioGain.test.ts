import { describe, expect, it } from 'vitest';

import { combineAudioGain, dbToPercent, getVolumeFilter, isClipVolumeChanged, minAudioGainDb, percentToDb, sanitizeClipGainDb } from './audioGain';
import { createSegment, mapSaveableSegments } from '../segments';
import { buildSegmentConcatFilters } from '../exportSegmentMath';
import { getClipVolumeFactorAt } from '../hooks/usePreviewAudioGain';
import { llcProjectV3Schema } from '../types';

describe('clip volume', () => {
  it('converts the slider percentage to dB and back', () => {
    expect(percentToDb(100)).toBe(0);
    expect(percentToDb(200)).toBe(6.02);
    expect(percentToDb(50)).toBe(-6.02);
    expect(dbToPercent(6.02)).toBe(200);
    expect(dbToPercent(-6.02)).toBe(50);
    for (const percent of [1, 7, 33, 99, 101, 150, 199]) expect(dbToPercent(percentToDb(percent))).toBe(percent);
  });

  it('adds the clip volume to the track volume, and either one muted means silence', () => {
    expect(combineAudioGain(undefined, undefined)).toBe(0);
    expect(combineAudioGain(3, { audioGainDb: -6 })).toBe(-3);
    expect(combineAudioGain(3, { audioGainDb: 6, audioMuted: true })).toBe(minAudioGainDb);
    // A boost on the clip must not bring a muted track back.
    expect(combineAudioGain(minAudioGainDb, { audioGainDb: 6 })).toBe(minAudioGainDb);
    expect(combineAudioGain(-45, { audioGainDb: -12 })).toBe(minAudioGainDb);
    expect(getVolumeFilter(combineAudioGain(3, { audioMuted: true }))).toBe('volume=0');
    expect(getVolumeFilter(combineAudioGain(3, { audioGainDb: -6.02 }))).toBe('volume=-3.02dB');
  });

  it('only counts a real change', () => {
    expect(isClipVolumeChanged({})).toBe(false);
    expect(isClipVolumeChanged({ audioGainDb: 0.001 })).toBe(false);
    expect(isClipVolumeChanged({ audioGainDb: -6.02 })).toBe(true);
    expect(isClipVolumeChanged({ audioMuted: true })).toBe(true);
    expect(isClipVolumeChanged({ audioMuted: false })).toBe(false);
  });

  it('keeps odd saved values usable instead of rejecting them', () => {
    expect(sanitizeClipGainDb(-6)).toBe(-6);
    expect(sanitizeClipGainDb(0)).toBeUndefined();
    expect(sanitizeClipGainDb(Number.NaN)).toBeUndefined();
    expect(sanitizeClipGainDb('-6')).toBeUndefined();
    expect(sanitizeClipGainDb(400)).toBe(50);
    expect(sanitizeClipGainDb(-400)).toBe(-50);
  });

  it('is saved with its clip, only when changed, and survives a split-style copy', () => {
    const quieter = { ...createSegment({ start: 0, end: 4, audioGainDb: -6.02 }), segColorIndex: 0 };
    const muted = { ...createSegment({ start: 4, end: 8, audioGainDb: 3, audioMuted: true }), segColorIndex: 1 };
    const plain = { ...createSegment({ start: 8, end: 9, audioGainDb: 0, audioMuted: false }), segColorIndex: 2 };
    const saved = mapSaveableSegments([quieter, muted, plain]);
    expect(saved[0]).toMatchObject({ audioGainDb: -6.02 });
    expect(saved[0]).not.toHaveProperty('audioMuted');
    expect(saved[1]).toMatchObject({ audioGainDb: 3, audioMuted: true });
    expect(saved[2]).not.toHaveProperty('audioGainDb');
    expect(saved[2]).not.toHaveProperty('audioMuted');

    const project = llcProjectV3Schema.parse({ version: 3, cutSegments: saved });
    const reopened = project.cutSegments.map((segment) => createSegment(segment));
    expect(reopened[0]?.audioGainDb).toBe(-6.02);
    expect(reopened[1]?.audioMuted).toBe(true);
    expect(reopened[2]?.audioGainDb).toBeUndefined();
  });

  it('does not reject a project because of an odd volume', () => {
    const project = llcProjectV3Schema.parse({ version: 3, cutSegments: [{ start: 0, end: 4, name: '', audioGainDb: 999, audioMuted: false }] });
    const segment = createSegment(project.cutSegments[0]);
    expect(segment.audioGainDb).toBe(50);
    expect(segment.audioMuted).toBeUndefined();
  });

  it('changes each clip in a merged target-size export, leaving the track volume for after the concat', () => {
    const { graph } = buildSegmentConcatFilters({
      segments: [{ start: 0, end: 2, audioGainDb: -6.02 }, { start: 2, end: 4 }, { start: 4, end: 6, speed: 2, audioMuted: true }],
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      outputPlaybackRate: 1,
    });
    expect(graph).toContain('[0:1]asetpts=PTS-STARTPTS,volume=-6.02dB[segmenta0]');
    expect(graph).toContain('[1:1]asetpts=PTS-STARTPTS[segmenta1]');
    expect(graph).toContain('[2:1]asetpts=PTS-STARTPTS,atempo=2,volume=0[segmenta2]');
  });

  it('plays the volume of the clip under the playhead in the preview', () => {
    const clips = [{ start: 2, end: 4, factor: 0.5 }, { start: 6, end: 8, factor: 0 }];
    expect(getClipVolumeFactorAt(clips, 1)).toBe(1);
    expect(getClipVolumeFactorAt(clips, 2)).toBe(0.5);
    expect(getClipVolumeFactorAt(clips, 4)).toBe(1);
    expect(getClipVolumeFactorAt(clips, 7.9)).toBe(0);
  });
});
