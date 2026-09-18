import { describe, expect, it } from 'vitest';

import { getNextSizeLimitedRetryStep, getNextSizeLimitedUndershootStep, bytesPerMb, planSizeLimitedEncode, targetSizeMbToBytes } from './sizeLimitedPlanner';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const allCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

describe('targetSizeMbToBytes', () => {
  it('converts megabytes to bytes', () => {
    expect(targetSizeMbToBytes(10)).toBe(10 * bytesPerMb);
  });
});

describe('planSizeLimitedEncode', () => {
  it('creates an initial bounded retry plan', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    expect(plan.initialAttempt.attemptNumber).toBe(1);
    expect(plan.maxAttempts).toBe(2);
    expect(plan.initialAttempt.videoBitrate).toBeGreaterThan(0);
  });

  it('gives premium AV1 high quality a smaller audio budget at tiny caps', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 1.5,
      duration: 20,
      hasAudio: true,
      strategy,
    });

    expect(plan.initialAttempt.audioBitrate).toBeLessThan(plan.initialAttempt.videoBitrate);
    expect(plan.initialAttempt.audioBitrate).toBeLessThanOrEqual(64_000);
    expect(strategy.id).toBe('max_quality_av1_cpu_two_pass');
    expect(plan.firstAttemptTargetBytes).toBeLessThan(plan.hardTargetBytes);
  });

  it('omits audio bitrate for silent clips', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 5,
      duration: 12,
      hasAudio: false,
      strategy,
    });

    expect(plan.initialAttempt.audioBitrate).toBe(0);
  });

  it('clamps tiny targets instead of failing', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 0.25,
      duration: 90,
      hasAudio: true,
      strategy,
    });

    expect(plan.hardTargetBytes).toBeGreaterThan(0);
    expect(plan.initialAttempt.videoBitrate).toBeGreaterThan(0);
    expect(plan.initialAttempt.audioBitrate).toBeGreaterThan(0);
  });

  it('keeps fast mode on the locked AV1 target even when H.264 is available', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    expect(strategy.id).toBe('fast_av1_nvenc');
    expect(plan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.9));
    expect(plan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.87));
    expect(plan.maxAttempts).toBe(2);
  });

  it('gives H.264 two-pass strategies extra bounded retries', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    expect(plan.maxAttempts).toBe(3);
  });
});

describe('getNextSizeLimitedRetryStep', () => {
  it('decreases bitrate after an overshoot and stays bounded', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 25,
      duration: 60,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: Math.floor(plan.hardTargetBytes * 1.2),
    });

    expect(nextAttempt).toBeDefined();
    expect(nextAttempt?.attemptNumber).toBe(2);
    expect(nextAttempt?.totalBitrate).toBeLessThan(plan.initialAttempt.totalBitrate);

    let attempt = nextAttempt;
    while (attempt != null && attempt.attemptNumber < plan.maxAttempts) {
      attempt = getNextSizeLimitedRetryStep({
        plan,
        previousAttempt: attempt,
        previousOutputSize: Math.floor(plan.hardTargetBytes * 1.1),
      });
    }

    expect(attempt?.attemptNumber ?? plan.maxAttempts).toBeLessThanOrEqual(plan.maxAttempts);
  });

  it('stops retrying once the output is under the target', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: plan.hardTargetBytes,
    });

    expect(nextAttempt).toBeUndefined();
  });

  it('plans max quality at the locked 95% first-attempt target', () => {
    const maxQualityStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const maxQualityPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: maxQualityStrategy,
    });

    expect(maxQualityPlan.maxAttempts).toBe(2);
    expect(maxQualityPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.95));
    expect(maxQualityPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.92));
    expect(maxQualityPlan.targetZoneMinBytes).toBe(Math.floor(maxQualityPlan.hardTargetBytes * 0.95));
    expect(maxQualityPlan.targetZoneMaxBytes).toBe(Math.floor(maxQualityPlan.hardTargetBytes * 0.98));
  });

  it('plans quality mode at the locked 93% first-attempt target', () => {
    const qualityStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const qualityPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: qualityStrategy,
    });

    expect(qualityPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.93));
    expect(qualityPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.9));
  });

  it('keeps max quality targeting locked when av1 falls back to h264', () => {
    const fallbackStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    const fallbackPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: fallbackStrategy,
    });

    expect(fallbackStrategy.id).toBe('max_quality_h264_cpu_two_pass');
    expect(fallbackPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.95));
    expect(fallbackPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.92));
  });

  it('keeps quality targeting locked when av1 falls back to h264', () => {
    const fallbackStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    const fallbackPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: fallbackStrategy,
    });

    expect(fallbackStrategy.id).toBe('quality_h264_cpu');
    expect(fallbackPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.93));
    expect(fallbackPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.9));
  });

  it('plans fast mode at the locked 90% first-attempt target', () => {
    const fastStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });

    const fastPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: fastStrategy,
    });

    expect(fastPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.9));
    expect(fastPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.87));
  });

  it('treats under-cap first attempts as final even when far below the preset target', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: Math.floor(plan.hardTargetBytes * 0.8),
    });

    expect(nextAttempt).toBeUndefined();
  });

  it('uses a much stronger H.264 correction on severe overshoots', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 4,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: Math.floor(plan.hardTargetBytes * 4),
    });

    expect(nextAttempt).toBeDefined();
    expect(nextAttempt?.attemptNumber).toBe(2);
    expect(nextAttempt?.audioBitrate).toBe(plan.initialAttempt.audioBitrate);
    expect(nextAttempt?.videoBitrate).toBeLessThan(Math.floor(plan.initialAttempt.videoBitrate * 0.3));
  });

  it('only ratchets H.264 audio once video is already at floor', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 4,
      duration: 90,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: {
        attemptNumber: 2,
        videoBitrate: 140_000,
        audioBitrate: 72_000,
        totalBitrate: 212_000,
      },
      previousOutputSize: Math.floor(plan.hardTargetBytes * 1.2),
    });

    expect(nextAttempt).toBeDefined();
    expect(nextAttempt?.videoBitrate).toBe(140_000);
    expect(nextAttempt?.audioBitrate).toBeLessThan(72_000);
  });

  it('keeps H.264 simple fallback targeting locked while extending retries', () => {
    const fallbackStrategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    const fallbackPlan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy: fallbackStrategy,
    });

    expect(fallbackStrategy.id).toBe('quality_h264_cpu');
    expect(fallbackPlan.firstAttemptTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.93));
    expect(fallbackPlan.retryTargetBytes).toBe(Math.floor(10 * bytesPerMb * 0.9));
    expect(fallbackPlan.maxAttempts).toBe(4);
  });
});

describe('getNextSizeLimitedUndershootStep', () => {
  const makePlan = ({ targetSizeMb = 20, duration = 60, hasAudio = true, preset = 'quality' as const } = {}) => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset,
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: allCapabilities,
    });
    return planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, strategy });
  };

  it('records the threshold below which a top-up is worthwhile', () => {
    const plan = makePlan({ targetSizeMb: 20 });
    expect(plan.undershootRetryBelowBytes).toBe(Math.floor(20 * bytesPerMb * 0.75));
    // Must sit below the planner's own first-attempt aim, or ordinary results would
    // trigger a pointless second encode.
    expect(plan.undershootRetryBelowBytes).toBeLessThan(plan.firstAttemptTargetBytes);
  });

  it('does not retry a result that already used most of the budget', () => {
    const plan = makePlan({ targetSizeMb: 20 });
    // 18 MB of a 20 MB cap: the margin is the intended safety margin, not a miss.
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 18 * bytesPerMb,
    });
    expect(next).toBeUndefined();
  });

  it('plans a higher-bitrate top-up after a large undershoot', () => {
    const plan = makePlan({ targetSizeMb: 23 });
    // The reported real-world case: 23 MB requested, 11 MB delivered.
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 11 * bytesPerMb,
    });

    expect(next).toBeDefined();
    expect(next!.attemptNumber).toBe(2);
    expect(next!.totalBitrate).toBeGreaterThan(plan.initialAttempt.totalBitrate);
    // Raising the bitrate alone does nothing while the encoder's quality cap binds.
    expect(next!.relaxQualityCap).toBe(true);
  });

  it('aims at the top of the target zone rather than overshooting the cap', () => {
    const plan = makePlan({ targetSizeMb: 20 });
    const previousOutputSize = 10 * bytesPerMb;
    const next = getNextSizeLimitedUndershootStep({ plan, previousAttempt: plan.initialAttempt, previousOutputSize });

    const expectedGrowth = plan.targetZoneMaxBytes / previousOutputSize;
    expect(next!.totalBitrate).toBe(Math.floor(plan.initialAttempt.totalBitrate * expectedGrowth));
    // The zone max is under the hard cap, so the aim point itself cannot exceed the limit.
    expect(plan.targetZoneMaxBytes).toBeLessThanOrEqual(plan.hardTargetBytes);
  });

  it('caps how far a single top-up may grow the bitrate', () => {
    const plan = makePlan({ targetSizeMb: 100 });
    // A tiny result would otherwise imply a 50x jump straight past the cap.
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 2 * bytesPerMb,
    });
    expect(next!.totalBitrate).toBe(Math.floor(plan.initialAttempt.totalBitrate * 2.5));
  });

  it('tops up only once, so a stubborn encode does not loop', () => {
    const plan = makePlan({ targetSizeMb: 23 });
    const first = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 11 * bytesPerMb,
    });
    const second = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: first!,
      previousOutputSize: 12 * bytesPerMb,
    });
    expect(second).toBeUndefined();
  });

  it('stops when the attempt budget is spent', () => {
    const plan = makePlan({ targetSizeMb: 23 });
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: { ...plan.initialAttempt, attemptNumber: plan.maxAttempts },
      previousOutputSize: 5 * bytesPerMb,
    });
    expect(next).toBeUndefined();
  });

  it('never divides by an empty result', () => {
    const plan = makePlan({ targetSizeMb: 20 });
    expect(getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 0,
    })).toBeUndefined();
  });

  it('keeps the audio budget consistent with the raised total', () => {
    const plan = makePlan({ targetSizeMb: 23 });
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 11 * bytesPerMb,
    });
    expect(next!.videoBitrate + next!.audioBitrate).toBe(next!.totalBitrate);
    expect(next!.audioBitrate).toBeGreaterThan(0);
  });

  it('leaves audio out when the source has none', () => {
    const plan = makePlan({ targetSizeMb: 23, hasAudio: false });
    const next = getNextSizeLimitedUndershootStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: 11 * bytesPerMb,
    });
    expect(next!.audioBitrate).toBe(0);
  });
});
