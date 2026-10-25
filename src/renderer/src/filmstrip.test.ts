import { describe, expect, it } from 'vitest';

import { FilmstripStreamReader, MultipartJpegReader, fadeInArrivingFrame, getDetailRequest, getFilmTiles, getFilmstripArgs, getFilmstripChunks, getFilmstripDetailArgs, getFilmstripFallbackArgs, getFilmstripFrameHeight, getFilmstripInterval, getFrameAt, hasEveryKeyframe, isCovered, mergeRanges, parseShowinfoLine, servesView } from './filmstrip';

const encoder = new TextEncoder();
const part = (image: number[], withLength = true) => [
  ...encoder.encode(`--ffmpeg\r\nContent-type: image/jpeg\r\n${withLength ? `Content-length: ${image.length}\r\n` : ''}\r\n`),
  ...image,
  ...encoder.encode('\r\n--ffmpeg\r\n'),
];
// JPEG-ish bytes, including the header's end marker, which the length must make it skip over.
const jpeg = (n: number) => [0xFF, 0xD8, 13, 10, 13, 10, n, n, 0xFF, 0xD9];

function feed<T>(push: (chunk: Uint8Array) => T[], bytes: number[], chunkSize: number) {
  const out: T[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) out.push(...push(new Uint8Array(bytes.slice(i, i + chunkSize))));
  return out;
}

describe('filmstrip', () => {
  it('uses one frame a second for short recordings and fewer for long ones', () => {
    expect(getFilmstripInterval(90)).toBe(1);
    expect(getFilmstripInterval(3600)).toBe(15);
  });

  it('splits long recordings into stretches, without a tiny one at the end', () => {
    expect(getFilmstripChunks(90)).toEqual([{ from: 0, length: 90 }]);
    expect(getFilmstripChunks(1500)).toEqual([{ from: 0, length: 600 }, { from: 600, length: 600 }, { from: 1200, length: 300 }]);
    expect(getFilmstripChunks(1210)).toEqual([{ from: 0, length: 600 }, { from: 600, length: 610 }]);
  });

  it('makes frames sharp for the display', () => {
    expect(getFilmstripFrameHeight(1)).toBe(96);
    expect(getFilmstripFrameHeight(1.5)).toBe(96);
    expect(getFilmstripFrameHeight(2)).toBe(112);
    expect(getFilmstripFrameHeight(4)).toBe(160);
  });

  it('decodes only the keyframes it shows, and sends each image as it is made', () => {
    const args = getFilmstripArgs({ filePath: 'a.mp4', from: 600, length: 600, interval: 15, height: 96 });
    const input = args.indexOf('-i');
    // Read straight through, unless asked to skip to the keyframes.
    expect(args).not.toContain('-discard:v');
    const keyframesOnly = getFilmstripArgs({ filePath: 'a.mp4', from: 600, length: 600, interval: 15, height: 96, keyframesOnly: true });
    expect(keyframesOnly.slice(keyframesOnly.indexOf('-discard:v'), keyframesOnly.indexOf('-discard:v') + 2)).toEqual(['-discard:v', 'nokey']);
    expect(keyframesOnly.indexOf('-discard:v')).toBeLessThan(keyframesOnly.indexOf('-i'));
    expect(args[args.indexOf('-bsf:v') + 1]).toMatch(/^noise=drop='if\(key\*.*15\.000/);
    expect(args.indexOf('-bsf:v')).toBeLessThan(input);
    expect(args.indexOf('-ss')).toBeLessThan(input);
    expect(args).toContain('-copyts');
    expect(args).not.toContain('-hwaccel');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=w=trunc(96*dar/2)*2:h=96,setsar=1,showinfo');
    expect(args.slice(-3)).toEqual(['-f', 'mpjpeg', '-']);
    expect(getFilmstripArgs({ filePath: 'a.mp4', from: 0, length: 90, interval: 1, height: 96 })).not.toContain('-ss');
  });

  it('has a way for FFmpeg builds that cannot pick packets', () => {
    const args = getFilmstripFallbackArgs({ filePath: 'a.mp4', from: 0, length: 90, interval: 1, height: 96 });
    expect(args).not.toContain('-bsf:v');
    expect(args.slice(args.indexOf('-skip_frame'), args.indexOf('-skip_frame') + 2)).toEqual(['-skip_frame', 'nokey']);
    expect(args[args.indexOf('-vf') + 1]).toMatch(/^select=.*0\.800.*,scale=/);
  });

  it('decodes every frame of a zoomed-in window', () => {
    const args = getFilmstripDetailArgs({ filePath: 'a.mp4', from: 61.5, length: 4, spacing: 0.125, height: 96 });
    expect(args).not.toContain('-discard:v');
    expect(args).not.toContain('-skip_frame');
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2)).toEqual(['-ss', '61.500']);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-vf') + 1]).toContain(String.raw`gte(t-prev_selected_t\,0.1250)`);
  });

  it('reads multipart JPEGs however the bytes arrive', () => {
    const bytes = [...part(jpeg(1)), ...part(jpeg(2)), ...part(jpeg(3))];
    [1, 3, 7, 64, bytes.length].forEach((chunkSize) => {
      const reader = new MultipartJpegReader();
      const images = feed((chunk) => reader.push(chunk), bytes, chunkSize);
      expect(images.map((image) => [...image])).toEqual([jpeg(1), jpeg(2), jpeg(3)]);
    });
  });

  it('reads multipart JPEGs without lengths', () => {
    const reader = new MultipartJpegReader();
    const images = feed((chunk) => reader.push(chunk), [...part([1, 2, 3], false), ...part([4, 5], false)], 5);
    expect(images.map((image) => [...image])).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('reads frame times and sizes from showinfo', () => {
    expect(parseShowinfoLine('[Parsed_showinfo_3 @ 0000] n:   1 pts:  15360 pts_time:1.05    duration:    256 fmt:yuv420p cl:unspecified sar:1/1 s:170x96 i:P iskey:1')).toEqual({ time: 1.05, width: 170, height: 96 });
    expect(parseShowinfoLine('[Parsed_showinfo_3 @ 0000] n:   0 pts: 0 pts_time:0 duration: 512')).toEqual({ time: 0, width: undefined, height: undefined });
    expect(parseShowinfoLine('[Parsed_showinfo_3 @ 0000] config in time_base: 1/15360, frame_rate: 60/1')).toBeUndefined();
    expect(parseShowinfoLine('[Parsed_showinfo_3 @ 0000]   color_range:pc color_space:bt709')).toBeUndefined();
  });

  it('pairs images with times as both arrive, in either order', () => {
    const line = (time: number) => `[Parsed_showinfo_2 @ 0] n: 0 pts: 0 pts_time:${time} duration: 1 s:128x96`;
    const reader = new FilmstripStreamReader(0.5);
    const firstImage = new Uint8Array(part(jpeg(1)));
    expect(reader.push(firstImage.subarray(0, 30), [])).toEqual([]);
    expect(reader.push(firstImage.subarray(30), [])).toEqual([]);
    const first = reader.push(new Uint8Array(0), [line(10.5), line(11.5)]);
    expect(first.map(({ time, aspect }) => ({ time, aspect }))).toEqual([{ time: 10, aspect: 128 / 96 }]);
    expect([...first[0]!.image]).toEqual(jpeg(1));
    expect(reader.push(new Uint8Array(part(jpeg(2))), []).map((frame) => frame.time)).toEqual([11]);
    expect(reader.push(new Uint8Array(0), ['[Parsed_showinfo_2 @ 0] config in time_base: 1/15360'])).toEqual([]);
  });

  it('finds the frame on screen at a time', () => {
    const frames = [{ time: 1 }, { time: 2 }, { time: 3 }];
    expect(getFrameAt(frames, 0.2)).toBe(frames[0]);
    expect(getFrameAt(frames, 1.99)).toBe(frames[0]);
    expect(getFrameAt(frames, 2)).toBe(frames[1]);
    expect(getFrameAt(frames, 99)).toBe(frames[2]);
    expect(getFrameAt([], 1)).toBeUndefined();
  });

  it('keeps track of what has been read', () => {
    const ranges = mergeRanges([{ from: 10, to: 20 }, { from: 0, to: 5 }, { from: 4, to: 8 }, { from: 20, to: 25 }]);
    expect(ranges).toEqual([{ from: 0, to: 8 }, { from: 10, to: 25 }]);
    expect(isCovered(ranges, 9)).toBe(false);
    expect(isCovered(ranges, 25)).toBe(true);
  });

  it('lays tiles on one grid from the lane start, each with the frame at its middle', () => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((time) => ({ time, url: `f${time}` }));
    // 10 s over 1000 px: 100 px a second; tiles of 72.5 px.
    const tiles = getFilmTiles({ frames, covered: [{ from: 0, to: 6 }], tileWidth: 72.5, fromPx: 150, toPx: 1200, lanePx: 1000, pxToTime: (px) => px / 100 });
    expect(tiles[0]).toEqual({ left: 145, width: 73, url: 'f1' });
    // Side by side, no gaps.
    tiles.slice(1).forEach((tile, i) => expect(tile.left).toBe(tiles[i]!.left + tiles[i]!.width));
    // Not read yet past 6 s.
    expect(tiles.find((tile) => tile.left === 580)?.url).toBeUndefined();
    // The last tile runs past the lane's end; its frame is from the part that shows.
    expect(tiles.at(-1)).toMatchObject({ left: 943 });
    expect(tiles.at(-1)!.left + tiles.at(-1)!.width).toBeGreaterThan(1000);
    expect(getFilmTiles({ frames, covered: [], tileWidth: 0, fromPx: 0, toPx: 100, lanePx: 1000, pxToTime: (px) => px })).toEqual([]);
  });

  it('fades in only a frame that is arriving, not one already on screen', () => {
    const fade = fadeInArrivingFrame('arriving');
    const img = (complete: boolean) => {
      const classes: string[] = [];
      return { complete, classList: { add: (name: string) => classes.push(name) }, classes };
    };
    const arriving = img(false);
    const shown = img(true);
    fade(arriving as unknown as HTMLImageElement);
    fade(shown as unknown as HTMLImageElement);
    fade(null);
    expect(arriving.classes).toEqual(['arriving']);
    expect(shown.classes).toEqual([]);
  });

  it('asks for denser frames only when zoomed in past the default ones', () => {
    const baseFrames = Array.from({ length: 120 }, (_, i) => ({ time: i }));
    // Fit: 17 tiles over 120 s.
    expect(getDetailRequest({ view: { from: 0, to: 120, tileSeconds: 7 }, baseFrames, duration: 120 })).toBeUndefined();
    // About a tile per keyframe: still fine.
    expect(getDetailRequest({ view: { from: 50, to: 65, tileSeconds: 0.9 }, baseFrames, duration: 120 })).toBeUndefined();
    // Two tiles per keyframe would show each twice.
    expect(getDetailRequest({ view: { from: 60, to: 68, tileSeconds: 0.5 }, baseFrames, duration: 120 })?.spacing).toBe(0.5);
    const wanted = getDetailRequest({ view: { from: 60, to: 64, tileSeconds: 0.24 }, baseFrames, duration: 120 })!;
    expect(wanted).toMatchObject({ spacing: 0.125, keyframes: false });
    expect(wanted.from).toBeCloseTo(59.4);
    expect(wanted.to).toBeCloseTo(64.6);
    // At the deepest zoom, every frame.
    expect(getDetailRequest({ view: { from: 60, to: 60.007, tileSeconds: 0.0004 }, baseFrames, duration: 120 })!.spacing).toBe(1 / 128);
    // A long window (a long recording's sparse strip) gets its keyframes rather than every frame decoded.
    const hour = Array.from({ length: 240 }, (_, i) => ({ time: i * 15 }));
    expect(getDetailRequest({ view: { from: 1800, to: 1856, tileSeconds: 3.1 }, baseFrames: hour, duration: 3600 })).toMatchObject({ spacing: 2, keyframes: true });
    expect(getDetailRequest({ view: { from: 1800, to: 1814, tileSeconds: 0.78 }, baseFrames: hour, duration: 3600 })).toMatchObject({ spacing: 0.5, keyframes: false });

    const view = { from: 60, to: 64, tileSeconds: 0.24 };
    expect(servesView(wanted, view, wanted)).toBe(true);
    expect(servesView(wanted, { from: 60.5, to: 64.5, tileSeconds: 0.24 }, wanted)).toBe(true);
    expect(servesView(wanted, { from: 62, to: 66, tileSeconds: 0.24 }, getDetailRequest({ view: { from: 62, to: 66, tileSeconds: 0.24 }, baseFrames, duration: 120 })!)).toBe(false);
    expect(servesView({ ...wanted, spacing: 0.25 }, view, wanted)).toBe(false);
    // Keyframes only don't serve a window that wants every frame; every frame serves one that wants keyframes.
    expect(servesView({ ...wanted, keyframes: true }, view, wanted)).toBe(false);
    expect(servesView(wanted, view, { ...wanted, keyframes: true })).toBe(true);
  });

  /** The default strip's frames for keyframes `keyframeSeconds` apart, picked as getKeyframePickExpression does. */
  const pickKeyframes = (duration: number, keyframeSeconds: number) => {
    const interval = getFilmstripInterval(duration);
    const tolerance = Math.min(0.2, interval / 5);
    const frames: { time: number }[] = [];
    let due = 0;
    for (let n = 0; n * keyframeSeconds < duration; n += 1) {
      const time = n * keyframeSeconds;
      if (time >= due - tolerance) {
        frames.push({ time });
        due = (Math.floor((time + tolerance) / interval) + 1) * interval;
      }
    }
    return frames;
  };
  /** OBS's default: a keyframe every 250 frames, at 60 fps. */
  const obsKeyframes = 250 / 60;

  it('tells when the default strip already has every keyframe', () => {
    // A keyframe a second: one per interval, other keyframes left out.
    expect(hasEveryKeyframe([pickKeyframes(600, 1)], getFilmstripInterval(600))).toBe(false);
    expect(hasEveryKeyframe([pickKeyframes(300, 1)], getFilmstripInterval(300))).toBe(false);
    // Keyframes further apart than the interval: the strip has them all.
    expect(hasEveryKeyframe([pickKeyframes(120, obsKeyframes)], 1)).toBe(true);
    expect(hasEveryKeyframe([pickKeyframes(600, obsKeyframes)], getFilmstripInterval(600))).toBe(true);
    // An hour: one per 15 s, while there are keyframes every 4 s.
    expect(hasEveryKeyframe([pickKeyframes(3600, obsKeyframes)], getFilmstripInterval(3600))).toBe(false);
    // The gap between two stretches, and a stretch with nothing in it, don't count.
    const stretch = pickKeyframes(600, obsKeyframes);
    expect(hasEveryKeyframe([stretch, [], stretch.map(({ time }) => ({ time: time + 1800 }))], getFilmstripInterval(600))).toBe(true);
    expect(hasEveryKeyframe([pickKeyframes(1200, 1).slice(0, 240), [{ time: 900 }]], getFilmstripInterval(1200))).toBe(false);
    expect(hasEveryKeyframe([], 1)).toBe(false);
  });

  it('decodes every frame of a longer window when the strip already has every keyframe', () => {
    const baseFrames = pickKeyframes(120, obsKeyframes);
    // Zoomed in on a 2-min recording (a 39 s window): its keyframes would only be the strip's again.
    const view = { from: 25, to: 55, tileSeconds: 2.3 };
    expect(getDetailRequest({ view, baseFrames, duration: 120 })).toMatchObject({ keyframes: true });
    expect(getDetailRequest({ view, baseFrames, duration: 120, keyframesInStrip: true })).toMatchObject({ spacing: 2, keyframes: false });
    // Too long to decode all of: the strip's keyframes it is.
    const long = pickKeyframes(600, obsKeyframes);
    expect(getDetailRequest({ view: { from: 100, to: 160, tileSeconds: 2.3 }, baseFrames: long, duration: 600, keyframesInStrip: true })).toBeUndefined();
    // Short windows are decoded in full either way.
    expect(getDetailRequest({ view: { from: 30, to: 40, tileSeconds: 0.8 }, baseFrames, duration: 120, keyframesInStrip: true })).toMatchObject({ keyframes: false });
  });
});
