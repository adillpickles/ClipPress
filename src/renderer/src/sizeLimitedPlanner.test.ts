import { describe, expect, it } from 'vitest';

import { getNextSizeLimitedRetryStep, bytesPerMb, planSizeLimitedEncode, targetSizeMbToBytes } from './sizeLimitedPlanner';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const allCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;

describe('targetSizeMbToBytes', () => {
  it('converts megabytes to bytes', () => {
    expect(targetSizeMbToBytes(10)).toBe(10 * bytesPerMb);
  });
});

describe('planSizeLimitedEncode', () => {
  it('creates an initial bounded retry plan', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'h264', quality: 'fast', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    expect(plan.initialAttempt.attemptNumber).toBe(1);
    expect(plan.maxAttempts).toBeGreaterThan(1);
    expect(plan.initialAttempt.videoBitrate).toBeGreaterThan(0);
  });

  it('gives premium AV1 high quality a smaller audio budget at tiny caps', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'av1', quality: 'high_quality', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 1.5,
      duration: 20,
      hasAudio: true,
      strategy,
    });

    expect(plan.initialAttempt.audioBitrate).toBeLessThan(plan.initialAttempt.videoBitrate);
    expect(plan.initialAttempt.audioBitrate).toBeLessThanOrEqual(64_000);
    expect(strategy.id).toBe('high_quality_av1_cpu');
  });

  it('omits audio bitrate for silent clips', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'h264', quality: 'fast', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 5,
      duration: 12,
      hasAudio: false,
      strategy,
    });

    expect(plan.initialAttempt.audioBitrate).toBe(0);
  });

  it('clamps tiny targets instead of failing', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'h264', quality: 'fast', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 0.25,
      duration: 90,
      hasAudio: true,
      strategy,
    });

    expect(plan.targetBytes).toBeGreaterThan(0);
    expect(plan.initialAttempt.videoBitrate).toBeGreaterThan(0);
    expect(plan.initialAttempt.audioBitrate).toBeGreaterThan(0);
  });
});

describe('getNextSizeLimitedRetryStep', () => {
  it('decreases bitrate after an overshoot and stays bounded', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'h264', quality: 'high_quality', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 25,
      duration: 60,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: Math.floor(plan.targetBytes * 1.2),
    });

    expect(nextAttempt).toBeDefined();
    expect(nextAttempt?.attemptNumber).toBe(2);
    expect(nextAttempt?.totalBitrate).toBeLessThan(plan.initialAttempt.totalBitrate);

    let attempt = nextAttempt;
    while (attempt != null && attempt.attemptNumber < plan.maxAttempts) {
      attempt = getNextSizeLimitedRetryStep({
        plan,
        previousAttempt: attempt,
        previousOutputSize: Math.floor(plan.targetBytes * 1.1),
      });
    }

    expect(attempt?.attemptNumber ?? plan.maxAttempts).toBeLessThanOrEqual(plan.maxAttempts);
  });

  it('stops retrying once the output is under the target', () => {
    const strategy = resolveSizeLimitedStrategy({ requestedCodec: 'h264', quality: 'fast', capabilities: allCapabilities });
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      strategy,
    });

    const nextAttempt = getNextSizeLimitedRetryStep({
      plan,
      previousAttempt: plan.initialAttempt,
      previousOutputSize: plan.targetBytes,
    });

    expect(nextAttempt).toBeUndefined();
  });
});
