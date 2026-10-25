/**
 * Timeline filmstrip: small frames of the open recording, kept in memory (blob URLs) for as long as it's open and
 * freed when it closes; nothing is written to disk.
 * - The default strip comes from one pass per stretch of the recording that decodes only the keyframes it shows
 *   (about one per `interval`).
 * - Zoomed in past what those cover, denser frames are made for the visible window (any frame, or for a long
 *   window its keyframes), and dropped again when zooming back out.
 * FFmpeg sends each image as soon as it's made (multipart JPEG, every part with its length) and its time on
 * stderr (showinfo), so frames show up while the pass is still running.
 */

/** Aim for about this many frames across the whole recording. */
export const filmstripTargetCount = 240;
/** Recordings longer than this are done in stretches of this length, a couple at a time, the visible one first. */
export const filmstripChunkSeconds = 600;
/**
 * The strip's tiles are as tall as the clip blocks (Timeline: the clips lane, 64 px, less its top border and the
 * blocks' insets), so a frame fills a tile exactly.
 */
export const filmTileHeight = 53;

/** Frames are this tall: sharp in a tile on this display, at least 96 px. */
export function getFilmstripFrameHeight(devicePixelRatio: number) {
  return Math.min(160, Math.max(96, Math.ceil((filmTileHeight * devicePixelRatio) / 16) * 16));
}

/** Seconds between frames: one per keyframe for short recordings, sparser for long ones. */
export function getFilmstripInterval(duration: number) {
  return Math.max(1, duration / filmstripTargetCount);
}

export function getFilmstripChunks(duration: number) {
  const chunks: { from: number, length: number }[] = [];
  for (let from = 0; from < duration; from += filmstripChunkSeconds) {
    chunks.push({ from, length: Math.min(filmstripChunkSeconds, duration - from) });
  }
  // A short end goes with the stretch before it rather than costing a pass of its own.
  const last = chunks.at(-1);
  const beforeLast = chunks.at(-2);
  if (last != null && beforeLast != null && last.length < filmstripChunkSeconds / 4) {
    chunks.pop();
    beforeLast.length += last.length;
  }
  return chunks;
}

/** Square pixels at the video's displayed shape. */
const getScaleFilter = (height: number) => `scale=w=trunc(${height}*dar/2)*2:h=${height},setsar=1`;
/** Each image as soon as it's made, with its length (MultipartJpegReader); showinfo prints its time and size. */
const outputArgs = ['-fps_mode', 'passthrough', '-c:v', 'mjpeg', '-q:v', '6', '-f', 'mpjpeg', '-'];

/**
 * Picks the keyframes to decode, packet by packet (FFmpeg's noise bitstream filter drops the rest): the first
 * keyframe at or after each multiple of `interval`, remembering the next one due in variable 0.
 * Keyframe times can be a few frames out (variable frame rates, or when only keyframes are read: see
 * getFilmstripArgs); the tolerance keeps that from skipping one.
 */
export function getKeyframePickExpression(interval: number) {
  const i = interval.toFixed(3);
  const tolerance = Math.min(0.2, interval / 5).toFixed(3);
  return `if(key*gte(pts*tb\\,ld(0)-${tolerance})\\,st(0\\,(floor((pts*tb+${tolerance})/${i})+1)*${i})*0\\,1)`;
}

/**
 * FFmpeg arguments for one stretch of the default strip, or a long zoomed-in window's keyframes: only the
 * keyframes picked are decoded (in software, quicker for that than starting a hardware decoder).
 * The file is read straight through: while a recording opens the waveform reads it too, and on a hard disk two
 * passes going the same way cost about one read, where skipping from keyframe to keyframe (`keyframesOnly`) made
 * both much slower; from the disk cache, skipping is only a little quicker (notes/beta6-ux/perf/qa-filmstrip.md).
 * With only keyframes read, MP4 frame times can be a few frames out. `-copyts` keeps the file's timestamps.
 */
export function getFilmstripArgs({ filePath, from, length, interval, height, keyframesOnly = false }: {
  filePath: string,
  from: number,
  length: number,
  interval: number,
  height: number,
  /** Have the demuxer skip everything but keyframes (about a third of the file read): for a pass on its own. */
  keyframesOnly?: boolean,
}) {
  return [
    '-hide_banner',
    '-nostats',
    ...(keyframesOnly ? ['-discard:v', 'nokey'] : []),
    '-bsf:v', `noise=drop='${getKeyframePickExpression(interval)}'`,
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    '-copyts',
    '-t', length.toFixed(3),
    '-i', filePath,
    '-map', '0:v:0',
    '-an', '-sn', '-dn',
    '-vf', `${getScaleFilter(height)},showinfo`,
    ...outputArgs,
  ];
}

/**
 * For an FFmpeg that can't filter packets before decoding (a custom one older than 7): every keyframe is decoded,
 * then at most one per `interval` kept.
 */
export function getFilmstripFallbackArgs({ filePath, from, length, interval, height }: Parameters<typeof getFilmstripArgs>[0]) {
  const select = `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${(interval * 0.8).toFixed(3)})'`;
  return [
    '-hide_banner',
    '-nostats',
    '-skip_frame', 'nokey',
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    '-copyts',
    '-t', length.toFixed(3),
    '-i', filePath,
    '-map', '0:v:0',
    '-an', '-sn', '-dn',
    '-vf', `${select},${getScaleFilter(height)},showinfo`,
    ...outputArgs,
  ];
}

/** Denser frames for a short window when zoomed in: input seeking, every frame decoded, one kept per `spacing`. */
export function getFilmstripDetailArgs({ filePath, from, length, spacing, height }: {
  filePath: string,
  from: number,
  length: number,
  spacing: number,
  height: number,
}) {
  const select = `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${spacing.toFixed(4)})'`;
  return [
    '-hide_banner',
    '-nostats',
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    '-copyts',
    '-t', length.toFixed(3),
    '-i', filePath,
    '-map', '0:v:0',
    '-an', '-sn', '-dn',
    '-vf', `${select},${getScaleFilter(height)},showinfo`,
    ...outputArgs,
  ];
}

function indexOfBytes(bytes: Uint8Array, pattern: readonly number[], from: number) {
  for (let i = from; i + pattern.length <= bytes.length; i += 1) {
    if (pattern.every((byte, j) => bytes[i + j] === byte)) return i;
  }
  return -1;
}

const headerEnd = [13, 10, 13, 10];
/** FFmpeg ends every part with this, the last one too. */
const boundary = [...new TextEncoder().encode('\r\n--ffmpeg\r\n')];

/** Reads FFmpeg's multipart JPEG output (`-f mpjpeg`) as it arrives, returning each image once it's complete. */
export class MultipartJpegReader {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer);
    joined.set(chunk, this.buffer.length);
    const images: Uint8Array[] = [];
    let pos = 0;
    for (;;) {
      const end = indexOfBytes(joined, headerEnd, pos);
      if (end < 0) break;
      const header = new TextDecoder('latin1').decode(joined.subarray(pos, end));
      const dataStart = end + headerEnd.length;
      const lengthMatch = /content-length:\s*(\d+)/i.exec(header);
      let dataEnd: number;
      if (lengthMatch != null) {
        dataEnd = dataStart + Number(lengthMatch[1]);
        if (dataEnd > joined.length) break;
      } else {
        // An FFmpeg that doesn't send lengths: the image ends where the part does.
        dataEnd = indexOfBytes(joined, boundary, dataStart);
        if (dataEnd < 0) break;
      }
      // A copy, so the images don't keep the whole buffer alive.
      images.push(joined.slice(dataStart, dataEnd));
      pos = dataEnd;
    }
    this.buffer = joined.slice(pos);
    return images;
  }
}

/** A frame's time (and size) from a line of showinfo's output, if the line is about a frame. */
export function parseShowinfoLine(line: string) {
  const match = /Parsed_showinfo.*?\bpts_time:\s*(-?[\d.]+)(?:.*?\bs:(\d+)x(\d+))?/.exec(line);
  if (match == null) return undefined;
  const time = Number.parseFloat(match[1]!);
  if (!Number.isFinite(time)) return undefined;
  return { time, width: match[2] != null ? Number(match[2]) : undefined, height: match[3] != null ? Number(match[3]) : undefined };
}

export interface FilmstripFrame {
  /** Seconds from the start of the recording (as the player counts it). */
  time: number,
  url: string,
}

export interface StreamedFrame {
  time: number,
  image: Uint8Array,
  /** Width / height, when FFmpeg said. */
  aspect: number | undefined,
}

/**
 * Pairs the images on stdout with the frame times FFmpeg logs (showinfo, on stderr) as both arrive: in the same
 * order, but not in step. `timeOffset` (the recording's start time) is subtracted: the player starts at 0.
 */
export class FilmstripStreamReader {
  private readonly images = new MultipartJpegReader();

  private readonly pendingImages: Uint8Array[] = [];

  private readonly pendingTimes: { time: number, aspect: number | undefined }[] = [];

  private readonly timeOffset: number;

  constructor(timeOffset: number) {
    this.timeOffset = timeOffset;
  }

  /** New stdout bytes and stderr lines; returns the frames now complete. */
  push(stdout: Uint8Array, stderrLines: readonly string[]): StreamedFrame[] {
    if (stdout.length > 0) this.pendingImages.push(...this.images.push(stdout));
    stderrLines.forEach((line) => {
      const info = parseShowinfoLine(line);
      if (info != null) this.pendingTimes.push({ time: info.time, aspect: info.width != null && info.height ? info.width / info.height : undefined });
    });
    const frames: StreamedFrame[] = [];
    while (this.pendingImages.length > 0 && this.pendingTimes.length > 0) {
      const image = this.pendingImages.shift()!;
      const { time, aspect } = this.pendingTimes.shift()!;
      frames.push({ time: Math.max(0, time - this.timeOffset), image, aspect });
    }
    return frames;
  }
}

export interface TimeRange { from: number, to: number }

/** Sorted, with touching or overlapping ranges joined. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((r) => r.to >= r.from).sort((a, b) => a.from - b.from);
  const merged: TimeRange[] = [];
  sorted.forEach((range) => {
    const last = merged.at(-1);
    if (last != null && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  });
  return merged;
}

export function isCovered(ranges: readonly TimeRange[], time: number) {
  return ranges.some((r) => time >= r.from && time <= r.to);
}

/**
 * The frame on screen at `time`: the last one at or before it (as the player shows it), or the first frame for
 * a time before it. `frames` is sorted by time.
 */
export function getFrameAt<T extends { time: number }>(frames: readonly T[], time: number): T | undefined {
  let lo = 0;
  let hi = frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (frames[mid]!.time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return frames[Math.max(0, found)];
}

export function countFramesBetween(frames: readonly { time: number }[], from: number, to: number) {
  return frames.reduce((count, frame) => count + (frame.time >= from && frame.time <= to ? 1 : 0), 0);
}

export interface FilmTile {
  /** Pixels from the lane's start. */
  left: number,
  width: number,
  url: string | undefined,
}

/**
 * The strip as tiles of the video's shape side by side, for pixels [fromPx, toPx) of a lane `lanePx` wide. Every
 * tile shows the frame at its middle, once that part of the recording has been read. Tiles sit on one grid from
 * the lane's start, so the dim strip and the clip blocks on it line up, at any zoom.
 */
export function getFilmTiles({ frames, covered, tileWidth, fromPx, toPx, lanePx, pxToTime }: {
  frames: readonly FilmstripFrame[],
  covered: readonly TimeRange[],
  tileWidth: number,
  fromPx: number,
  toPx: number,
  lanePx: number,
  pxToTime: (px: number) => number,
}): FilmTile[] {
  if (!(tileWidth > 0) || !(lanePx > 0)) return [];
  const first = Math.max(0, Math.floor(fromPx / tileWidth));
  const end = Math.min(Math.ceil(lanePx / tileWidth), Math.ceil(toPx / tileWidth));
  const tiles: FilmTile[] = [];
  for (let i = first; i < end; i += 1) {
    const left = Math.round(i * tileWidth);
    const right = Math.round((i + 1) * tileWidth);
    // The last tile runs past the lane's end (and is cut off there): its middle is that of the part showing.
    const time = pxToTime((left + Math.min(right, lanePx)) / 2);
    tiles.push({ left, width: right - left, url: isCovered(covered, time) ? getFrameAt(frames, time)?.url : undefined });
  }
  return tiles;
}

/** What the timeline shows: a stretch of the recording, and how much of it one tile spans. */
export interface FilmstripView { from: number, to: number, tileSeconds: number }

export interface DetailRequest {
  from: number,
  to: number,
  spacing: number,
  /** Only the keyframes (as for the default strip, `spacing` apart): the window is too long to decode all of it. */
  keyframes: boolean,
}

/**
 * Every frame is decoded for windows up to this long; a longer one (zoomed in on a long recording, whose default
 * strip is sparse) gets its keyframes, which are quick to read.
 */
export const maxDetailSeconds = 30;

/**
 * Whether the view needs denser frames than the default strip's, and which: when there are clearly fewer default
 * frames in view than tiles (so frames would repeat), at least one per tile (a power of two of seconds, so small
 * zoom changes don't ask again) for the view and a small margin around it.
 */
export function getDetailRequest({ view, baseFrames, duration }: {
  view: FilmstripView,
  baseFrames: readonly { time: number }[],
  duration: number,
}): DetailRequest | undefined {
  const length = view.to - view.from;
  if (!(length > 0) || !(view.tileSeconds > 0)) return undefined;
  const tiles = length / view.tileSeconds;
  if (countFramesBetween(baseFrames, view.from, view.to) >= tiles * 0.75) return undefined;
  const margin = length * 0.15;
  const from = Math.max(0, view.from - margin);
  const to = Math.min(duration, view.to + margin);
  return { from, to, spacing: Math.max(1 / 128, 2 ** Math.floor(Math.log2(view.tileSeconds))), keyframes: to - from > maxDetailSeconds };
}

/**
 * Whether frames already made (or being made) for `made` serve `view`, for which getDetailRequest asked for
 * `wanted`: as dense (keyframes only don't do for a window that wants every frame), and all of the view that's
 * within the recording.
 */
export function servesView(made: DetailRequest, view: FilmstripView, wanted: DetailRequest) {
  return made.spacing <= wanted.spacing && (wanted.keyframes || !made.keyframes)
    && made.from <= Math.max(0, view.from) && made.to >= Math.min(wanted.to, view.to);
}
