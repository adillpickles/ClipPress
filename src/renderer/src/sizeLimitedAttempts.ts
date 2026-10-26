import { finalizeSizeLimitedExecutionResult } from './sizeLimitedExecutionPolicy';
import { getNextSizeLimitedAttempt } from './sizeLimitedPlanner';
import type { SizeLimitedExecutionResult, SizeLimitedPlan, SizeLimitedResolvedStrategy, SizeLimitedRetryReason, SizeLimitedRetryStep } from './sizeLimitedTypes';

/**
 * Runs encode attempts until one fits the size limit as well as the plan allows. File access and
 * FFmpeg are passed in, so this policy can be tested without either.
 */
export default async function runSizeLimitedAttempts<Files extends { outPath: string }>({
  plan,
  strategy,
  buildAttempt,
  runAttempt,
  cleanUpAttempt,
  readFileSize,
  deleteIfExists,
  isCancellation,
}: {
  plan: SizeLimitedPlan,
  strategy: SizeLimitedResolvedStrategy,
  buildAttempt: (attempt: SizeLimitedRetryStep) => Promise<Files>,
  /** Encodes one attempt to `files.outPath`; after the first, `retryReason` says why it runs. */
  runAttempt: (files: Files, attempt: SizeLimitedRetryStep, retryReason: SizeLimitedRetryReason | undefined) => Promise<void>,
  /** Removes an attempt's intermediate files (first-pass output, pass logs). */
  cleanUpAttempt: (files: Files) => Promise<void>,
  readFileSize: (path: string) => Promise<number>,
  deleteIfExists: (path: string) => Promise<void>,
  /** Whether an error means the user cancelled the export. */
  isCancellation: (error: unknown) => boolean,
}): Promise<SizeLimitedExecutionResult> {
  // Two candidates are tracked rather than one "best so far".
  //
  // `bestUnderCap` is the *largest* result that stayed within the limit, because among
  // results that all respect the cap the biggest one used the budget best and therefore
  // looks best. `smallestOverCap` is only kept so that, if nothing ever fit, the failure
  // can report how close we got. Keeping them apart is what lets an undershoot top-up run
  // without ever being able to return a file over the limit.
  let bestUnderCap: SizeLimitedExecutionResult | undefined;
  let smallestOverCap: SizeLimitedExecutionResult | undefined;
  let currentAttempt: SizeLimitedRetryStep | undefined = plan.initialAttempt;
  let retryReason: SizeLimitedRetryReason | undefined;

  try {
    while (currentAttempt != null) {
      // eslint-disable-next-line no-await-in-loop
      const files = await buildAttempt(currentAttempt);

      try {
        // eslint-disable-next-line no-await-in-loop
        await runAttempt(files, currentAttempt, retryReason);

        // eslint-disable-next-line no-await-in-loop
        const size = await readFileSize(files.outPath);
        const metTarget = size <= plan.hardTargetBytes;
        const candidate = {
          path: files.outPath,
          size,
          targetBytes: plan.hardTargetBytes,
          attemptCount: currentAttempt.attemptNumber,
          metTarget,
          created: true,
          strategy,
        } satisfies SizeLimitedExecutionResult;

        retryReason = metTarget ? 'sharper' : 'smaller';
        if (metTarget) {
          // Keep whichever under-cap result filled more of the budget.
          if (bestUnderCap == null || candidate.size > bestUnderCap.size) {
            // eslint-disable-next-line no-await-in-loop
            if (bestUnderCap != null && bestUnderCap.path !== candidate.path) await deleteIfExists(bestUnderCap.path);
            bestUnderCap = candidate;
          } else {
            // eslint-disable-next-line no-await-in-loop
            await deleteIfExists(candidate.path);
          }

          currentAttempt = getNextSizeLimitedAttempt({
            hasUnderCapResult: true,
            plan,
            previousAttempt: currentAttempt,
            previousOutputSize: size,
          });
        } else {
          if (smallestOverCap == null || candidate.size < smallestOverCap.size) {
            // eslint-disable-next-line no-await-in-loop
            if (smallestOverCap != null && smallestOverCap.path !== candidate.path) await deleteIfExists(smallestOverCap.path);
            smallestOverCap = candidate;
          } else {
            // eslint-disable-next-line no-await-in-loop
            await deleteIfExists(candidate.path);
          }

          // A top-up that overshot has already given us a good under-cap result to fall
          // back on, so stop rather than spending more passes shrinking it again.
          currentAttempt = getNextSizeLimitedAttempt({
            hasUnderCapResult: bestUnderCap != null,
            plan,
            previousAttempt: currentAttempt,
            previousOutputSize: size,
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await deleteIfExists(files.outPath);
        // Cancelling always stops the export, even during a top-up of a result that already fits.
        if (bestUnderCap == null || isCancellation(error)) throw error;
        // A later attempt only ever tries to improve on a result that already fits. If it
        // fails, the export has not failed: keep the good file rather than reporting an
        // error the user cannot act on.
        console.warn('A size-limited top-up attempt failed; keeping the earlier result that met the target', error);
        currentAttempt = undefined;
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await cleanUpAttempt(files);
      }
    }
  } catch (error) {
    // Failed or cancelled: nothing this export kept may be left behind or published.
    await Promise.all([bestUnderCap, smallestOverCap].map((candidate) => (candidate != null ? deleteIfExists(candidate.path) : undefined)));
    throw error;
  }

  if (bestUnderCap != null) {
    // An over-cap attempt may still be on disk from a top-up that went too far.
    if (smallestOverCap != null && smallestOverCap.path !== bestUnderCap.path) {
      await deleteIfExists(smallestOverCap.path);
    }
    return bestUnderCap;
  }

  // Nothing fitted. The over-cap file must not be left behind pretending to be an export.
  if (smallestOverCap != null) await deleteIfExists(smallestOverCap.path);

  return finalizeSizeLimitedExecutionResult(smallestOverCap);
}
