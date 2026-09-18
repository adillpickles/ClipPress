import { describe, expect, it } from 'vitest';

import { getResolvedVideoArgs } from './sizeLimitedEncoderArgs';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

function getArgValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

describe('getResolvedVideoArgs', () => {
  it('keeps max quality on svt-av1 two-pass with tune=0 and long keyint', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: true,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('libsvtav1');
    expect(getArgValue(args, '-preset')).toBe('5');
    expect(getArgValue(args, '-svtav1-params')).toBe('tune=0:keyint=600');
  });

  it('makes fast av1 nvenc clearly speed-first', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('av1_nvenc');
    expect(getArgValue(args, '-preset')).toBe('p1');
    expect(getArgValue(args, '-cq')).toBe('33');
    expect(getArgValue(args, '-rc-lookahead')).toBe('4');
    expect(getArgValue(args, '-temporal-aq')).toBe('0');
    expect(getArgValue(args, '-aq-strength')).toBe('4');
    expect(args.includes('-b_ref_mode')).toBe(false);
  });

  it('keeps libx264 on the tighter size-first bitrate window', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_cpu',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('libx264');
    expect(getArgValue(args, '-maxrate')).toBe('4200k');
    expect(getArgValue(args, '-bufsize')).toBe('6000k');
  });

  it('keeps non-fast h264 nvenc on size-first vbr_hq without cq', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('h264_nvenc');
    expect(getArgValue(args, '-rc')).toBe('vbr_hq');
    expect(getArgValue(args, '-strict_gop')).toBe('1');
    expect(getArgValue(args, '-cq')).toBeUndefined();
    expect(getArgValue(args, '-multipass')).toBe('qres');
    expect(getArgValue(args, '-maxrate')).toBe('4200k');
    expect(getArgValue(args, '-bufsize')).toBe('6000k');
  });
});

describe('getResolvedVideoArgs with a relaxed quality cap', () => {
  const videoProfile = { outputFps: undefined, scale: undefined } as never;

  const av1NvencArgs = (relaxQualityCap: boolean, preset: 'quality' | 'max_quality' | 'fast' = 'quality') => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset,
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });
    return getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile,
      sourceFps: 60,
      outputPlaybackRate: 1,
      relaxQualityCap,
    });
  };

  it('lowers the NVENC AV1 quality cap so the encoder can spend the budget', () => {
    // -cq is a quality ceiling in VBR mode, so on easy content it, not the bitrate,
    // decides the file size. A top-up has to move it or nothing changes.
    const baseline = getArgValue(av1NvencArgs(false), '-cq');
    const relaxed = getArgValue(av1NvencArgs(true), '-cq');

    expect(Number(relaxed)).toBeLessThan(Number(baseline));
  });

  it('never drops the cap below a sane floor', () => {
    for (const preset of ['quality', 'max_quality', 'fast'] as const) {
      expect(Number(getArgValue(av1NvencArgs(true, preset), '-cq'))).toBeGreaterThanOrEqual(10);
    }
  });

  it('leaves everything except the cap alone', () => {
    const baseline = av1NvencArgs(false);
    const relaxed = av1NvencArgs(true);

    expect(relaxed).toHaveLength(baseline.length);
    const cqIndex = baseline.indexOf('-cq');
    expect(relaxed.filter((_, i) => i !== cqIndex + 1)).toEqual(baseline.filter((_, i) => i !== cqIndex + 1));
  });

  it('still bounds the peak bitrate, so the cap cannot be blown past', () => {
    const relaxed = av1NvencArgs(true);
    expect(getArgValue(relaxed, '-maxrate')).toBeDefined();
    expect(getArgValue(relaxed, '-bufsize')).toBeDefined();
  });

  it('is a no-op for encoders that are not quality-capped', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'quality',
      advancedEncoder: 'h264_cpu',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });
    const args = (relaxQualityCap: boolean) => getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile,
      sourceFps: 60,
      outputPlaybackRate: 1,
      relaxQualityCap,
    });

    expect(args(true)).toEqual(args(false));
  });
});
