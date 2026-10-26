import type { AudioPeaks } from './audioPeaks';

/**
 * The timeline's filmstrip and waveform outlive the recording they were made for, so going back to a recording
 * shows them at once: the last few in memory, and on disk (timelineCacheIo.ts). An entry belongs to the recording as
 * it was: its path, size and modified time, so a changed file is made again.
 */

export function getTimelineCacheKey({ path, size, mtimeMs, caseInsensitive }: { path: string, size: number, mtimeMs: number, caseInsensitive: boolean }) {
  return `${caseInsensitive ? path.toLowerCase() : path}|${size}|${Math.round(mtimeMs)}`;
}

export interface CachedStripFrame {
  /** Seconds from the start of the recording (as the player counts it). */
  time: number,
  url: string,
  /** The image, so it can be written to disk. */
  blob: Blob,
}

export interface CachedStrip {
  frames: readonly CachedStripFrame[],
  /** The frames' width / height. */
  aspect: number | undefined,
}

/**
 * Least recently used entries go first once there are more than `maxEntries`, except those in use (`acquire`): an
 * open recording's frames must stay alive while they're on screen.
 */
export class TimelineMemoryCache<T> {
  // Least recently used first.
  private readonly entries = new Map<string, T>();

  private readonly inUse = new Map<string, number>();

  private readonly maxEntries: number;

  private readonly onEvict: (value: T) => void;

  constructor({ maxEntries, onEvict }: { maxEntries: number, onEvict: (value: T) => void }) {
    this.maxEntries = maxEntries;
    this.onEvict = onEvict;
  }

  get size() {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  has(key: string) {
    return this.entries.has(key);
  }

  /** Takes over `value` (and frees it once it's evicted); one already there for the key is freed now. */
  put(key: string, value: T) {
    const earlier = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, value);
    if (earlier !== undefined && earlier !== value) this.onEvict(earlier);
    this.evict();
  }

  /** It's on screen: kept until released. */
  acquire(key: string) {
    this.inUse.set(key, (this.inUse.get(key) ?? 0) + 1);
  }

  release(key: string) {
    const count = (this.inUse.get(key) ?? 0) - 1;
    if (count > 0) this.inUse.set(key, count);
    else this.inUse.delete(key);
    this.evict();
  }

  private evict() {
    for (const [key, value] of this.entries) {
      if (this.entries.size <= this.maxEntries) return;
      if (!this.inUse.has(key)) {
        this.entries.delete(key);
        this.onEvict(value);
      }
    }
  }
}

const magic = [0x43, 0x50, 0x54, 0x43]; // "CPTC"
const formatVersion = 1;

/** Frames' times and sizes, or the waveform's shape, then the bytes. */
interface FileHeader {
  v: number,
  kind: 'strip' | 'peaks',
  key: string,
  aspect?: number | undefined,
  times?: number[],
  sizes?: number[],
  bucketSeconds?: number,
  count?: number,
}

function encodeFile(header: FileHeader, payload: readonly Uint8Array[]) {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const total = 4 + 4 + json.length + payload.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  bytes.set(magic, 0);
  new DataView(bytes.buffer).setUint32(4, json.length, true);
  bytes.set(json, 8);
  let pos = 8 + json.length;
  payload.forEach((part) => {
    bytes.set(part, pos);
    pos += part.length;
  });
  return bytes;
}

/** The header and where the payload starts, if `bytes` is a whole file of this format for `key`. */
function decodeFile(bytes: Uint8Array, key: string, kind: FileHeader['kind']) {
  if (bytes.length < 8 || magic.some((byte, i) => bytes[i] !== byte)) return undefined;
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (8 + jsonLength > bytes.length) return undefined;
  let header: FileHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jsonLength)));
  } catch {
    return undefined;
  }
  // A file named by a hash could still be another recording's (or an older format).
  if (header == null || header.v !== formatVersion || header.kind !== kind || header.key !== key) return undefined;
  return { header, payloadStart: 8 + jsonLength };
}

export async function encodeStrip(key: string, strip: CachedStrip) {
  const images = await Promise.all(strip.frames.map(async (frame) => new Uint8Array(await frame.blob.arrayBuffer())));
  return encodeFile({ v: formatVersion, kind: 'strip', key, aspect: strip.aspect, times: strip.frames.map((frame) => frame.time), sizes: images.map((image) => image.length) }, images);
}

/** The frames' times and images, if `bytes` is a whole strip file for `key`. */
export function decodeStrip(bytes: Uint8Array, key: string) {
  const decoded = decodeFile(bytes, key, 'strip');
  if (decoded == null) return undefined;
  const { header: { times, sizes, aspect }, payloadStart } = decoded;
  if (!Array.isArray(times) || !Array.isArray(sizes) || times.length !== sizes.length) return undefined;
  const images: { time: number, image: Uint8Array }[] = [];
  let pos = payloadStart;
  for (const [i, time] of times.entries()) {
    const size = sizes[i]!;
    if (!Number.isFinite(time) || !Number.isInteger(size) || size < 0 || pos + size > bytes.length) return undefined;
    images.push({ time, image: bytes.subarray(pos, pos + size) });
    pos += size;
  }
  if (pos !== bytes.length) return undefined;
  return { aspect: typeof aspect === 'number' && aspect > 0 ? aspect : undefined, images };
}

export function encodePeaks(key: string, { peaks, bucketSeconds }: AudioPeaks) {
  const data = new Uint8Array(peaks.length * 4);
  const view = new DataView(data.buffer);
  peaks.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return encodeFile({ v: formatVersion, kind: 'peaks', key, bucketSeconds, count: peaks.length }, [data]);
}

export function decodePeaks(bytes: Uint8Array, key: string): AudioPeaks | undefined {
  const decoded = decodeFile(bytes, key, 'peaks');
  if (decoded == null) return undefined;
  const { header: { bucketSeconds, count }, payloadStart } = decoded;
  if (typeof bucketSeconds !== 'number' || !(bucketSeconds > 0) || !Number.isInteger(count) || payloadStart + count! * 4 !== bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + payloadStart, count! * 4);
  const peaks = Float32Array.from({ length: count! }, (_, i) => view.getFloat32(i * 4, true));
  return { peaks, bucketSeconds };
}

/** Disk entries to delete: unused for longer than `maxAgeMs`, then the least recently used beyond `maxBytes`. */
export function getCacheFilesToPrune(files: readonly { name: string, size: number, mtimeMs: number }[], { maxBytes, maxAgeMs, now }: { maxBytes: number, maxAgeMs: number, now: number }) {
  const newestFirst = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const prune: string[] = [];
  let kept = 0;
  newestFirst.forEach((file) => {
    if (now - file.mtimeMs > maxAgeMs || kept + file.size > maxBytes) prune.push(file.name);
    else kept += file.size;
  });
  return prune;
}
