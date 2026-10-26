import type { AudioPeaks } from './audioPeaks';
import { getProjectStoreEnv } from './projectStore';
import { TimelineMemoryCache, decodePeaks, decodeStrip, encodePeaks, encodeStrip, getCacheFilesToPrune } from './timelineCache';
import type { CachedStrip } from './timelineCache';

const { mkdir, readFile, readdir, rename, stat, unlink, utimes, writeFile } = window.require('fs/promises');
const { join } = window.require('path');
const { createHash } = window.require('crypto');

/**
 * The timeline cache's homes: the last few recordings' filmstrips (blob URLs) and waveforms in memory, and every
 * recording's on disk in ClipPress's own folder, a few hundred KB each, pruned to `maxDiskBytes` (the least
 * recently used go first) and to recordings opened in the last `maxDiskAgeMs`.
 */
const maxDiskBytes = 100 * 1024 * 1024;
const maxDiskAgeMs = 90 * 24 * 60 * 60 * 1000;

// A strip in memory is a hundred or more blobs, which cost the browser process memory: only the last few are kept
// (opening an older one reads its file, a few ms).
export const stripMemory = new TimelineMemoryCache<CachedStrip>({
  maxEntries: 4,
  onEvict: (strip) => strip.frames.forEach((frame) => URL.revokeObjectURL(frame.url)),
});

export const peaksMemory = new TimelineMemoryCache<AudioPeaks>({ maxEntries: 24, onEvict: () => undefined });

let cacheDir: string | undefined;
export const getTimelineCacheDir = () => {
  cacheDir ??= join(getProjectStoreEnv().dataDir, 'Timeline cache') as string;
  return cacheDir;
};
const getCacheDir = getTimelineCacheDir;

/** An entry's file: named by a hash of its key (the key itself, in the file, is checked when it's read). */
export const getTimelineCacheFileName = (key: string, kind: 'strip' | 'peaks') => `${createHash('sha1').update(key).digest('hex')}.${kind}`;
const getFileName = getTimelineCacheFileName;

async function readEntry(name: string): Promise<Uint8Array | undefined> {
  const path = join(getCacheDir(), name);
  try {
    const bytes: Uint8Array = await readFile(path);
    // Its age says when it was last used, for pruning.
    const now = new Date();
    utimes(path, now, now).catch(() => undefined);
    return bytes;
  } catch {
    return undefined;
  }
}

async function writeEntry(name: string, bytes: Uint8Array) {
  const dir = getCacheDir();
  try {
    await mkdir(dir, { recursive: true });
    // Written beside it and renamed over it, so a reader never sees half a file.
    const tmp = join(dir, `${name}.${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmp, bytes);
    await rename(tmp, join(dir, name)).catch(async (err: unknown) => {
      await unlink(tmp).catch(() => undefined);
      throw err;
    });
  } catch (err) {
    console.warn('Could not save to the timeline cache', err);
  }
}

/** The recording's filmstrip from disk, kept in memory from then on. */
export async function loadStripFromDisk(key: string): Promise<CachedStrip | undefined> {
  const bytes = await readEntry(getFileName(key, 'strip'));
  const decoded = bytes != null ? decodeStrip(bytes, key) : undefined;
  if (decoded == null) return undefined;
  // Another open may have put it in memory meanwhile.
  const already = stripMemory.get(key);
  if (already != null) return already;
  const strip: CachedStrip = {
    aspect: decoded.aspect,
    frames: decoded.images.map(({ time, image }) => {
      // A copy: the file's buffer is a Node one, which Blob won't take as it is.
      const blob = new Blob([new Uint8Array(image)], { type: 'image/jpeg' });
      return { time, blob, url: URL.createObjectURL(blob) };
    }),
  };
  stripMemory.put(key, strip);
  return strip;
}

/** Keeps a complete filmstrip (the memory cache owns its URLs from now on) and writes it to disk. */
export async function saveStrip(key: string, strip: CachedStrip) {
  stripMemory.put(key, strip);
  try {
    await writeEntry(getFileName(key, 'strip'), await encodeStrip(key, strip));
  } catch (err) {
    console.warn('Could not save the filmstrip', err);
  }
}

export async function loadPeaksFromDisk(key: string): Promise<AudioPeaks | undefined> {
  const bytes = await readEntry(getFileName(key, 'peaks'));
  const peaks = bytes != null ? decodePeaks(bytes, key) : undefined;
  if (peaks == null) return undefined;
  peaksMemory.put(key, peaks);
  return peaks;
}

export async function savePeaks(key: string, peaks: AudioPeaks) {
  peaksMemory.put(key, peaks);
  await writeEntry(getFileName(key, 'peaks'), encodePeaks(key, peaks));
}

/** Deletes what's beyond the cache's limits on disk, and files left half written. */
export async function pruneTimelineCache() {
  const dir = getCacheDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const now = Date.now();
  const files: { name: string, size: number, mtimeMs: number }[] = [];
  for (const name of names) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { size, mtimeMs } = await stat(join(dir, name));
      if (name.endsWith('.tmp')) {
        // eslint-disable-next-line no-await-in-loop
        if (now - mtimeMs > 60 * 60 * 1000) await unlink(join(dir, name));
      } else {
        files.push({ name, size, mtimeMs });
      }
    } catch {
      // Gone meanwhile (another window), or can't be read: left alone.
    }
  }
  for (const name of getCacheFilesToPrune(files, { maxBytes: maxDiskBytes, maxAgeMs: maxDiskAgeMs, now })) {
    // eslint-disable-next-line no-await-in-loop
    await unlink(join(dir, name)).catch(() => undefined);
  }
}
