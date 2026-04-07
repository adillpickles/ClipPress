import { describe, expect, it } from 'vitest';

import { UserFacingError } from '../errors';
import { finalizeSizeLimitedExecutionResult, fastH264NvencVideoBitrateThreshold, shouldUseH264NvencForSimpleFast } from './sizeLimitedExecutionPolicy';
import { planSizeLimitedEncode } from './sizeLimitedPlanner';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

function getFastH264CandidateVideoBitrate({ targetSizeMb, duration }: {
  targetSizeMb: number,
  duration: number,
}) {
  const strategy = resolveSizeLimitedStrategy({
    controlMode: 'simple',
    preset: 'fast',
    advancedEncoder: 'h264_nvenc',
    advancedTwoPass: false,
    ...defaultStrategyArgs,
    capabilities: fullCapabilities,
    simpleFastCodec: 'h264',
  });

  const plan = planSizeLimitedEncode({
    targetSizeMb,
    duration,
    hasAudio: true,
    strategy,
  });

  return plan.initialAttempt.videoBitrate;
}

describe('shouldUseH264NvencForSimpleFast', () => {
  it('uses the configured threshold', () => {
    expect(shouldUseH264NvencForSimpleFast(fastH264NvencVideoBitrateThreshold)).toBe(true);
    expect(shouldUseH264NvencForSimpleFast(fastH264NvencVideoBitrateThreshold - 1)).toBe(false);
  });

  it('selects h264 for a generous 7 second / 4 MB fast budget', () => {
    expect(shouldUseH264NvencForSimpleFast(getFastH264CandidateVideoBitrate({
      targetSizeMb: 4,
      duration: 7,
    }))).toBe(true);
  });

  it('keeps av1 for a tight 30 second / 4 MB fast budget', () => {
    expect(shouldUseH264NvencForSimpleFast(getFastH264CandidateVideoBitrate({
      targetSizeMb: 4,
      duration: 30,
    }))).toBe(false);
  });

  it('keeps av1 for a middle 30 second / 8 MB fast budget', () => {
    expect(shouldUseH264NvencForSimpleFast(getFastH264CandidateVideoBitrate({
      targetSizeMb: 8,
      duration: 30,
    }))).toBe(false);
  });

  it('selects h264 again for a generous 30 second / 12 MB fast budget', () => {
    expect(shouldUseH264NvencForSimpleFast(getFastH264CandidateVideoBitrate({
      targetSizeMb: 12,
      duration: 30,
    }))).toBe(true);
  });
});

describe('finalizeSizeLimitedExecutionResult', () => {
  it('returns an under-cap result', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const result = finalizeSizeLimitedExecutionResult({
      path: 'clip.mp4',
      size: 1_000,
      targetBytes: 2_000,
      attemptCount: 1,
      metTarget: true,
      created: true,
      strategy,
    });

    expect(result.path).toBe('clip.mp4');
  });

  it('throws when the best available result is still over the hard target', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(() => finalizeSizeLimitedExecutionResult({
      path: 'clip.mp4',
      size: 3_000,
      targetBytes: 2_000,
      attemptCount: 2,
      metTarget: false,
      created: true,
      strategy,
    })).toThrow(UserFacingError);
    expect(() => finalizeSizeLimitedExecutionResult({
      path: 'clip.mp4',
      size: 3_000,
      targetBytes: 2_000,
      attemptCount: 2,
      metTarget: false,
      created: true,
      strategy,
    })).toThrow('under the requested file-size limit');
  });
});
