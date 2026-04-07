import { describe, expect, it } from 'vitest';

import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

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
  it('prefers svt-av1 for max quality', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('max_quality_av1_cpu_two_pass');
    expect(strategy.effectiveCodec).toBe('av1');
    expect(strategy.encoderPreset).toBe(5);
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
  });

  it('uses av1 nvenc for quality when available', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('quality_av1_nvenc');
    expect(strategy.usesGpu).toBe(true);
    expect(strategy.encoderPreset).toBe('p6');
  });

  it('prefers av1 nvenc for fast mode', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('fast_av1_nvenc');
    expect(strategy.usesGpu).toBe(true);
    expect(strategy.encoderPreset).toBe('p2');
    expect(strategy.effectiveCodec).toBe('av1');
  });

  it('can resolve fast h264 nvenc when the export layer explicitly prefers it', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
      simpleFastCodec: 'h264',
    });

    expect(strategy.id).toBe('fast_h264_nvenc');
    expect(strategy.encoder).toBe('h264_nvenc');
    expect(strategy.usesGpu).toBe(true);
    expect(strategy.encoderPreset).toBe('p2');
    expect(strategy.effectiveCodec).toBe('h264');
  });

  it('falls back directly to cpu h264 when fast nvenc is unavailable to stay speed-first', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('fast_h264_cpu');
    expect(strategy.fallbackReason).toBe('av1_nvenc_unavailable');
  });

  it('falls back to cpu h264 when no av1 path is available for fast mode', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('fast_h264_cpu');
    expect(strategy.fallbackReason).toBe('av1_nvenc_unavailable');
  });

  it('falls back from max quality av1 to h264 two-pass when no av1 path is available', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: false },
    });

    expect(strategy.id).toBe('max_quality_h264_cpu_two_pass');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
    expect(strategy.fallbackReason).toBe('av1_unavailable');
  });

  it('resolves advanced h264 cpu two-pass exactly', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_cpu',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('advanced_h264_cpu_two_pass');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
  });

  it('resolves advanced av1 nvenc single-pass exactly', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('advanced_av1_nvenc_single_pass');
    expect(strategy.encoder).toBe('av1_nvenc');
    expect(strategy.executionMode).toBe('single_pass');
  });

  it('resolves advanced av1 nvenc two-pass exactly', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: true,
      advancedAv1CpuPreset: 6,
      advancedAv1NvencPreset: 'p5',
      advancedH264CpuPreset: 'slow',
      advancedH264NvencPreset: 'p4',
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('advanced_av1_nvenc_two_pass');
    expect(strategy.encoder).toBe('av1_nvenc');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
    expect(strategy.encoderPreset).toBe('p5');
  });

  it('resolves advanced av1 cpu two-pass exactly', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_cpu',
      advancedTwoPass: true,
      advancedAv1CpuPreset: 4,
      advancedAv1NvencPreset: 'p6',
      advancedH264CpuPreset: 'slow',
      advancedH264NvencPreset: 'p4',
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('advanced_av1_cpu_two_pass');
    expect(strategy.encoder).toBe('libsvtav1');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
    expect(strategy.encoderPreset).toBe(4);
  });

  it('resolves advanced h264 nvenc two-pass exactly', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: true,
      advancedAv1CpuPreset: 6,
      advancedAv1NvencPreset: 'p6',
      advancedH264CpuPreset: 'slow',
      advancedH264NvencPreset: 'p7',
      capabilities: fullCapabilities,
    });

    expect(strategy.id).toBe('advanced_h264_nvenc_two_pass');
    expect(strategy.encoder).toBe('h264_nvenc');
    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
    expect(strategy.encoderPreset).toBe('p7');
  });
});
