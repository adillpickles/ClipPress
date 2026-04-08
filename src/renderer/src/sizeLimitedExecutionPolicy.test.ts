import { describe, expect, it } from 'vitest';

import { UserFacingError } from '../errors';
import { finalizeSizeLimitedExecutionResult, shouldWarnAboutTightAdvancedH264Target, tightAdvancedH264WarningVideoBitrateThreshold } from './sizeLimitedExecutionPolicy';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

describe('shouldWarnAboutTightAdvancedH264Target', () => {
  it('warns when advanced h264 is below the viability threshold', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(shouldWarnAboutTightAdvancedH264Target({
      strategy,
      videoBitrate: tightAdvancedH264WarningVideoBitrateThreshold - 1,
    })).toBe(true);
    expect(shouldWarnAboutTightAdvancedH264Target({
      strategy,
      videoBitrate: tightAdvancedH264WarningVideoBitrateThreshold,
    })).toBe(false);
  });

  it('does not warn for non-h264 advanced strategies', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(shouldWarnAboutTightAdvancedH264Target({
      strategy,
      videoBitrate: tightAdvancedH264WarningVideoBitrateThreshold - 1,
    })).toBe(false);
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

  it('throws a direct h264-specific failure after bounded retries are exhausted', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(() => finalizeSizeLimitedExecutionResult({
      path: 'clip.mp4',
      size: 3_000,
      targetBytes: 2_000,
      attemptCount: 4,
      metTarget: false,
      created: true,
      strategy,
    })).toThrow(UserFacingError);
    expect(() => finalizeSizeLimitedExecutionResult({
      path: 'clip.mp4',
      size: 3_000,
      targetBytes: 2_000,
      attemptCount: 4,
      metTarget: false,
      created: true,
      strategy,
    })).toThrow('H.264 could not reach the requested file-size limit for this clip after 4 attempt(s). Try AV1, lower resolution/FPS, or increase the target size.');
  });
});
