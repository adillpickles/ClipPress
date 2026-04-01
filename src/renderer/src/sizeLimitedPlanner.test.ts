import { describe, expect, it } from 'vitest';

import { boundedRetryFactors, bytesPerMb, planSizeLimitedEncode, targetSizeMbToBytes } from './sizeLimitedPlanner';

describe('targetSizeMbToBytes', () => {
  it('converts megabytes to bytes', () => {
    expect(targetSizeMbToBytes(10)).toBe(10 * bytesPerMb);
  });
});

describe('planSizeLimitedEncode', () => {
  it('creates a bounded retry schedule', () => {
    const plan = planSizeLimitedEncode({
      targetSizeMb: 10,
      duration: 30,
      hasAudio: true,
      quality: 'fast',
    });

    expect(plan.retries.length).toBeLessThanOrEqual(boundedRetryFactors.length);
    expect(plan.retries.length).toBeGreaterThan(0);
    expect(plan.retries[0]?.attemptNumber).toBe(1);
    expect(plan.retries.at(-1)?.attemptNumber).toBe(plan.retries.length);
  });

  it('decreases budgets over retry attempts', () => {
    const plan = planSizeLimitedEncode({
      targetSizeMb: 25,
      duration: 60,
      hasAudio: true,
      quality: 'high_quality',
    });

    const totalBitrates = plan.retries.map((retry) => retry.totalBitrate);
    expect(totalBitrates).toEqual([...totalBitrates].sort((a, b) => b - a));
  });

  it('omits audio bitrate for silent clips', () => {
    const plan = planSizeLimitedEncode({
      targetSizeMb: 5,
      duration: 12,
      hasAudio: false,
      quality: 'fast',
    });

    expect(plan.retries.every((retry) => retry.audioBitrate === 0)).toBe(true);
  });

  it('clamps tiny targets instead of failing', () => {
    const plan = planSizeLimitedEncode({
      targetSizeMb: 0.25,
      duration: 90,
      hasAudio: true,
      quality: 'fast',
    });

    expect(plan.targetBytes).toBeGreaterThan(0);
    expect(plan.retries[0]?.videoBitrate).toBeGreaterThan(0);
    expect(plan.retries[0]?.audioBitrate).toBeGreaterThan(0);
  });
});
