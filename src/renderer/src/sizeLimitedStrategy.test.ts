import { describe, expect, it } from 'vitest';

import { getEffectiveSizeLimitCodec, parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

describe('getEffectiveSizeLimitCodec', () => {
  it('forces fast mode to use h264', () => {
    expect(getEffectiveSizeLimitCodec({ requestedCodec: 'av1', quality: 'fast' })).toBe('h264');
  });

  it('keeps the requested codec for high quality', () => {
    expect(getEffectiveSizeLimitCodec({ requestedCodec: 'av1', quality: 'high_quality' })).toBe('av1');
  });
});

describe('parseFfmpegEncoderNames', () => {
  it('extracts encoder names from ffmpeg output', () => {
    const encoders = parseFfmpegEncoderNames(`
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder
 V....D av1_nvenc            NVIDIA NVENC AV1 encoder
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
 V..... libsvtav1            SVT-AV1 encoder
`);

    expect(encoders.has('h264_nvenc')).toBe(true);
    expect(encoders.has('av1_nvenc')).toBe(true);
    expect(encoders.has('libx264')).toBe(true);
    expect(encoders.has('libsvtav1')).toBe(true);
  });
});

describe('resolveSizeLimitedStrategy', () => {
  it('prefers h264 nvenc for fast mode', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'h264',
      quality: 'fast',
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('fast_h264_nvenc');
    expect(strategy.usesGpu).toBe(true);
  });

  it('falls back to cpu h264 when fast nvenc is unavailable', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'h264',
      quality: 'fast',
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('fast_h264_cpu');
    expect(strategy.fallbackReason).toBe('h264_nvenc_unavailable');
  });

  it('uses svt-av1 for high quality when available', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'av1',
      quality: 'high_quality',
      capabilities: { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('high_quality_av1_cpu');
    expect(strategy.effectiveCodec).toBe('av1');
  });

  it('falls back to av1 nvenc when svt-av1 is unavailable', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'av1',
      quality: 'high_quality',
      capabilities: { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('high_quality_av1_nvenc');
    expect(strategy.effectiveCodec).toBe('av1');
    expect(strategy.fallbackReason).toBe('svt_av1_unavailable');
  });

  it('falls back to h264 when no av1 encoder is available', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'av1',
      quality: 'high_quality',
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('high_quality_h264_cpu');
    expect(strategy.effectiveCodec).toBe('h264');
    expect(strategy.fallbackReason).toBe('av1_unavailable');
  });

  it('uses premium h264 directly when requested', () => {
    const strategy = resolveSizeLimitedStrategy({
      requestedCodec: 'h264',
      quality: 'high_quality',
      capabilities: { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('high_quality_h264_cpu');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
  });
});
