/**
 * Small working files an export needs for a moment (text overlay images, chapter lists) go in ClipPress's folder in
 * the system's temporary directory, not next to the recording or the export, where they would show up while the
 * export runs (or stay behind if it failed).
 */

const { tmpdir } = window.require('os');
const { join } = window.require('path');
const { mkdirSync } = window.require('fs');
const { readdir, stat, unlink } = window.require('fs/promises');

let workDir: string | undefined;

export function getTempWorkDir() {
  if (workDir == null) {
    workDir = join(tmpdir(), 'ClipPress');
    mkdirSync(workDir, { recursive: true });
  }
  return workDir!;
}

/** Leftovers of exports that crashed or were killed: anything there older than a day. */
export async function purgeOldTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  const dir = getTempWorkDir();
  const names: string[] = await readdir(dir).catch(() => []);
  const now = Date.now();
  await Promise.all(names.map(async (name) => {
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (info.isFile() && now - info.mtimeMs > maxAgeMs) await unlink(path);
    } catch {
      // In use, or already gone
    }
  }));
}
