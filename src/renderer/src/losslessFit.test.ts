import { describe, expect, it } from 'vitest';

import { canCopyLosslessly, estimateLosslessCopy, maxLosslessLeadIn } from './losslessFit';
import type { Packet } from './ffmpeg';

const copyable = { playbackRate: 1, cropped: false, hasText: false, audioGainDb: undefined, hasAudio: true, rotation: undefined, controlMode: 'simple' as const, resolution: 'auto' as const, fps: 'auto' as const, videoCodec: 'av1', audioCodec: 'aac' };

describe('canCopyLosslessly', () => {
  it('copies a plain clip of a recording Discord plays', () => {
    expect(canCopyLosslessly(copyable)).toBe(true);
    expect(canCopyLosslessly({ ...copyable, videoCodec: 'h264', resolution: 'source', fps: 'source' })).toBe(true);
    expect(canCopyLosslessly({ ...copyable, hasAudio: false, audioCodec: undefined })).toBe(true);
    expect(canCopyLosslessly({ ...copyable, audioGainDb: 0.001 })).toBe(true);
  });

  it('encodes when the clip changes the picture or the sound', () => {
    expect(canCopyLosslessly({ ...copyable, playbackRate: 4 })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, cropped: true })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, hasText: true })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, audioGainDb: -6 })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, rotation: 90 })).toBe(false);
  });

  it('encodes when a size, frame rate or encoder was picked, or the codecs might not play', () => {
    expect(canCopyLosslessly({ ...copyable, resolution: '720p' })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, fps: '30fps' })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, controlMode: 'advanced' })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, videoCodec: 'hevc' })).toBe(false);
    expect(canCopyLosslessly({ ...copyable, audioCodec: 'pcm_s16le' })).toBe(false);
  });
});

describe('estimateLosslessCopy', () => {
  // 30 fps video with a keyframe every second (as NVIDIA records), 100 bytes a frame; audio, 10 bytes every 1/50 s.
  const packets: Packet[] = [
    ...Array.from({ length: 300 }, (_, i) => ({ streamIndex: 0, time: i / 30, size: 100, keyframe: i % 30 === 0 })),
    ...Array.from({ length: 500 }, (_, i) => ({ streamIndex: 1, time: i / 50, size: 10, keyframe: true })),
    // A subtitle stream the export leaves out.
    { streamIndex: 2, time: 3, size: 99999, keyframe: true },
  ];

  it('starts on the keyframe before the clip and counts what is copied', () => {
    const estimate = estimateLosslessCopy({ packets, videoStreamIndex: 0, audioStreamIndex: 1, start: 2.5, end: 4 });
    expect(estimate?.copyStart).toBe(2);
    // Video 2.0 s to 4.0 s is 60 frames, audio 100 packets, each plus the index, plus the headers.
    expect(estimate?.bytes).toBe(60 * 100 + 100 * 10 + 160 * 16 + 16 * 1024);
  });

  it('starts right on a keyframe that is the clip start', () => {
    expect(estimateLosslessCopy({ packets, videoStreamIndex: 0, audioStreamIndex: undefined, start: 3, end: 4 })?.copyStart).toBe(3);
  });

  it('gives up when the keyframe before is too far back or not read', () => {
    const sparse = packets.filter((packet) => packet.streamIndex !== 0 || packet.time < 0.01 || packet.time > 5);
    expect(estimateLosslessCopy({ packets: sparse, videoStreamIndex: 0, audioStreamIndex: 1, start: maxLosslessLeadIn + 0.5, end: 4 })).toBeUndefined();
    expect(estimateLosslessCopy({ packets: packets.filter((packet) => packet.streamIndex !== 0), videoStreamIndex: 0, audioStreamIndex: 1, start: 2.5, end: 4 })).toBeUndefined();
  });
});
