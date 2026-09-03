export interface AtomicWriteFs {
  writeFile: (path: string, data: string) => Promise<void>,
  rename: (oldPath: string, newPath: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
  dirname: (path: string) => string,
  basename: (path: string) => string,
  join: (...paths: string[]) => string,
}

/**
 * Builds a writer that writes to a sibling temp file and then renames it over the
 * target, so an interrupted or failed write can never leave a truncated file behind.
 *
 * The temp file must live in the same directory as the target: rename is only atomic
 * within a single filesystem. On Windows, rename over an existing file uses
 * MOVEFILE_REPLACE_EXISTING, so the destination is replaced rather than EEXIST.
 *
 * Takes its filesystem functions as arguments because the renderer only reaches Node
 * through `window.require`, which is not available under test.
 */
export function createWriteFileAtomically(fs: AtomicWriteFs) {
  return async function writeFileAtomically(savePath: string, data: string) {
    // Unique per call so two concurrent saves of the same file cannot clobber each
    // other's temp file. Leading dot keeps it hidden-ish and out of file listings.
    const tmpPath = fs.join(fs.dirname(savePath), `.${fs.basename(savePath)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    try {
      await fs.writeFile(tmpPath, data);
      await fs.rename(tmpPath, savePath);
    } catch (err) {
      // Never leave the temp file behind. unlink can legitimately fail (the write may
      // never have created the file) and must not mask the original error.
      await fs.unlink(tmpPath).catch(() => undefined);
      throw err;
    }
  };
}
