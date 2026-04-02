import type { SizeLimitCodec, SizeLimitQuality } from '../../common/types.js';
import type { SizeLimitedEncoderCapabilities, SizeLimitedResolvedStrategy } from './types';

export function getEffectiveSizeLimitCodec({ requestedCodec, quality }: {
  requestedCodec: SizeLimitCodec,
  quality: SizeLimitQuality,
}) {
  if (quality === 'fast') return 'h264' satisfies SizeLimitCodec;
  return requestedCodec;
}

export function parseFfmpegEncoderNames(output: string) {
  return new Set(output
    .split(/\r?\n/u)
    .map((line) => line.match(/^[\sA-Z.]+\s+([a-z0-9_]+)\s+/iu)?.[1]?.toLowerCase())
    .filter((encoderName): encoderName is string => encoderName != null));
}

export function resolveSizeLimitedStrategy({ requestedCodec, quality, capabilities }: {
  requestedCodec: SizeLimitCodec,
  quality: SizeLimitQuality,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const effectiveCodec = getEffectiveSizeLimitCodec({ requestedCodec, quality });

  if (quality === 'fast') {
    if (capabilities.h264Nvenc) {
      return {
        requestedCodec,
        effectiveCodec,
        quality,
        id: 'fast_h264_nvenc',
        encoder: 'h264_nvenc',
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: 'single_pass',
      };
    }

    return {
      requestedCodec,
      effectiveCodec,
      quality,
      id: 'fast_h264_cpu',
      encoder: 'libx264',
      hardware: 'cpu',
      usesGpu: false,
      executionMode: 'single_pass',
      fallbackReason: 'h264_nvenc_unavailable',
    };
  }

  if (effectiveCodec === 'av1') {
    if (capabilities.libsvtav1) {
      return {
        requestedCodec,
        effectiveCodec,
        quality,
        id: 'high_quality_av1_cpu',
        encoder: 'libsvtav1',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
      };
    }

    if (capabilities.av1Nvenc) {
      return {
        requestedCodec,
        effectiveCodec,
        quality,
        id: 'high_quality_av1_nvenc',
        encoder: 'av1_nvenc',
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: 'single_pass',
        fallbackReason: 'svt_av1_unavailable',
      };
    }

    return {
      requestedCodec,
      effectiveCodec: 'h264',
      quality,
      id: 'high_quality_h264_cpu',
      encoder: 'libx264',
      hardware: 'cpu',
      usesGpu: false,
      executionMode: 'ffmpeg_two_pass',
      fallbackReason: 'av1_unavailable',
    };
  }

  return {
    requestedCodec,
    effectiveCodec,
    quality,
    id: 'high_quality_h264_cpu',
    encoder: 'libx264',
    hardware: 'cpu',
    usesGpu: false,
    executionMode: 'ffmpeg_two_pass',
  };
}
