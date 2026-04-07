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
    expect(getArgValue(args, '-preset')).toBe('p2');
    expect(getArgValue(args, '-cq')).toBe('33');
    expect(getArgValue(args, '-rc-lookahead')).toBe('4');
    expect(getArgValue(args, '-temporal-aq')).toBe('0');
    expect(getArgValue(args, '-aq-strength')).toBe('4');
    expect(args.includes('-b_ref_mode')).toBe(false);
  });

  it('uses size-first h264 nvenc cbr for the fast h264 nvenc path', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
      simpleFastCodec: 'h264',
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: true,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('h264_nvenc');
    expect(getArgValue(args, '-rc')).toBe('cbr_hq');
    expect(getArgValue(args, '-strict_gop')).toBe('1');
    expect(getArgValue(args, '-cq')).toBeUndefined();
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
