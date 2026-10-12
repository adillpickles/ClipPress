import { describe, expect, it } from 'vitest';

import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { SizeLimitedEncoderCapabilities } from './sizeLimitedTypes';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const noGpu = { h264Nvenc: false, av1Nvenc: false, libx264: false, libsvtav1: false } as const;
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
    expect(strategy.encoderPreset).toBe('p1');
    expect(strategy.effectiveCodec).toBe('av1');
  });

  it('uses GPU H.264 for fast on a GPU without an AV1 encoder (RTX 20/30-series)', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('fast_h264_gpu');
    expect(strategy.encoder).toBe('h264_nvenc');
    expect(strategy.usesGpu).toBe(true);
    expect(strategy.effectiveCodec).toBe('h264');
    expect(strategy.fallbackReason).toBe('gpu_av1_unavailable');
  });

  it('never fails fast mode without a GPU: CPU AV1, then CPU H.264', () => {
    const resolveFast = (capabilities: SizeLimitedEncoderCapabilities) => resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities,
    });

    const av1 = resolveFast({ ...noGpu, libx264: true, libsvtav1: true });
    expect(av1.id).toBe('fast_av1_cpu');
    expect(av1.encoder).toBe('libsvtav1');
    expect(av1.encoderPreset).toBe(10);

    const h264 = resolveFast({ ...noGpu, libx264: true, libsvtav1: false });
    expect(h264.id).toBe('fast_h264_cpu');
    expect(h264.encoderPreset).toBe('veryfast');
  });

  it.each([
    ['amd', { av1Amf: true, h264Amf: true }, 'av1_amf'],
    ['intel', { av1Qsv: true, h264Qsv: true }, 'av1_qsv'],
  ] as const)('uses %s AV1 for quality and fast', (vendor, gpu, encoder) => {
    for (const preset of ['quality', 'fast'] as const) {
      const strategy = resolveSizeLimitedStrategy({
        controlMode: 'simple',
        preset,
        advancedEncoder: 'h264_nvenc',
        advancedTwoPass: false,
        ...defaultStrategyArgs,
        capabilities: { ...noGpu, ...gpu, libx264: true, libsvtav1: true },
      });

      expect(strategy.id).toBe(`${preset}_av1_gpu`);
      expect(strategy.encoder).toBe(encoder);
      expect(strategy.hardware).toBe(vendor);
      expect(strategy.usesGpu).toBe(true);
      expect(strategy.plannerProfileId).toBe(preset === 'fast' ? 'fast_av1_nvenc' : 'quality_av1_nvenc');
    }
  });

  it('prefers a discrete NVIDIA GPU over an Intel iGPU', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { ...fullCapabilities, av1Qsv: true, h264Qsv: true },
    });

    expect(strategy.encoder).toBe('av1_nvenc');
  });

  it('keeps quality on CPU AV1 without GPU AV1 when the CPU is quick enough', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: true, av1Nvenc: false, libx264: true, libsvtav1: true, cpuThreads: 16 },
    });

    expect(strategy.id).toBe('quality_av1_cpu');
    expect(strategy.fallbackReason).toBe('gpu_av1_unavailable');
  });

  it('moves quality to GPU H.264 on a small CPU without GPU AV1', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { ...noGpu, h264Amf: true, libx264: true, libsvtav1: true, cpuThreads: 4 },
    });

    expect(strategy.id).toBe('quality_h264_gpu');
    expect(strategy.encoder).toBe('h264_amf');
  });

  it('runs NVIDIA max quality as one multipass encode instead of FFmpeg 2-pass', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { ...fullCapabilities, libsvtav1: false },
    });

    expect(strategy.id).toBe('max_quality_av1_nvenc_two_pass');
    expect(strategy.executionMode).toBe('single_pass');
    expect(strategy.encoderMultipass).toBe(true);
  });

  it('maps the Advanced GPU choice to AMD or Intel when there is no NVIDIA GPU', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: { ...noGpu, av1Amf: true, libx264: true, libsvtav1: true },
    });

    expect(strategy.id).toBe('advanced_av1_gpu');
    expect(strategy.encoder).toBe('av1_amf');
    expect(strategy.encoderPreset).toBe('p6');
    expect(strategy.executionMode).toBe('single_pass');
    // AMD has no full-resolution multipass mode.
    expect(strategy.encoderMultipass).toBeUndefined();
    expect(strategy.fallbackReason).toBe('nvidia_unavailable');
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
    expect(strategy.executionMode).toBe('single_pass');
    expect(strategy.encoderMultipass).toBe(true);
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
    expect(strategy.executionMode).toBe('single_pass');
    expect(strategy.encoderMultipass).toBe(true);
    expect(strategy.encoderPreset).toBe('p7');
  });
});
