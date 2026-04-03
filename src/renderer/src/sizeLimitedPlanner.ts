import type { SizeLimitedPlan, SizeLimitedResolvedStrategy, SizeLimitedRetryStep, SizeLimitedStrategyId } from './types';

export const bytesPerMb = 1024 * 1024;

const minDurationSeconds = 0.5;

interface StrategyProfile {
  overheadRatio: number,
  minOverheadBytes: number,
  maxOverheadBytes: number,
  preferredAudioBitrate: number,
  minAudioBitrate: number,
  minVideoBitrate: number,
  maxAudioShare: number,
  tinyTargetAudioShare: number,
  tinyTargetTotalBitrate: number,
  maxAttempts: number,
  retrySafetyFactor: number,
  retryMinFactor: number,
  retryMaxFactor: number,
  minAttemptDropPercent: number,
}

const strategyProfiles: Record<SizeLimitedStrategyId, StrategyProfile> = {
  max_quality_av1_cpu: {
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.68,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  max_quality_av1_nvenc: {
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  max_quality_h264_cpu_two_pass: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  quality_av1_nvenc: {
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  quality_av1_cpu: {
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.68,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  quality_h264_cpu: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  fast_h264_nvenc: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 140_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 900_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.97,
    retryMinFactor: 0.72,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.06,
  },
  fast_h264_cpu: {
    overheadRatio: 0.024,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 120_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 850_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.97,
    retryMinFactor: 0.72,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.06,
  },
  ultra_fast_h264_nvenc: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 140_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 900_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.97,
    retryMinFactor: 0.72,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.06,
  },
  ultra_fast_h264_cpu: {
    overheadRatio: 0.024,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 120_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 850_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.97,
    retryMinFactor: 0.72,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.06,
  },
  advanced_av1_cpu: {
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.68,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  advanced_av1_nvenc: {
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  advanced_h264_cpu_single_pass: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  advanced_h264_cpu_two_pass: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.965,
    retryMinFactor: 0.7,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.05,
  },
  advanced_h264_nvenc: {
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 140_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 900_000,
    maxAttempts: 4,
    retrySafetyFactor: 0.97,
    retryMinFactor: 0.72,
    retryMaxFactor: 0.97,
    minAttemptDropPercent: 0.06,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStrategyProfile(strategyId: SizeLimitedStrategyId) {
  return strategyProfiles[strategyId];
}

export function targetSizeMbToBytes(targetSizeMb: number) {
  return Math.max(1, Math.floor(targetSizeMb * bytesPerMb));
}

function getOverheadBytes(targetBytes: number, profile: StrategyProfile) {
  return clamp(Math.floor(targetBytes * profile.overheadRatio), profile.minOverheadBytes, profile.maxOverheadBytes);
}

function getMinTotalBitrate({ hasAudio, profile }: { hasAudio: boolean, profile: StrategyProfile }) {
  return profile.minVideoBitrate + (hasAudio ? profile.minAudioBitrate : 0);
}

function getPreferredAudioBitrate({ hasAudio, totalBitrate, profile }: {
  hasAudio: boolean,
  totalBitrate: number,
  profile: StrategyProfile,
}) {
  if (!hasAudio) return 0;

  const audioShare = totalBitrate <= profile.tinyTargetTotalBitrate ? profile.tinyTargetAudioShare : profile.maxAudioShare;
  const cappedByBudget = Math.floor(totalBitrate * audioShare);
  let audioBitrate = Math.min(profile.preferredAudioBitrate, Math.max(profile.minAudioBitrate, cappedByBudget));

  if (totalBitrate - audioBitrate < profile.minVideoBitrate) {
    audioBitrate = Math.max(profile.minAudioBitrate, totalBitrate - profile.minVideoBitrate);
  }

  return Math.max(audioBitrate, 0);
}

function buildRetryStep({ attemptNumber, totalBitrate, hasAudio, strategyId }: {
  attemptNumber: number,
  totalBitrate: number,
  hasAudio: boolean,
  strategyId: SizeLimitedStrategyId,
}) {
  const profile = getStrategyProfile(strategyId);
  const audioBitrate = getPreferredAudioBitrate({ hasAudio, totalBitrate, profile });

  return {
    attemptNumber,
    totalBitrate,
    audioBitrate,
    videoBitrate: Math.max(totalBitrate - audioBitrate, profile.minVideoBitrate),
  } satisfies SizeLimitedRetryStep;
}

export function planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, strategy }: {
  targetSizeMb: number,
  duration: number,
  hasAudio: boolean,
  strategy: SizeLimitedResolvedStrategy,
}) {
  const targetBytes = targetSizeMbToBytes(targetSizeMb);
  const safeDuration = Math.max(duration, minDurationSeconds);
  const profile = getStrategyProfile(strategy.id);
  const overheadBytes = getOverheadBytes(targetBytes, profile);
  const availableBytes = Math.max(targetBytes - overheadBytes, profile.minOverheadBytes);
  const minTotalBitrate = getMinTotalBitrate({ hasAudio, profile });
  const baseTotalBitrate = Math.max(Math.floor((availableBytes * 8) / safeDuration), minTotalBitrate);

  return {
    strategyId: strategy.id,
    targetBytes,
    duration: safeDuration,
    overheadBytes,
    hasAudio,
    maxAttempts: profile.maxAttempts,
    retrySafetyFactor: profile.retrySafetyFactor,
    retryMinFactor: profile.retryMinFactor,
    retryMaxFactor: profile.retryMaxFactor,
    minAttemptDropPercent: profile.minAttemptDropPercent,
    minTotalBitrate,
    initialAttempt: buildRetryStep({
      attemptNumber: 1,
      totalBitrate: baseTotalBitrate,
      hasAudio,
      strategyId: strategy.id,
    }),
  } satisfies SizeLimitedPlan;
}

export function getNextSizeLimitedRetryStep({ plan, previousAttempt, previousOutputSize }: {
  plan: SizeLimitedPlan,
  previousAttempt: SizeLimitedRetryStep,
  previousOutputSize: number,
}) {
  if (previousOutputSize <= plan.targetBytes) return undefined;
  if (previousAttempt.attemptNumber >= plan.maxAttempts) return undefined;
  if (previousAttempt.totalBitrate <= plan.minTotalBitrate) return undefined;

  const overshootRatio = previousOutputSize / plan.targetBytes;
  const retryFactor = clamp(plan.retrySafetyFactor / overshootRatio, plan.retryMinFactor, plan.retryMaxFactor);
  const forcedDropFactor = 1 - plan.minAttemptDropPercent;

  const retryDrivenBitrate = Math.floor(previousAttempt.totalBitrate * retryFactor);
  const forcedDropBitrate = Math.floor(previousAttempt.totalBitrate * forcedDropFactor);
  const nextTotalBitrate = Math.max(Math.min(retryDrivenBitrate, forcedDropBitrate), plan.minTotalBitrate);

  if (nextTotalBitrate >= previousAttempt.totalBitrate) return undefined;

  return buildRetryStep({
    attemptNumber: previousAttempt.attemptNumber + 1,
    totalBitrate: nextTotalBitrate,
    hasAudio: plan.hasAudio,
    strategyId: plan.strategyId,
  });
}
