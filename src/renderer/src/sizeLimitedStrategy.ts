import type {
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitControlMode,
  SizeLimitPreset,
} from '../../common/types.js';
import type { SizeLimitedEncoderCapabilities, SizeLimitedResolvedStrategy } from './types';

const nvencPresetValues = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const satisfies readonly SizeLimitAdvancedNvencPreset[];
const h264CpuPresetValues = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const satisfies readonly SizeLimitAdvancedH264CpuPreset[];

function clampAv1CpuPreset(preset: SizeLimitAdvancedAv1CpuPreset) {
  return Math.min(13, Math.max(0, Math.round(preset)));
}

function sanitizeNvencPreset(preset: SizeLimitAdvancedNvencPreset) {
  return nvencPresetValues.includes(preset) ? preset : 'p6';
}

function sanitizeH264CpuPreset(preset: SizeLimitAdvancedH264CpuPreset) {
  return h264CpuPresetValues.includes(preset) ? preset : 'slow';
}

function buildStrategy(strategy: Omit<SizeLimitedResolvedStrategy, 'plannerProfileId'> & { plannerProfileId?: SizeLimitedResolvedStrategy['id'] }) {
  return {
    ...strategy,
    plannerProfileId: strategy.plannerProfileId ?? strategy.id,
  } satisfies SizeLimitedResolvedStrategy;
}

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
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_cpu_two_pass',
          encoder: 'libsvtav1',
          encoderPreset: 4,
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'ffmpeg_two_pass',
          tuningProfile: 'max_quality',
        });
      }

      if (capabilities.av1Nvenc) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_nvenc_two_pass',
          encoder: 'av1_nvenc',
          encoderPreset: 'p7',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'ffmpeg_two_pass',
          tuningProfile: 'max_quality',
          fallbackReason: 'svt_av1_unavailable',
        });
      }

      if (capabilities.libx264) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'h264',
          id: 'max_quality_h264_cpu_two_pass',
          encoder: 'libx264',
          encoderPreset: 'slower',
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'ffmpeg_two_pass',
          tuningProfile: 'max_quality',
          fallbackReason: 'av1_unavailable',
        });
      }

      return buildStrategy({
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: 'max_quality_h264_nvenc_two_pass',
        encoder: 'h264_nvenc',
        encoderPreset: 'p6',
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: 'ffmpeg_two_pass',
        tuningProfile: 'max_quality',
        fallbackReason: 'av1_unavailable',
      });
    }
    case 'quality': {
      if (capabilities.av1Nvenc) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'quality_av1_nvenc',
          encoder: 'av1_nvenc',
          encoderPreset: 'p6',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
          tuningProfile: 'quality',
        });
      }

      if (capabilities.libsvtav1) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'quality_av1_cpu',
          encoder: 'libsvtav1',
          encoderPreset: 8,
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'single_pass',
          tuningProfile: 'quality',
          fallbackReason: 'av1_nvenc_unavailable',
        });
      }

      return buildStrategy({
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: 'quality_h264_cpu',
        encoder: 'libx264',
        encoderPreset: 'slow',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        tuningProfile: 'quality',
        fallbackReason: 'av1_unavailable',
      });
    }
    case 'fast': {
      if (capabilities.av1Nvenc) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'av1',
          id: 'fast_av1_nvenc',
          encoder: 'av1_nvenc',
          encoderPreset: 'p3',
          hardware: 'nvidia',
          usesGpu: true,
          executionMode: 'single_pass',
          tuningProfile: 'fast',
        });
      }

      return buildStrategy({
        controlMode: 'simple',
        preset: 'fast',
        effectiveCodec: 'h264',
        id: 'fast_h264_cpu',
        encoder: 'libx264',
        encoderPreset: 'medium',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        tuningProfile: 'fast',
        fallbackReason: 'av1_nvenc_unavailable',
      });
    }
    default: {
      throw new Error(`Unhandled size-limited preset: ${preset}`);
    }
  }
}

function resolveAdvancedStrategy({
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
}: {
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
}): SizeLimitedResolvedStrategy {
  switch (advancedEncoder) {
    case 'av1_cpu': {
      return buildStrategy({
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'av1',
        id: advancedTwoPass ? 'advanced_av1_cpu_two_pass' : 'advanced_av1_cpu_single_pass',
        encoder: 'libsvtav1',
        encoderPreset: clampAv1CpuPreset(advancedAv1CpuPreset),
        hardware: 'cpu',
        usesGpu: false,
        executionMode: advancedTwoPass ? 'ffmpeg_two_pass' : 'single_pass',
        tuningProfile: 'advanced',
      });
    }
    case 'av1_nvenc': {
      return buildStrategy({
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'av1',
        id: advancedTwoPass ? 'advanced_av1_nvenc_two_pass' : 'advanced_av1_nvenc_single_pass',
        encoder: 'av1_nvenc',
        encoderPreset: sanitizeNvencPreset(advancedAv1NvencPreset),
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: advancedTwoPass ? 'ffmpeg_two_pass' : 'single_pass',
        tuningProfile: 'advanced',
      });
    }
    case 'h264_nvenc': {
      return buildStrategy({
        controlMode: 'advanced',
        requestedAdvancedEncoder: advancedEncoder,
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'h264',
        id: advancedTwoPass ? 'advanced_h264_nvenc_two_pass' : 'advanced_h264_nvenc_single_pass',
        encoder: 'h264_nvenc',
        encoderPreset: sanitizeNvencPreset(advancedH264NvencPreset),
        hardware: 'nvidia',
        usesGpu: true,
        executionMode: advancedTwoPass ? 'ffmpeg_two_pass' : 'single_pass',
        tuningProfile: 'advanced',
      });
    }
    case 'h264_cpu': {
      return buildStrategy({
        controlMode: 'advanced',
        requestedAdvancedEncoder: 'h264_cpu',
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'h264',
        id: advancedTwoPass ? 'advanced_h264_cpu_two_pass' : 'advanced_h264_cpu_single_pass',
        encoder: 'libx264',
        encoderPreset: sanitizeH264CpuPreset(advancedH264CpuPreset),
        hardware: 'cpu',
        usesGpu: false,
        executionMode: advancedTwoPass ? 'ffmpeg_two_pass' : 'single_pass',
        tuningProfile: 'advanced',
      });
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
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  capabilities,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  if (controlMode === 'advanced') {
    return resolveAdvancedStrategy({
      advancedEncoder,
      advancedTwoPass,
      advancedAv1CpuPreset,
      advancedAv1NvencPreset,
      advancedH264CpuPreset,
      advancedH264NvencPreset,
    });
  }

  return resolveSimplePresetStrategy({ preset, capabilities });
}
