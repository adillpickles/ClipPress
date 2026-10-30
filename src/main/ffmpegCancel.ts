/**
 * FFmpeg processes the renderer can stop. A renderer's AbortSignal can't stop one: @electron/remote hands the main
 * process a copy of the signal's members, which never hears the abort. So the renderer gives the call an id
 * (`cancelId`) and stops it with abortFfmpeg(cancelId).
 */
const controllers = new Map<string, AbortController>();

/** Stops the FFmpeg started with `cancelId`, if it's still running. */
export function abortFfmpeg(cancelId: string) {
  controllers.get(cancelId)?.abort();
}

/**
 * Runs `run` with a signal that abortFfmpeg(cancelId) aborts (none without a `cancelId`). The id is taken at once,
 * before anything is awaited, so an abort straight after the call isn't missed.
 */
export async function withCancelId<T>(cancelId: string | undefined, run: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  if (cancelId == null) return run(undefined);
  const controller = new AbortController();
  controllers.set(cancelId, controller);
  try {
    return await run(controller.signal);
  } finally {
    if (controllers.get(cancelId) === controller) controllers.delete(cancelId);
  }
}

/** For tests: how many calls can be stopped right now. */
export const getCancellableCount = () => controllers.size;
