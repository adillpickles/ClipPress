import { describe, expect, it } from 'vitest';

import { getFilmstripArgs, getFilmstripChunks, getFilmstripInterval, pairFrames, parseShowinfoTimes, splitJpegStream } from './filmstrip';

describe('filmstrip', () => {
  it('uses one frame a second for short recordings and fewer for long ones', () => {
    expect(getFilmstripInterval(90)).toBe(1);
    expect(getFilmstripInterval(3600)).toBe(15);
  });

  it('splits long recordings into stretches', () => {
    expect(getFilmstripChunks(90)).toEqual([{ from: 0, length: 90 }]);
    expect(getFilmstripChunks(1500)).toEqual([{ from: 0, length: 600 }, { from: 600, length: 600 }, { from: 1200, length: 300 }]);
  });

  it('decodes keyframes only and keeps the file timestamps', () => {
    const args = getFilmstripArgs({ filePath: 'a.mp4', from: 600, length: 600, interval: 15, hwaccelArgs: ['-hwaccel', 'auto'] });
    expect(args.slice(args.indexOf('-skip_frame'), args.indexOf('-skip_frame') + 2)).toEqual(['-skip_frame', 'nokey']);
    expect(args).toContain('-copyts');
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args.indexOf('-hwaccel')).toBeLessThan(args.indexOf('-i'));
    expect(args.at(-1)).toBe('-');
    expect(getFilmstripArgs({ filePath: 'a.mp4', from: 0, length: 90, interval: 1, hwaccelArgs: [] })).not.toContain('-ss');
  });

  it('splits concatenated JPEGs', () => {
    const jpeg = (n: number) => [0xFF, 0xD8, 0xFF, 0xE0, n, n, 0xFF, 0xD9];
    const bytes = new Uint8Array([...jpeg(1), ...jpeg(2), ...jpeg(3)]);
    const parts = splitJpegStream(bytes);
    expect(parts).toHaveLength(3);
    expect([...parts[1]!]).toEqual(jpeg(2));
    expect(splitJpegStream(new Uint8Array([1, 2, 3]))).toEqual([]);
  });

  it('reads frame times from showinfo', () => {
    const stderr = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'a.mp4\':',
      '[Parsed_showinfo_2 @ 0000] n:   0 pts:      0 pts_time:0       duration:  512 fmt:yuvj420p',
      '[Parsed_showinfo_2 @ 0000] n:   1 pts:  15360 pts_time:1.000   duration:  512',
      '[Parsed_showinfo_2 @ 0000]   color_range:pc color_space:bt709',
      '[Parsed_showinfo_2 @ 0000] n:   2 pts:  30720 pts_time:2.5     duration:  512',
    ].join('\n');
    expect(parseShowinfoTimes(stderr)).toEqual([0, 1, 2.5]);
  });

  it('pairs frames with times, never misplacing them', () => {
    const imgs = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const frames = pairFrames(imgs, [10.5, 11.5], 0.5, (img) => `u${img[0]}`);
    expect(frames).toEqual([{ time: 10, url: 'u1' }, { time: 11, url: 'u2' }]);
  });
});
