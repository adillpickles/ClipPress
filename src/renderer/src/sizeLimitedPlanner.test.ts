import { describe, expect, it } from 'vitest';

import { getNextSizeLimitedRetryStep, bytesPerMb, planSizeLimitedEncode, targetSizeMbToBytes } from './sizeLimitedPlanner';
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
});
