import type { SizeLimitedPlan, SizeLimitedResolvedStrategy, SizeLimitedRetryStep, SizeLimitedStrategyId } from './types';

export const bytesPerMb = 1024 * 1024;

const minDurationSeconds = 0.5;

interface StrategyProfile {
  overheadRatio: number,
  minOverheadBytes: number,
  maxOverheadBytes: number,
  firstAttemptTargetFactor: number,
  retryTargetFactor: number,
  preferredAudioBitrate: number,
  minAudioBitrate: number,
  minVideoBitrate: number,
  maxAudioShare: number,
  tinyTargetAudioShare: number,
  tinyTargetTotalBitrate: number,
  maxAttempts: number,
  retryMinFactor: number,
  retryMaxFactor: number,
}

type StrategyTargetingProfile = Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

const av1TwoPassRetryProfile = {
  firstAttemptTargetFactor: 0.95,
  retryTargetFactor: 0.92,
  maxAttempts: 2,
  retryMinFactor: 0.9,
  retryMaxFactor: 0.97,
} satisfies Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

const av1SinglePassRetryProfile = {
  firstAttemptTargetFactor: 0.93,
  retryTargetFactor: 0.9,
  maxAttempts: 2,
  retryMinFactor: 0.88,
  retryMaxFactor: 0.97,
} satisfies Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

const fastSinglePassRetryProfile = {
  firstAttemptTargetFactor: 0.9,
  retryTargetFactor: 0.87,
  maxAttempts: 2,
  retryMinFactor: 0.85,
  retryMaxFactor: 0.97,
} satisfies Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

const h264TwoPassRetryProfile = {
  firstAttemptTargetFactor: 0.93,
  retryTargetFactor: 0.9,
  maxAttempts: 2,
  retryMinFactor: 0.88,
  retryMaxFactor: 0.97,
} satisfies Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

const h264SinglePassRetryProfile = {
  firstAttemptTargetFactor: 0.9,
  retryTargetFactor: 0.87,
  maxAttempts: 2,
  retryMinFactor: 0.85,
  retryMaxFactor: 0.97,
} satisfies Pick<StrategyProfile, 'firstAttemptTargetFactor' | 'retryTargetFactor' | 'maxAttempts' | 'retryMinFactor' | 'retryMaxFactor'>;

function createProfile(profile: StrategyProfile) {
  return profile;
}

const strategyProfiles: Record<SizeLimitedStrategyId, StrategyProfile> = {
  max_quality_av1_cpu_two_pass: createProfile({
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    ...av1TwoPassRetryProfile,
  }),
  max_quality_av1_nvenc_two_pass: createProfile({
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    ...av1TwoPassRetryProfile,
  }),
  max_quality_h264_cpu_two_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    ...h264TwoPassRetryProfile,
  }),
  max_quality_h264_nvenc_two_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 110_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 820_000,
    ...h264TwoPassRetryProfile,
  }),
  quality_av1_nvenc: createProfile({
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    ...av1SinglePassRetryProfile,
  }),
  quality_av1_cpu: createProfile({
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    ...av1SinglePassRetryProfile,
  }),
  quality_h264_cpu: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    ...h264SinglePassRetryProfile,
  }),
  fast_av1_nvenc: createProfile({
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    ...fastSinglePassRetryProfile,
  }),
  fast_h264_cpu: createProfile({
    overheadRatio: 0.024,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 120_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 850_000,
    ...fastSinglePassRetryProfile,
  }),
  advanced_av1_cpu_single_pass: createProfile({
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    ...av1SinglePassRetryProfile,
  }),
  advanced_av1_cpu_two_pass: createProfile({
    overheadRatio: 0.017,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 80_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 650_000,
    ...av1TwoPassRetryProfile,
  }),
  advanced_av1_nvenc_single_pass: createProfile({
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    ...av1SinglePassRetryProfile,
  }),
  advanced_av1_nvenc_two_pass: createProfile({
    overheadRatio: 0.018,
    minOverheadBytes: 20 * 1024,
    maxOverheadBytes: 160 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 90_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetTotalBitrate: 700_000,
    ...av1TwoPassRetryProfile,
  }),
  advanced_h264_cpu_single_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    ...h264SinglePassRetryProfile,
  }),
  advanced_h264_cpu_two_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 105_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetTotalBitrate: 780_000,
    ...h264TwoPassRetryProfile,
  }),
  advanced_h264_nvenc_single_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 140_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 900_000,
    ...h264SinglePassRetryProfile,
  }),
  advanced_h264_nvenc_two_pass: createProfile({
    overheadRatio: 0.022,
    minOverheadBytes: 24 * 1024,
    maxOverheadBytes: 192 * 1024,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    minVideoBitrate: 140_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetTotalBitrate: 900_000,
    ...h264TwoPassRetryProfile,
  }),
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStrategyProfile(strategyId: SizeLimitedStrategyId) {
  return strategyProfiles[strategyId];
}

function getTargetingProfile(strategy: SizeLimitedResolvedStrategy, budgetProfile: StrategyProfile): StrategyTargetingProfile {
  if (strategy.controlMode === 'simple') {
    switch (strategy.preset) {
      case 'max_quality':
        return av1TwoPassRetryProfile;
      case 'quality':
        return av1SinglePassRetryProfile;
      case 'fast':
        return fastSinglePassRetryProfile;
      default:
        return av1SinglePassRetryProfile;
    }
  }

  return {
    firstAttemptTargetFactor: budgetProfile.firstAttemptTargetFactor,
    retryTargetFactor: budgetProfile.retryTargetFactor,
    maxAttempts: budgetProfile.maxAttempts,
    retryMinFactor: budgetProfile.retryMinFactor,
    retryMaxFactor: budgetProfile.retryMaxFactor,
  };
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
  const hardTargetBytes = targetSizeMbToBytes(targetSizeMb);
  const safeDuration = Math.max(duration, minDurationSeconds);
  const budgetProfile = getStrategyProfile(strategy.plannerProfileId);
  const targetingProfile = getTargetingProfile(strategy, budgetProfile);
  const overheadBytes = getOverheadBytes(hardTargetBytes, budgetProfile);
  const firstAttemptTargetBytes = Math.max(Math.floor(hardTargetBytes * targetingProfile.firstAttemptTargetFactor), budgetProfile.minOverheadBytes);
  const retryTargetBytes = Math.max(Math.floor(hardTargetBytes * targetingProfile.retryTargetFactor), budgetProfile.minOverheadBytes);
  const targetZoneMinBytes = Math.max(firstAttemptTargetBytes, budgetProfile.minOverheadBytes);
  const targetZoneMaxBytes = Math.max(Math.floor(hardTargetBytes * 0.98), targetZoneMinBytes);
  const availableBytes = Math.max(firstAttemptTargetBytes - overheadBytes, budgetProfile.minOverheadBytes);
  const minTotalBitrate = getMinTotalBitrate({ hasAudio, profile: budgetProfile });
  const baseTotalBitrate = Math.max(Math.floor((availableBytes * 8) / safeDuration), minTotalBitrate);

  return {
    strategyId: strategy.plannerProfileId,
    hardTargetBytes,
    targetZoneMinBytes,
    targetZoneMaxBytes,
    firstAttemptTargetBytes,
    retryTargetBytes,
    duration: safeDuration,
    overheadBytes,
    hasAudio,
    maxAttempts: targetingProfile.maxAttempts,
    retryMinFactor: targetingProfile.retryMinFactor,
    retryMaxFactor: targetingProfile.retryMaxFactor,
    minTotalBitrate,
    initialAttempt: buildRetryStep({
      attemptNumber: 1,
      totalBitrate: baseTotalBitrate,
      hasAudio,
      strategyId: strategy.plannerProfileId,
    }),
  } satisfies SizeLimitedPlan;
}

export function getNextSizeLimitedRetryStep({ plan, previousAttempt, previousOutputSize }: {
  plan: SizeLimitedPlan,
  previousAttempt: SizeLimitedRetryStep,
  previousOutputSize: number,
}) {
  if (previousOutputSize <= plan.hardTargetBytes) return undefined;
  if (previousAttempt.attemptNumber >= plan.maxAttempts) return undefined;
  if (previousAttempt.totalBitrate <= plan.minTotalBitrate) return undefined;

  const retryFactor = clamp(plan.retryTargetBytes / previousOutputSize, plan.retryMinFactor, plan.retryMaxFactor);
  const nextTotalBitrate = Math.max(Math.floor(previousAttempt.totalBitrate * retryFactor), plan.minTotalBitrate);

  if (nextTotalBitrate >= previousAttempt.totalBitrate) return undefined;

  return buildRetryStep({
    attemptNumber: previousAttempt.attemptNumber + 1,
    totalBitrate: nextTotalBitrate,
    hasAudio: plan.hasAudio,
    strategyId: plan.strategyId,
  });
}
