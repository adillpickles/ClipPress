import type { ProjectSaveFailure } from './projectAutoSave';

/** What to do about a request to close the window. */
export type CloseDecision = 'close' | 'cancel';

export interface SaveBeforeCloseOptions {
  /** Saves everything now and resolves with what could not be saved (`ProjectAutoSave.flush`). */
  flush: () => Promise<ProjectSaveFailure[]>,
  /** How long saving may take before the user is told, and may stop waiting. */
  slowAfterMs: number,
  /**
   * Tells the user that saving is still in progress. Resolves with their choice to close without
   * waiting or to cancel. `signal` aborts once saving has finished; the result is then ignored.
   */
  showSaving: (signal: AbortSignal) => Promise<CloseDecision>,
  /** Tells the user what could not be saved. They can try again, close anyway, or cancel. */
  showFailed: (failures: ProjectSaveFailure[]) => Promise<CloseDecision | 'retry'>,
}

type Outcome = { failures: ProjectSaveFailure[], decision?: undefined } | { decision: CloseDecision };

async function flushOrUserChoice({ flush, slowAfterMs, showSaving }: Omit<SaveBeforeCloseOptions, 'showFailed'>): Promise<Outcome> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const userChoice = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      showSaving(abort.signal).then((decision) => {
        if (!abort.signal.aborted) resolve({ decision });
      }, (err: unknown) => console.error('Failed to show the saving notice', err));
    }, slowAfterMs);
  });
  const flushing = flush().then(
    (failures): Outcome => ({ failures }),
    (error: unknown): Outcome => ({ failures: [{ path: '', error }] }),
  );
  try {
    return await Promise.race([flushing, userChoice]);
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

/**
 * Gets the project onto disk before the window closes, and decides whether it may close.
 *
 * It closes without asking only once everything is saved. Otherwise the user decides: nothing is
 * dropped unless they choose to close without saving, and a disk that keeps failing or hangs can
 * never keep them from closing (or from cancelling to keep working).
 */
export default async function saveBeforeClose({ flush, slowAfterMs, showSaving, showFailed }: SaveBeforeCloseOptions): Promise<CloseDecision> {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await flushOrUserChoice({ flush, slowAfterMs, showSaving });
    if (outcome.decision != null) return outcome.decision;
    if (outcome.failures.length === 0) return 'close';
    // eslint-disable-next-line no-await-in-loop
    const choice = await showFailed(outcome.failures);
    if (choice !== 'retry') return choice;
  }
}
