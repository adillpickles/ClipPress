/**
 * Coalesces seeks while scrubbing (https://kitchen.vibbio.com/blog/optimizing-html5-video-scrubbing/).
 *
 * One seek runs at a time. While it does, only the newest requested time waits; when the seek lands
 * (`landed`, i.e. the video's `seeked` event), that time goes next. So the picture keeps updating during a
 * drag and always ends on the last position asked for. A safety timeout unblocks the queue if a seek never
 * reports back (for example when the source changes mid-seek).
 */
export function createSeekQueue({
  seek,
  safetyMs = 1000,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: {
  seek: (time: number) => void,
  safetyMs?: number,
  schedule?: (fn: () => void, ms: number) => unknown,
  cancel?: (handle: unknown) => void,
}) {
  let inFlight = false;
  let pending: number | undefined;
  let safetyTimer: unknown;

  function issue(time: number) {
    inFlight = true;
    seek(time);
    cancel(safetyTimer);
    // eslint-disable-next-line no-use-before-define
    safetyTimer = schedule(() => landed(), safetyMs);
  }

  function landed() {
    cancel(safetyTimer);
    safetyTimer = undefined;
    inFlight = false;
    const next = pending;
    pending = undefined;
    if (next != null) issue(next);
  }

  return {
    request(time: number) {
      if (inFlight) {
        pending = time;
        return;
      }
      issue(time);
    },
    landed,
    reset() {
      cancel(safetyTimer);
      safetyTimer = undefined;
      inFlight = false;
      pending = undefined;
    },
  };
}

export type SeekQueue = ReturnType<typeof createSeekQueue>;
