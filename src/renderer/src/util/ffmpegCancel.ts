/** Different on every page load, so an id from before a reload never stops a later call. */
const idPrefix = Math.random().toString(36).slice(2);
let lastId = 0;

/**
 * Runs `run` (FFmpeg in the main process), stopping it when `signal` aborts. A signal can't be handed over
 * @electron/remote: the main process would get a copy of its members, which never hears the abort. So the call
 * gets an id, and `abort(id)` stops it (main's ffmpegCancel.ts).
 */
export default async function runCancellable<T>(
  signal: AbortSignal | undefined,
  abort: (cancelId: string) => void,
  run: (cancelId: string | undefined) => Promise<T>,
): Promise<T> {
  if (signal == null) return run(undefined);
  signal.throwIfAborted();
  lastId += 1;
  const cancelId = `${idPrefix}-${lastId}`;
  const onAbort = () => abort(cancelId);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await run(cancelId);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
