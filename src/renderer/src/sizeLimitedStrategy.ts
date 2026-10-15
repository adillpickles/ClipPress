import type {
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitControlMode,
  SizeLimitPreset,
} from '../../common/types.js';
import type { SizeLimitedEncoderCapabilities, SizeLimitedResolvedStrategy } from './sizeLimitedTypes';
// The extension is required because `script/benchmarkSizeLimited.ts` loads this module in plain Node.
import { getGpuEncoderInfo, minCpuThreadsForCpuAv1, pickGpuEncoder } from './gpuEncoders.ts';

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

/** Fields shared by every GPU strategy. A 2-pass request becomes one run with the encoder's own multipass. */
function gpuFields(gpu: NonNullable<ReturnType<typeof pickGpuEncoder>>, twoPass: boolean) {
  return {
    encoder: gpu.encoder,
    hardware: gpu.vendor,
    usesGpu: true,
    executionMode: 'single_pass',
    // Only NVENC exposes a full-resolution multipass mode.
    ...(twoPass && gpu.vendor === 'nvidia' ? { encoderMultipass: true } : {}),
  } as const;
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
  const gpuAv1 = pickGpuEncoder(capabilities, 'av1');
  const gpuH264 = pickGpuEncoder(capabilities, 'h264');

  switch (preset) {
    case 'max_quality': {
      if (capabilities.libsvtav1) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_cpu_two_pass',
          encoder: 'libsvtav1',
          encoderPreset: 5,
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'ffmpeg_two_pass',
          tuningProfile: 'max_quality',
        });
      }

      if (gpuAv1 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: gpuAv1.vendor === 'nvidia' ? 'max_quality_av1_nvenc_two_pass' : 'max_quality_av1_gpu',
          plannerProfileId: 'max_quality_av1_nvenc_two_pass',
          encoderPreset: 'p7',
          ...gpuFields(gpuAv1, true),
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

      // Without any GPU H.264 either, this NVENC strategy fails the support check with a clear error.
      const h264 = gpuH264 ?? getGpuEncoderInfo('h264_nvenc')!;
      return buildStrategy({
        controlMode: 'simple',
        preset,
        effectiveCodec: 'h264',
        id: h264.vendor === 'nvidia' ? 'max_quality_h264_nvenc_two_pass' : 'max_quality_h264_gpu',
        plannerProfileId: 'max_quality_h264_nvenc_two_pass',
        encoderPreset: 'p6',
        ...gpuFields(h264, true),
        tuningProfile: 'max_quality',
        fallbackReason: 'av1_unavailable',
      });
    }
    case 'quality': {
      if (gpuAv1 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: gpuAv1.vendor === 'nvidia' ? 'quality_av1_nvenc' : 'quality_av1_gpu',
          plannerProfileId: 'quality_av1_nvenc',
          encoderPreset: 'p6',
          ...gpuFields(gpuAv1, false),
          tuningProfile: 'quality',
        });
      }

      // No GPU AV1 (for example an RTX 20/30-series card, or older AMD and Intel GPUs). CPU AV1
      // keeps the better compression when the CPU can keep up; otherwise the GPU's H.264
      // encoder is far quicker.
      const cpuIsQuickEnough = capabilities.cpuThreads == null || capabilities.cpuThreads >= minCpuThreadsForCpuAv1;
      if (capabilities.libsvtav1 && (cpuIsQuickEnough || gpuH264 == null)) {
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
          fallbackReason: 'gpu_av1_unavailable',
        });
      }

      if (gpuH264 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'h264',
          id: 'quality_h264_gpu',
          plannerProfileId: 'advanced_h264_nvenc_single_pass',
          encoderPreset: 'p6',
          ...gpuFields(gpuH264, false),
          tuningProfile: 'quality',
          fallbackReason: 'gpu_av1_unavailable',
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
      if (gpuAv1 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'av1',
          id: gpuAv1.vendor === 'nvidia' ? 'fast_av1_nvenc' : 'fast_av1_gpu',
          plannerProfileId: 'fast_av1_nvenc',
          encoderPreset: 'p1',
          ...gpuFields(gpuAv1, false),
          tuningProfile: 'fast',
        });
      }

      // Fast is about speed, so any GPU encoder beats CPU AV1 here.
      if (gpuH264 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'h264',
          id: 'fast_h264_gpu',
          plannerProfileId: 'advanced_h264_nvenc_single_pass',
          encoderPreset: 'p3',
          ...gpuFields(gpuH264, false),
          tuningProfile: 'fast',
          fallbackReason: 'gpu_av1_unavailable',
        });
      }

      if (capabilities.libsvtav1) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'av1',
          id: 'fast_av1_cpu',
          plannerProfileId: 'quality_av1_cpu',
          encoder: 'libsvtav1',
          encoderPreset: 10,
          hardware: 'cpu',
          usesGpu: false,
          executionMode: 'single_pass',
          tuningProfile: 'fast',
          fallbackReason: 'gpu_unavailable',
        });
      }

      return buildStrategy({
        controlMode: 'simple',
        preset: 'fast',
        effectiveCodec: 'h264',
        id: 'fast_h264_cpu',
        plannerProfileId: 'quality_h264_cpu',
        encoder: 'libx264',
        encoderPreset: 'veryfast',
        hardware: 'cpu',
        usesGpu: false,
        executionMode: 'single_pass',
        tuningProfile: 'fast',
        fallbackReason: 'gpu_unavailable',
      });
    }
    default: {
      throw new Error(`Unhandled size-limited preset: ${preset}`);
    }
  }
}

function resolveAdvancedGpuStrategy({ codec, twoPass, preset, capabilities }: {
  codec: 'av1' | 'h264',
  twoPass: boolean,
  preset: SizeLimitAdvancedNvencPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const nvencInfo = getGpuEncoderInfo(codec === 'av1' ? 'av1_nvenc' : 'h264_nvenc')!;
  const otherVendor = capabilities[nvencInfo.capability] ? undefined : pickGpuEncoder(capabilities, codec);
  const encoderPreset = sanitizeNvencPreset(preset);

  // The NVIDIA choice also covers AMD and Intel cards, using the same preset level.
  if (otherVendor != null) {
    return buildStrategy({
      controlMode: 'advanced',
      requestedAdvancedEncoder: codec === 'av1' ? 'av1_nvenc' : 'h264_nvenc',
      requestedAdvancedTwoPass: twoPass,
      effectiveCodec: codec,
      id: codec === 'av1' ? 'advanced_av1_gpu' : 'advanced_h264_gpu',
      plannerProfileId: codec === 'av1' ? 'advanced_av1_nvenc_single_pass' : 'advanced_h264_nvenc_single_pass',
      encoderPreset,
      ...gpuFields(otherVendor, twoPass),
      tuningProfile: 'advanced',
      fallbackReason: 'nvidia_unavailable',
    });
  }

  const ids = codec === 'av1'
    ? { twoPass: 'advanced_av1_nvenc_two_pass', singlePass: 'advanced_av1_nvenc_single_pass' } as const
    : { twoPass: 'advanced_h264_nvenc_two_pass', singlePass: 'advanced_h264_nvenc_single_pass' } as const;
  return buildStrategy({
    controlMode: 'advanced',
    requestedAdvancedEncoder: codec === 'av1' ? 'av1_nvenc' : 'h264_nvenc',
    requestedAdvancedTwoPass: twoPass,
    effectiveCodec: codec,
    id: twoPass ? ids.twoPass : ids.singlePass,
    encoderPreset,
    ...gpuFields(nvencInfo, twoPass),
    tuningProfile: 'advanced',
  });
}

function resolveAdvancedStrategy({
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  capabilities,
}: {
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  capabilities: SizeLimitedEncoderCapabilities,
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
      return resolveAdvancedGpuStrategy({ codec: 'av1', twoPass: advancedTwoPass, preset: advancedAv1NvencPreset, capabilities });
    }
    case 'h264_nvenc': {
      return resolveAdvancedGpuStrategy({ codec: 'h264', twoPass: advancedTwoPass, preset: advancedH264NvencPreset, capabilities });
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
      capabilities,
    });
  }

  return resolveSimplePresetStrategy({
    preset,
    capabilities,
  });
}
