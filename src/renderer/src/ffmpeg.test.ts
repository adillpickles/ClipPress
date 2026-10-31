import { beforeAll, describe, expect, test, vi } from 'vitest';

import type * as FfmpegModule from './ffmpeg';

// The module reaches Electron through `window.require` as it loads; these tests only use its pure helpers.
let ffmpeg: typeof FfmpegModule;
beforeAll(async () => {
  const electronStub: object = new Proxy(() => electronStub, { get: (_target, key) => (key === 'then' ? undefined : electronStub) });
  vi.stubGlobal('window', { require: () => electronStub, process: {} });
  ffmpeg = await import('./ffmpeg');
});

describe('findNearestKeyFrameTime', () => {
  const frames = [0, 1, 1.5, 2, 3].map((time) => ({ time, keyframe: time % 1 === 0, createdAt: new Date(0) }));

  test('a keyframe exactly at the time is the nearest one', () => {
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 2, direction: -1 })).toBe(2);
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 2, direction: 1 })).toBe(2);
  });

  test('a keyframe just before or after the time', () => {
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 2.01, direction: -1 })).toBe(2);
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 1.99, direction: 1 })).toBe(2);
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 1.5, direction: -1 })).toBe(1);
  });

  test('none in that direction', () => {
    expect(ffmpeg.findNearestKeyFrameTime({ frames, time: 3.5, direction: 1 })).toBeUndefined();
    expect(ffmpeg.findNearestKeyFrameTime({ frames: [], time: 1, direction: -1 })).toBeUndefined();
  });
});
