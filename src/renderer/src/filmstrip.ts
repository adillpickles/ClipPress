/**
 * Timeline filmstrip: small frames from one keyframes-only FFmpeg pass per stretch of the recording. Kept in
 * memory for the open recording only (blob URLs), freed when it closes; nothing is cached on disk.
 */

/** Aim for about this many frames across the whole recording. */
export const filmstripTargetCount = 240;
/** Frames are this tall; plenty for a 64 px lane on a 2x display. */
export const filmstripHeight = 96;
/** Recordings longer than this are done in stretches of this length, so the strip fills in progressively. */
export const filmstripChunkSeconds = 600;

/** Seconds between frames: one per keyframe for short recordings, sparser for long ones. */
export function getFilmstripInterval(duration: number) {
  return Math.max(1, duration / filmstripTargetCount);
}

export function getFilmstripChunks(duration: number) {
  const chunks: { from: number, length: number }[] = [];
  for (let from = 0; from < duration; from += filmstripChunkSeconds) {
    chunks.push({ from, length: Math.min(filmstripChunkSeconds, duration - from) });
  }
  return chunks;
}

/** FFmpeg arguments for one stretch. `-copyts` keeps the file's timestamps, which showinfo prints per frame. */
export function getFilmstripArgs({ filePath, from, length, interval, hwaccelArgs }: {
  filePath: string,
  from: number,
  length: number,
  interval: number,
  hwaccelArgs: string[],
}) {
  // Keyframes only, then at most one frame per `interval` seconds.
  const select = `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${interval.toFixed(3)})'`;
  return [
    '-hide_banner',
    '-nostats',
    ...hwaccelArgs,
    '-skip_frame', 'nokey',
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    '-copyts',
    '-t', length.toFixed(3),
    '-i', filePath,
    '-map', '0:v:0',
    '-an', '-sn', '-dn',
    '-vf', `${select},scale=-2:${filmstripHeight},showinfo`,
    '-fps_mode', 'passthrough',
    '-f', 'image2pipe',
    '-c:v', 'mjpeg',
    '-q:v', '6',
    '-',
  ];
}

/** Splits FFmpeg's concatenated JPEG output into single images (each starts with FF D8 FF). */
export function splitJpegStream(bytes: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i + 2 < bytes.length; i += 1) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) starts.push(i);
  }
  return starts.map((start, i) => bytes.subarray(start, starts[i + 1] ?? bytes.length));
}

/** The frame times showinfo printed, in output order. */
export function parseShowinfoTimes(stderr: string): number[] {
  const times: number[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const match of stderr.matchAll(/Parsed_showinfo[^\n]*?\bpts_time:\s*(-?[\d.]+)/g)) {
    const time = Number.parseFloat(match[1]!);
    if (Number.isFinite(time)) times.push(time);
  }
  return times;
}

export interface FilmstripFrame {
  /** Seconds from the start of the recording (as the player counts it). */
  time: number,
  url: string,
}

/** Pairs images with their times; a count mismatch keeps the shorter list rather than misplacing frames. */
export function pairFrames(images: readonly Uint8Array[], times: readonly number[], timeOffset: number, makeUrl: (image: Uint8Array) => string): FilmstripFrame[] {
  const count = Math.min(images.length, times.length);
  const frames: FilmstripFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    frames.push({ time: Math.max(0, times[i]! - timeOffset), url: makeUrl(images[i]!) });
  }
  return frames;
}
