import type { SizeLimitAdvancedEncoder, SizeLimitControlMode, SizeLimitPreset } from '../../common/types.js';
import type { SizeLimitedEncoderCapabilities, SizeLimitedResolvedStrategy } from './types';

export function parseFfmpegEncoderNames(output: string) {
  return new Set(output
    .split(/\r?\n/u)
    .map((line) => line.match(/^[\sA-Z.]+\s+([a-z0-9_]+)\s+/iu)?.[1]?.toLowerCase())
    .filter((encoderName): encoderName is string => encoderName != null));
}

function resolveSimplePresetStrategy({
  preset,
  capabilities,
}: {
  preset: SizeLimitPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  switch (preset) {
    case 'max_quality': {
      if (capabilities.libsvtav1) {
        return {
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_cpu',
          encoder: 'libsvtav1',
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'single_pass',
        };
      }

      if (capabilities.av1Nvenc) {
        return {
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_nvenc',
          encoder: 'av1_nvenc',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
          fallbackReason: 'svt_av1_unavailable',
        };
      }

      return {
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: 'max_quality_h264_cpu_two_pass',
        encoder: 'libx264',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'ffmpeg_two_pass',
        fallbackReason: 'av1_unavailable',
      };
    }
    case 'quality': {
      if (capabilities.av1Nvenc) {
        return {
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'quality_av1_nvenc',
          encoder: 'av1_nvenc',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
        };
      }

      if (capabilities.libsvtav1) {
        return {
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'quality_av1_cpu',
          encoder: 'libsvtav1',
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'single_pass',
          fallbackReason: 'av1_nvenc_unavailable',
        };
      }

      return {
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: 'quality_h264_cpu',
        encoder: 'libx264',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        fallbackReason: 'av1_unavailable',
      };
    }
    case 'ultra_fast': {
      if (capabilities.h264Nvenc) {
        return {
          controlMode: 'simple',
          preset,
          effectiveCodec: 'h264',
          id: 'ultra_fast_h264_nvenc',
          encoder: 'h264_nvenc',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
        };
      }

      return {
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: 'ultra_fast_h264_cpu',
        encoder: 'libx264',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        fallbackReason: 'h264_nvenc_unavailable',
      };
    }
    case 'fast': {
      if (capabilities.h264Nvenc) {
        return {
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'h264',
          id: 'fast_h264_nvenc',
          encoder: 'h264_nvenc',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
        };
      }

      return {
        controlMode: 'simple',
        preset: 'fast',
        effectiveCodec: 'h264',
        id: 'fast_h264_cpu',
        encoder: 'libx264',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        fallbackReason: 'h264_nvenc_unavailable',
      };
    }
    default: {
      throw new Error(`Unhandled size-limited preset: ${preset}`);
    }
  }
}

function resolveAdvancedStrategy({
  advancedEncoder,
  advancedTwoPass,
}: {
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
}): SizeLimitedResolvedStrategy {
  switch (advancedEncoder) {
    case 'av1_cpu': {
      return {
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: false,
        effectiveCodec: 'av1',
        id: 'advanced_av1_cpu',
        encoder: 'libsvtav1',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
      };
    }
    case 'av1_nvenc': {
      return {
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: false,
        effectiveCodec: 'av1',
        id: 'advanced_av1_nvenc',
        encoder: 'av1_nvenc',
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: 'single_pass',
      };
    }
    case 'h264_nvenc': {
      return {
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: false,
        effectiveCodec: 'h264',
        id: 'advanced_h264_nvenc',
        encoder: 'h264_nvenc',
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: 'single_pass',
      };
    }
    case 'h264_cpu': {
      return {
        controlMode: 'advanced',
        requestedAdvancedEncoder: 'h264_cpu',
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'h264',
        id: advancedTwoPass ? 'advanced_h264_cpu_two_pass' : 'advanced_h264_cpu_single_pass',
        encoder: 'libx264',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: advancedTwoPass ? 'ffmpeg_two_pass' : 'single_pass',
      };
    }
    default: {
      throw new Error(`Unhandled advanced encoder: ${advancedEncoder}`);
    }
  }
}

export function resolveSizeLimitedStrategy({
  controlMode,
  preset,
  advancedEncoder,
  advancedTwoPass,
  capabilities,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  if (controlMode === 'advanced') {
    return resolveAdvancedStrategy({ advancedEncoder, advancedTwoPass });
  }

  return resolveSimplePresetStrategy({ preset, capabilities });
}
