import { describe, expect, it } from 'vitest';

import type { TranslateProgressText } from './sizeLimitedProgressText';
import formatSizeLimitedProgressText, { getSizeLimitedStageTitle } from './sizeLimitedProgressText';

// Fills in {{placeholders}} like i18next does with the English keys.
const t: TranslateProgressText = (key, options) => key.replaceAll(/{{(\w+)}}/g, (_match, name: string) => String(options[name]));

const firstTry = { attemptNumber: 1, maxAttempts: 3, phaseNumber: 1, phaseCount: 1 };
const twoPass = { attemptNumber: 1, maxAttempts: 3, phaseNumber: 2, phaseCount: 2 };
const retry = { attemptNumber: 2, maxAttempts: 3, phaseNumber: 1, phaseCount: 2, retryReason: 'smaller' as const };
const topUp = { attemptNumber: 2, maxAttempts: 3, phaseNumber: 1, phaseCount: 1, retryReason: 'sharper' as const };

describe('getSizeLimitedStageTitle', () => {
  it('says what it fits to, and why it tries again', () => {
    expect(getSizeLimitedStageTitle({ metadata: undefined, sizeText: '10 MB', t })).toBe('Fitting to 10 MB');
    expect(getSizeLimitedStageTitle({ metadata: firstTry, sizeText: '10 MB', t })).toBe('Fitting to 10 MB');
    expect(getSizeLimitedStageTitle({ metadata: retry, sizeText: '10 MB', t })).toBe('Making it a bit smaller');
    expect(getSizeLimitedStageTitle({ metadata: topUp, sizeText: '10 MB', t })).toBe('Making it a bit sharper');
  });
});

describe('formatSizeLimitedProgressText in simple mode', () => {
  const format = (jobIndex: number, totalJobs: number, clipCount: number, metadata?: typeof retry | typeof firstTry, joinedClipCount?: number) => (
    formatSizeLimitedProgressText({ jobIndex, totalJobs, clipCount, joinedClipCount, metadata, simpleMode: true, t })
  );

  it('says nothing extra for a single clip on its first try', () => {
    expect(format(0, 1, 1, firstTry)).toBeUndefined();
    expect(format(0, 1, 1, undefined)).toBeUndefined();
  });

  it('counts clips', () => {
    expect(format(0, 2, 2, firstTry)).toBe('Clip 1 of 2');
    expect(format(1, 2, 2, undefined)).toBe('Clip 2 of 2');
  });

  it('does not mention passes, which share one bar', () => {
    expect(format(0, 1, 1, twoPass)).toBeUndefined();
    expect(format(1, 3, 3, twoPass)).toBe('Clip 2 of 3');
  });

  it('leaves a retry to the title instead of counting attempts', () => {
    expect(format(0, 1, 1, retry)).toBeUndefined();
    expect(format(0, 2, 2, retry)).toBe('Clip 1 of 2');
  });

  it('says the merge step joins the clips, without a clip number', () => {
    // Two clip files and the merge.
    expect(format(2, 3, 2, firstTry, 2)).toBe('Joining 2 clips');
    expect(format(2, 3, 2, retry, 2)).toBe('Joining 2 clips');
    // Only the merged file is made.
    expect(format(0, 1, 0, firstTry, 3)).toBe('Joining 3 clips');
    expect(format(0, 1, 0, firstTry)).toBeUndefined();
  });
});

describe('formatSizeLimitedProgressText in advanced mode', () => {
  const format = (jobIndex: number, totalJobs: number, metadata?: typeof retry | typeof firstTry) => (
    formatSizeLimitedProgressText({ jobIndex, totalJobs, clipCount: totalJobs, metadata, simpleMode: false, t })
  );

  it('keeps the exact counters', () => {
    expect(format(0, 1, firstTry)).toBeUndefined();
    expect(format(0, 1, twoPass)).toBe('Pass 2/2');
    expect(format(0, 1, retry)).toBe('Attempt 2/3 - Pass 1/2');
    expect(format(1, 3, undefined)).toBe('File 2/3');
    expect(format(1, 3, retry)).toBe('File 2/3 - Attempt 2/3 - Pass 1/2');
  });
});
