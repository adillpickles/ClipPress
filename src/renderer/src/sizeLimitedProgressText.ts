import type { SizeLimitedProgressMetadata } from './sizeLimitedTypes';

export type TranslateProgressText = (key: string, options: Record<string, string | number>) => string;

/**
 * The line under "Exporting" or "Merging" while a Fit a file size export runs.
 *
 * Simple mode counts clips ("Clip 1 of 2"), and the merge step gets no count of its own (its title already says
 * "Merging", and it isn't a clip). A retry starts the bar again, so it says why, instead of "Attempt 2/3", which
 * reads like something failed. The wording doesn't say which way: a retry makes the file smaller when it came
 * out over the limit, but bigger when it came out well under it (the top-up, see getNextSizeLimitedUndershootStep).
 * Both passes of a 2-pass encode share one bar, so passes aren't mentioned.
 * Advanced mode keeps the exact file, attempt and pass counters.
 */
export default function formatSizeLimitedProgressText({ jobIndex, totalJobs, clipCount, metadata, simpleMode, t }: {
  jobIndex: number,
  /** Every encode in this export: one per clip file, plus the merge. */
  totalJobs: number,
  /** How many of those make a file per clip (0 when only the merged file is made). They come first. */
  clipCount: number,
  metadata: SizeLimitedProgressMetadata | undefined,
  simpleMode: boolean,
  t: TranslateProgressText,
}) {
  if (simpleMode) {
    const parts: string[] = [];
    if (clipCount > 1 && jobIndex < clipCount) parts.push(t('Clip {{current}} of {{total}}', { current: jobIndex + 1, total: clipCount }));
    if (metadata != null && metadata.attemptNumber > 1) parts.push(t('Fine-tuning the size', {}));
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }

  const stageParts: string[] = [];
  if (metadata != null && metadata.attemptNumber > 1) {
    stageParts.push(t('Attempt {{attempt}}/{{maxAttempts}}', { attempt: metadata.attemptNumber, maxAttempts: metadata.maxAttempts }));
  }
  if (metadata != null && metadata.phaseCount > 1) {
    stageParts.push(t('Pass {{phase}}/{{phaseCount}}', { phase: metadata.phaseNumber, phaseCount: metadata.phaseCount }));
  }
  const stageText = stageParts.length > 0 ? stageParts.join(' - ') : undefined;

  if (totalJobs <= 1) return stageText;
  if (stageText == null) return t('File {{current}}/{{total}}', { current: jobIndex + 1, total: totalJobs });
  return t('File {{current}}/{{total}} - {{stage}}', { current: jobIndex + 1, total: totalJobs, stage: stageText });
}
