/** How much of what's left of a job's stretch one encode fills before the next one (if any) carries on from there. */
const encodeShare = 0.9;

/**
 * One export job's progress as the simple editor shows it, only ever moving forward. A size-limited job's first encode
 * fills 90% of its stretch; if a second one runs (sharper, or smaller), it carries on from there instead of starting
 * the strip again, so nothing gives it away (6.1 round 4). A job done in one encode goes from 90% to done as it
 * finishes. Progress reported without an attempt (a lossless copy, a job that was skipped) is shown as it comes.
 */
export default function createForwardJobProgress() {
  let attempt: number | undefined;
  let from = 0;
  let to = 0;
  let shown = 0;
  return (progress: number, attemptNumber: number | undefined) => {
    const clamped = Math.min(1, Math.max(0, progress));
    if (attemptNumber == null) {
      shown = Math.max(shown, clamped);
      return shown;
    }
    if (attemptNumber !== attempt) {
      attempt = attemptNumber;
      from = shown;
      to = shown + (1 - shown) * encodeShare;
    }
    shown = Math.max(shown, from + (to - from) * clamped);
    return shown;
  };
}
