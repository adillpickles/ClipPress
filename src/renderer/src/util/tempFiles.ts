/**
 * Small working files an export needs for a moment (text overlay images, chapter lists) go in ClipPress's folder in
 * the system's temporary directory, not next to the recording or the export, where they would show up while the
 * export runs (or stay behind if it failed).
 *
 * Each running ClipPress has its own subfolder (named after its process id), so tidying up never touches files an
 * export in another window is still using.
 */

const { tmpdir } = window.require('os');
const { join } = window.require('path');
const { mkdirSync } = window.require('fs');
const { readdir, rm, stat, unlink } = window.require('fs/promises');

const rootDir = () => join(tmpdir(), 'ClipPress');
let workDir: string | undefined;

export function getTempWorkDir() {
  if (workDir == null) {
    workDir = join(rootDir(), String(process.pid));
    mkdirSync(workDir, { recursive: true });
  }
  return workDir!;
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, but belongs to someone else
    return err instanceof Error && 'code' in err && err.code === 'EPERM';
  }
}

/** Leftovers of ClipPress windows that crashed or were killed (and loose files from older versions). */
export async function purgeOldTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  const root = rootDir();
  const names: string[] = await readdir(root).catch(() => []);
  const now = Date.now();
  await Promise.all(names.map(async (name) => {
    const path = join(root, name);
    try {
      const info = await stat(path);
      if (info.isDirectory()) {
        const pid = Number(name);
        if (Number.isInteger(pid) && pid !== process.pid && !isRunning(pid)) await rm(path, { recursive: true, force: true });
      } else if (now - info.mtimeMs > maxAgeMs) {
        await unlink(path);
      }
    } catch {
      // In use, or already gone
    }
  }));
}
