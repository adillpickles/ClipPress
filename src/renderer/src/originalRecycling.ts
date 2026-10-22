/**
 * "Move the original to the Recycle Bin after export": only after every planned output was written and
 * checked, only ever through the Recycle Bin (never a permanent delete), and never if the original changed
 * since the export started.
 */

export interface FileIdentity {
  size: number,
  mtimeMs: number,
}

export interface OutputProbe {
  /** Seconds; undefined when ffprobe reports none. */
  duration: number | undefined,
  streamCount: number,
}

export type OutputCheck =
  | { ok: true }
  | { ok: false, path: string, reason: 'missing' | 'empty' | 'unreadable' | 'no-media' };

/** Smallest output that can still be a real clip; anything below is treated as broken. */
export const minExportBytes = 1024;

export async function verifyExportedFiles(paths: readonly string[], {
  statFile,
  probe,
}: {
  statFile: (path: string) => Promise<{ size: number, isFile: boolean } | undefined>,
  probe: (path: string) => Promise<OutputProbe>,
}): Promise<OutputCheck> {
  if (paths.length === 0) return { ok: false, path: '', reason: 'missing' };
  // eslint-disable-next-line no-restricted-syntax
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    const stat = await statFile(path);
    if (stat == null || !stat.isFile) return { ok: false, path, reason: 'missing' };
    if (stat.size < minExportBytes) return { ok: false, path, reason: 'empty' };
    let result: OutputProbe;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await probe(path);
    } catch {
      return { ok: false, path, reason: 'unreadable' };
    }
    if (result.streamCount === 0 || result.duration == null || !(result.duration > 0)) return { ok: false, path, reason: 'no-media' };
  }
  return { ok: true };
}

export type RecycleResult =
  | { recycled: true }
  | { recycled: false, reason: 'changed' | 'missing' | 'refused' };

export function sameIdentity(a: FileIdentity | undefined, b: FileIdentity | undefined) {
  return a != null && b != null && a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 1;
}

/**
 * Moves the original to the Recycle Bin. `trash` must only ever recycle (Electron's `shell.trashItem` fails
 * rather than permanently deleting a file that can't be recycled); this never falls back to deleting. A few
 * quick retries cover a file still held open for a moment after the recording was closed.
 */
export async function recycleOriginal(path: string, expected: FileIdentity | undefined, {
  identify,
  trash,
  exists,
  attempts = 3,
  retryDelayMs = 700,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  identify: (filePath: string) => Promise<FileIdentity | undefined>,
  trash: (filePath: string) => Promise<unknown>,
  exists: (filePath: string) => Promise<boolean>,
  attempts?: number,
  retryDelayMs?: number,
  wait?: (ms: number) => Promise<unknown>,
}): Promise<RecycleResult> {
  const current = await identify(path);
  if (current == null) return { recycled: false, reason: 'missing' };
  if (!sameIdentity(current, expected)) return { recycled: false, reason: 'changed' };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await trash(path);
      // eslint-disable-next-line no-await-in-loop
      if (!(await exists(path))) return { recycled: true };
    } catch (err) {
      console.warn('Moving the original to the Recycle Bin failed', attempt, err);
    }
    // eslint-disable-next-line no-await-in-loop
    if (attempt < attempts) await wait(retryDelayMs);
  }
  return { recycled: false, reason: 'refused' };
}
