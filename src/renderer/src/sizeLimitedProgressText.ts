import type { SizeLimitedProgressMetadata } from './sizeLimitedTypes';

export type TranslateProgressText = (key: string, options: Record<string, string | number>) => string;

/**
 * The title while a Fit a file size export encodes: what it's doing, in plain words. A retry starts the bar again, so
 * it says why instead of "Attempt 2/3", which reads like something failed: the last try came out over the limit
 * (smaller), or well under it, so there's room for more detail (the top-up, see getNextSizeLimitedUndershootStep).
 */
export function getSizeLimitedStageTitle({ metadata, sizeText, t }: {
  metadata: SizeLimitedProgressMetadata | undefined,
  /** The size it's fitting to, e.g. "10 MB". */
  sizeText: string,
  t: TranslateProgressText,
}) {
  if (metadata?.retryReason === 'smaller') return t('Making it a bit smaller', {});
  if (metadata?.retryReason === 'sharper') return t('Making it a bit sharper', {});
  return t('Fitting to {{size}}', { size: sizeText });
}

/**
 * The line under the title while a Fit a file size export runs.
 *
 * Simple mode counts clips ("Clip 1 of 2"); the step that joins them says so instead, as it isn't a clip. Both passes
 * of a 2-pass encode share one bar, so passes aren't mentioned, and the title already says when it's a retry.
 * Advanced mode keeps the exact file, attempt and pass counters.
 */
export default function formatSizeLimitedProgressText({ jobIndex, totalJobs, clipCount, joinedClipCount = 0, metadata, simpleMode, t }: {
  jobIndex: number,
  /** Every encode in this export: one per clip file, plus the merge. */
  totalJobs: number,
  /** How many of those make a file per clip (0 when only the merged file is made). They come first. */
  clipCount: number,
  /** How many clips the merge joins into one file. */
  joinedClipCount?: number | undefined,
  metadata: SizeLimitedProgressMetadata | undefined,
  simpleMode: boolean,
  t: TranslateProgressText,
}) {
  if (simpleMode) {
    if (jobIndex < clipCount) return clipCount > 1 ? t('Clip {{current}} of {{total}}', { current: jobIndex + 1, total: clipCount }) : undefined;
    return joinedClipCount > 1 ? t('Joining {{count}} clips', { count: joinedClipCount }) : undefined;
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
