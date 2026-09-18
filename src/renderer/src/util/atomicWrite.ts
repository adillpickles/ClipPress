export interface AtomicWriteFs {
  writeFile: (path: string, data: string) => Promise<void>,
  rename: (oldPath: string, newPath: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
  dirname: (path: string) => string,
  basename: (path: string) => string,
  join: (...paths: string[]) => string,
}

export interface AtomicWriteOptions {
  /** Attempts for the rename step, including the first. */
  renameAttempts?: number | undefined,
  /** Injected so tests do not have to wait out the backoff. */
  delay?: ((ms: number) => Promise<void>) | undefined,
}

/**
 * Errors that mean "someone else is touching this file right now" rather than "this can
 * never work". On Windows a rename over an existing file fails with these while an
 * antivirus scanner, a thumbnail provider, or a concurrent save briefly holds a handle,
 * and it succeeds moments later.
 */
const transientErrorCodes = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'EPERM', 'EACCES']);

function isTransientError(err: unknown) {
  return err instanceof Error && 'code' in err && typeof err.code === 'string' && transientErrorCodes.has(err.code);
}

const defaultRenameAttempts = 5;
const defaultDelay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

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
export function createWriteFileAtomically(fs: AtomicWriteFs, options: AtomicWriteOptions = {}) {
  const renameAttempts = Math.max(1, options.renameAttempts ?? defaultRenameAttempts);
  const delay = options.delay ?? defaultDelay;

  return async function writeFileAtomically(savePath: string, data: string) {
    // Unique per call so two concurrent saves of the same file cannot clobber each
    // other's temp file. Leading dot keeps it hidden-ish and out of file listings.
    const tmpPath = fs.join(fs.dirname(savePath), `.${fs.basename(savePath)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    try {
      await fs.writeFile(tmpPath, data);

      for (let attempt = 1; ; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await fs.rename(tmpPath, savePath);
          break;
        } catch (err) {
          if (attempt >= renameAttempts || !isTransientError(err)) throw err;
          // eslint-disable-next-line no-await-in-loop
          await delay(2 ** (attempt - 1) * 20);
        }
      }
    } catch (err) {
      // Never leave the temp file behind. unlink can legitimately fail (the write may
      // never have created the file) and must not mask the original error.
      await fs.unlink(tmpPath).catch(() => undefined);
      throw err;
    }
  };
}
