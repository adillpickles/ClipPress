/** Errors Windows gives while an antivirus or the search indexer briefly holds the file being replaced. */
const transientCodes = new Set(['EPERM', 'EBUSY', 'EACCES']);

const isTransient = (err: unknown) => err instanceof Error && transientCodes.has((err as NodeJS.ErrnoException).code ?? '');

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Runs a synchronous settings write, trying again a few times, a little later each time, when replacing the file is
 * refused for a moment. Several writes in a row while starting (first run, migrations) otherwise fail now and then
 * on Windows, and a failed write there stopped ClipPress from starting.
 */
export default function retrySettingsWrite(write: () => void, { attempts = 5, delayMs = 40, sleep = sleepSync }: { attempts?: number, delayMs?: number, sleep?: (ms: number) => void } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      write();
      return;
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      sleep(delayMs * attempt);
    }
  }
}
