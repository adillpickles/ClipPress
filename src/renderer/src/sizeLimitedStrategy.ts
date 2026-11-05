import type {
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitControlMode,
  SizeLimitPreset,
  SizeLimitVideoFormat,
} from '../../common/types.js';
import type { SizeLimitedCodec, SizeLimitedEncoderCapabilities, SizeLimitedResolvedStrategy, SizeLimitedStrategyId } from './sizeLimitedTypes';
// The extension is required because `script/benchmarkSizeLimited.ts` loads this module in plain Node.
import { getGpuEncoderInfo, minCpuThreadsForCpuAv1, minCpuThreadsForCpuHevc, pickGpuEncoder } from './gpuEncoders.ts';

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
function gpuFields(gpu: NonNullable<ReturnType<typeof pickGpuEncoder>>, twoPass: boolean, capabilities: SizeLimitedEncoderCapabilities) {
  const basic = capabilities.basicSettingsOnly?.includes(gpu.capability) === true;
  return {
    encoder: gpu.encoder,
    hardware: gpu.vendor,
    usesGpu: true,
    executionMode: 'single_pass',
    // Only NVENC exposes a full-resolution multipass mode (not among its basic settings).
    ...(twoPass && gpu.vendor === 'nvidia' && !basic ? { encoderMultipass: true } : {}),
    ...(basic ? { basicEncoderSettings: true } : {}),
  } as const;
}

/** For Quality and Max quality on NVIDIA's HEVC: its "ultra high quality" tuning, where the card takes it. */
function nvencUhqFields(gpu: NonNullable<ReturnType<typeof pickGpuEncoder>>, capabilities: SizeLimitedEncoderCapabilities) {
  const basic = capabilities.basicSettingsOnly?.includes(gpu.capability) === true;
  return gpu.encoder === 'hevc_nvenc' && capabilities.hevcNvencUhq === true && !basic ? { nvencUhq: true } : {};
}

/**
 * Quality on the graphics card's HEVC. With NVIDIA's "ultra high quality" tuning, p4: 25% quicker than "hq" at p6 on
 * 1080p60 and 13% on 1440p30, for the same picture (measured on an RTX 5060 Ti, three game recordings at the same
 * bitrate, read the way the app reads them: VMAF 0.1 lower on average, better on the hardest clip's worst frames). p5
 * added 0.3 for 38% more time.
 */
function gpuHevcQualityFields(gpu: NonNullable<ReturnType<typeof pickGpuEncoder>>, capabilities: SizeLimitedEncoderCapabilities) {
  const uhq = nvencUhqFields(gpu, capabilities);
  return { encoderPreset: uhq.nvencUhq ? 'p4' : 'p6', ...gpuFields(gpu, false, capabilities), ...uhq } as const;
}

/**
 * Fast on the graphics card's HEVC. NVIDIA: p4, measured better than p3 on every test clip (VMAF +0.7 to +2) for 5% more
 * time. AMD and Intel read the preset on their own scales, unmeasured there, so they keep p3.
 */
function gpuHevcFastFields(gpu: NonNullable<ReturnType<typeof pickGpuEncoder>>, capabilities: SizeLimitedEncoderCapabilities) {
  return { encoderPreset: gpu.encoder === 'hevc_nvenc' ? 'p4' : 'p3', ...gpuFields(gpu, false, capabilities) } as const;
}

export function parseFfmpegEncoderNames(output: string) {
  return new Set(output
    .split(/\r?\n/u)
    .map((line) => line.match(/^[\sA-Z.]+\s+([a-z0-9_]+)\s+/iu)?.[1]?.toLowerCase())
    .filter((encoderName): encoderName is string => encoderName != null));
}

function cpuIsQuickEnough(capabilities: SizeLimitedEncoderCapabilities, minThreads: number) {
  return capabilities.cpuThreads == null || capabilities.cpuThreads >= minThreads;
}

/** Video format AV1: as before HEVC became the default (iPhones play it from the 15 Pro on, and never save it). */
function resolveAv1PresetStrategy({
  preset,
  capabilities,
}: {
  preset: SizeLimitPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const gpuAv1 = pickGpuEncoder(capabilities, 'av1');
  const gpuHevc = pickGpuEncoder(capabilities, 'hevc');
  const gpuH264 = pickGpuEncoder(capabilities, 'h264');

  switch (preset) {
    case 'max_quality': {
      if (capabilities.libsvtav1) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'max_quality_av1_cpu',
          encoder: 'libsvtav1',
          encoderPreset: 5,
          hardware: 'cpu',
          usesGpu: false,
          // A real two-pass since FFmpeg 8.1 (pass 2 reads pass 1's stats): the bits go where the clip needs them, and
          // the size lands within ~1% of the target. An older custom FFmpeg would only encode twice: one pass there.
          executionMode: capabilities.svtTwoPass === false ? 'single_pass' : 'ffmpeg_two_pass',
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
          ...gpuFields(gpuAv1, true, capabilities),
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
          // Two passes at `slow` look the same as at `slower`, in less time (measured).
          encoderPreset: 'slow',
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
        ...gpuFields(h264, true, capabilities),
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
          ...gpuFields(gpuAv1, false, capabilities),
          tuningProfile: 'quality',
        });
      }

      // No GPU AV1 (for example an RTX 20/30-series card, or older AMD and Intel GPUs): the GPU's HEVC, as quick as its
      // H.264 and much sharper at the same size: its speed is worth more than CPU AV1's small edge.
      if (gpuHevc != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'hevc',
          id: 'quality_hevc_gpu',
          ...gpuHevcQualityFields(gpuHevc, capabilities),
          tuningProfile: 'quality',
          fallbackReason: 'gpu_av1_unavailable',
        });
      }

      // Nor HEVC: CPU AV1 keeps the better compression when the CPU can keep up; otherwise the GPU's H.264 encoder is
      // far quicker.
      if (capabilities.libsvtav1 && (cpuIsQuickEnough(capabilities, minCpuThreadsForCpuAv1) || gpuH264 == null)) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'av1',
          id: 'quality_av1_cpu',
          encoder: 'libsvtav1',
          // SVT-AV1 4.2: preset 7 is at least as sharp as 3.1's preset 8, in about the same time (measured).
          encoderPreset: 7,
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
          ...gpuFields(gpuH264, false, capabilities),
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
          ...gpuFields(gpuAv1, false, capabilities),
          tuningProfile: 'fast',
        });
      }

      // Fast is about speed, so any GPU encoder beats CPU AV1 here, HEVC first for its sharper picture.
      if (gpuHevc != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'hevc',
          id: 'fast_hevc_gpu',
          ...gpuHevcFastFields(gpuHevc, capabilities),
          tuningProfile: 'fast',
          fallbackReason: 'gpu_av1_unavailable',
        });
      }

      if (gpuH264 != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset: 'fast',
          effectiveCodec: 'h264',
          id: 'fast_h264_gpu',
          plannerProfileId: 'advanced_h264_nvenc_single_pass',
          encoderPreset: 'p3',
          ...gpuFields(gpuH264, false, capabilities),
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
          // SVT-AV1 4.2: preset 9 is sharper than 3.1's preset 10 (+2-3.5 VMAF) for 8-14% more time (measured).
          encoderPreset: 9,
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

/** CPU H.264 (x264): two passes at `slow` for Max quality (they look the same as at `slower`, in less time). */
function x264Strategy(preset: SizeLimitPreset, fallbackReason: SizeLimitedResolvedStrategy['fallbackReason']) {
  if (preset === 'max_quality') {
    return buildStrategy({
      controlMode: 'simple',
      preset,
      effectiveCodec: 'h264',
      id: 'max_quality_h264_cpu_two_pass',
      encoder: 'libx264',
      encoderPreset: 'slow',
      hardware: 'cpu',
      usesGpu: false,
      executionMode: 'ffmpeg_two_pass',
      tuningProfile: 'max_quality',
      fallbackReason,
    });
  }
  if (preset === 'quality') {
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
      fallbackReason,
    });
  }
  return buildStrategy({
    controlMode: 'simple',
    preset,
    effectiveCodec: 'h264',
    id: 'fast_h264_cpu',
    plannerProfileId: 'quality_h264_cpu',
    encoder: 'libx264',
    encoderPreset: 'veryfast',
    hardware: 'cpu',
    usesGpu: false,
    executionMode: 'single_pass',
    tuningProfile: 'fast',
    fallbackReason,
  });
}

/**
 * The graphics card's H.264: p6 with its full multipass for Max quality, p6 for Quality, p3 for Fast. Without any GPU
 * H.264 either, the NVENC one fails the support check with a clear error.
 */
function gpuH264Strategy(preset: SizeLimitPreset, capabilities: SizeLimitedEncoderCapabilities, fallbackReason: SizeLimitedResolvedStrategy['fallbackReason']) {
  const h264 = pickGpuEncoder(capabilities, 'h264') ?? getGpuEncoderInfo('h264_nvenc')!;
  if (preset === 'max_quality') {
    return buildStrategy({
      controlMode: 'simple',
      preset,
      effectiveCodec: 'h264',
      id: h264.vendor === 'nvidia' ? 'max_quality_h264_nvenc_two_pass' : 'max_quality_h264_gpu',
      plannerProfileId: 'max_quality_h264_nvenc_two_pass',
      encoderPreset: 'p6',
      ...gpuFields(h264, true, capabilities),
      tuningProfile: 'max_quality',
      fallbackReason,
    });
  }
  return buildStrategy({
    controlMode: 'simple',
    preset,
    effectiveCodec: 'h264',
    id: preset === 'quality' ? 'quality_h264_gpu' : 'fast_h264_gpu',
    plannerProfileId: 'advanced_h264_nvenc_single_pass',
    encoderPreset: preset === 'quality' ? 'p6' : 'p3',
    ...gpuFields(h264, false, capabilities),
    tuningProfile: preset,
    fallbackReason,
  });
}

/** CPU HEVC (x265), at the settings measured best for each preset (sizeLimitedEncoderArgs.ts). */
function x265Strategy(preset: SizeLimitPreset, capabilities: SizeLimitedEncoderCapabilities, fallbackReason: SizeLimitedResolvedStrategy['fallbackReason']) {
  if (preset === 'max_quality') {
    return buildStrategy({
      controlMode: 'simple',
      preset,
      effectiveCodec: 'hevc',
      id: 'max_quality_hevc_cpu',
      encoder: 'libx265',
      encoderPreset: 'slow',
      hardware: 'cpu',
      usesGpu: false,
      // A custom FFmpeg without x265's two-pass (`-x265-stats`) makes one pass.
      executionMode: capabilities.x265TwoPass === false ? 'single_pass' : 'ffmpeg_two_pass',
      tuningProfile: 'max_quality',
      fallbackReason,
    });
  }
  return buildStrategy({
    controlMode: 'simple',
    preset,
    effectiveCodec: 'hevc',
    id: preset === 'quality' ? 'quality_hevc_cpu' : 'fast_hevc_cpu',
    encoder: 'libx265',
    encoderPreset: preset === 'quality' ? 'fast' : 'veryfast',
    hardware: 'cpu',
    usesGpu: false,
    executionMode: 'single_pass',
    tuningProfile: preset,
    fallbackReason,
  });
}

/**
 * Video format HEVC, the default: every iPhone and Android phone plays and saves it, and so does every PC with an HEVC
 * decoder (Discord's app plays video on the graphics card only). Every step down stays phone-safe: the graphics card's
 * HEVC, then x265, then H.264. Never AV1.
 */
function resolveHevcPresetStrategy({ preset, capabilities }: {
  preset: SizeLimitPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const gpuHevc = pickGpuEncoder(capabilities, 'hevc');
  const gpuH264 = pickGpuEncoder(capabilities, 'h264');
  const x265 = capabilities.libx265 === true;

  switch (preset) {
    case 'max_quality': {
      // x265's two passes: time doesn't matter within reason (about twice SVT-AV1's at preset 5, measured).
      if (x265) return x265Strategy(preset, capabilities, undefined);
      if (gpuHevc != null) {
        return buildStrategy({
          controlMode: 'simple',
          preset,
          effectiveCodec: 'hevc',
          id: 'max_quality_hevc_gpu',
          encoderPreset: 'p7',
          ...gpuFields(gpuHevc, true, capabilities),
          ...nvencUhqFields(gpuHevc, capabilities),
          tuningProfile: 'max_quality',
          fallbackReason: 'x265_unavailable',
        });
      }
      return capabilities.libx264 ? x264Strategy(preset, 'hevc_unavailable') : gpuH264Strategy(preset, capabilities, 'hevc_unavailable');
    }
    case 'quality': {
      if (gpuHevc != null) {
        return buildStrategy({
          controlMode: 'simple', preset, effectiveCodec: 'hevc', id: 'quality_hevc_gpu', ...gpuHevcQualityFields(gpuHevc, capabilities), tuningProfile: 'quality',
        });
      }
      // A graphics card without HEVC (GTX 600/700, RX 300 and older, Intel before the 6th generation): x265 keeps HEVC's
      // sharper picture when the CPU can keep up; otherwise the card's H.264 is far quicker.
      if (x265 && (cpuIsQuickEnough(capabilities, minCpuThreadsForCpuHevc) || gpuH264 == null)) return x265Strategy(preset, capabilities, 'gpu_hevc_unavailable');
      if (gpuH264 != null) return gpuH264Strategy(preset, capabilities, 'gpu_hevc_unavailable');
      return x264Strategy(preset, 'hevc_unavailable');
    }
    case 'fast': {
      // Fast is about speed: any GPU encoder beats the CPU.
      if (gpuHevc != null) {
        return buildStrategy({
          controlMode: 'simple', preset, effectiveCodec: 'hevc', id: 'fast_hevc_gpu', ...gpuHevcFastFields(gpuHevc, capabilities), tuningProfile: 'fast',
        });
      }
      if (gpuH264 != null) return gpuH264Strategy(preset, capabilities, 'gpu_hevc_unavailable');
      if (x265) return x265Strategy(preset, capabilities, 'gpu_unavailable');
      return x264Strategy(preset, 'gpu_unavailable');
    }
    default: {
      throw new Error(`Unhandled size-limited preset: ${preset}`);
    }
  }
}

/** Video format H.264: plays on anything, old PCs included, a little less sharp. The graphics card first, but for Max quality. */
function resolveH264PresetStrategy({ preset, capabilities }: {
  preset: SizeLimitPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const gpuH264 = pickGpuEncoder(capabilities, 'h264');
  if (preset === 'max_quality') return capabilities.libx264 ? x264Strategy(preset, undefined) : gpuH264Strategy(preset, capabilities, undefined);
  if (gpuH264 != null) return gpuH264Strategy(preset, capabilities, undefined);
  return x264Strategy(preset, 'gpu_unavailable');
}

function resolveSimplePresetStrategy({ preset, videoFormat, capabilities }: {
  preset: SizeLimitPreset,
  videoFormat: SizeLimitVideoFormat,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  if (videoFormat === 'av1') return resolveAv1PresetStrategy({ preset, capabilities });
  if (videoFormat === 'h264') return resolveH264PresetStrategy({ preset, capabilities });
  return resolveHevcPresetStrategy({ preset, capabilities });
}

const advancedGpuIds = {
  av1: { requested: 'av1_nvenc', vendorNeutral: 'advanced_av1_gpu', planner: 'advanced_av1_nvenc_single_pass', twoPass: 'advanced_av1_nvenc_two_pass', singlePass: 'advanced_av1_nvenc_single_pass' },
  hevc: { requested: 'hevc_nvenc', vendorNeutral: 'advanced_hevc_gpu', planner: 'advanced_hevc_nvenc_single_pass', twoPass: 'advanced_hevc_nvenc_two_pass', singlePass: 'advanced_hevc_nvenc_single_pass' },
  h264: { requested: 'h264_nvenc', vendorNeutral: 'advanced_h264_gpu', planner: 'advanced_h264_nvenc_single_pass', twoPass: 'advanced_h264_nvenc_two_pass', singlePass: 'advanced_h264_nvenc_single_pass' },
} as const satisfies Record<SizeLimitedCodec, { requested: SizeLimitAdvancedEncoder, vendorNeutral: SizeLimitedStrategyId, planner: SizeLimitedStrategyId, twoPass: SizeLimitedStrategyId, singlePass: SizeLimitedStrategyId }>;

function resolveAdvancedGpuStrategy({ codec, twoPass, preset, capabilities }: {
  codec: SizeLimitedCodec,
  twoPass: boolean,
  preset: SizeLimitAdvancedNvencPreset,
  capabilities: SizeLimitedEncoderCapabilities,
}): SizeLimitedResolvedStrategy {
  const ids = advancedGpuIds[codec];
  const nvencInfo = getGpuEncoderInfo(ids.requested)!;
  const otherVendor = capabilities[nvencInfo.capability] ? undefined : pickGpuEncoder(capabilities, codec);
  const encoderPreset = sanitizeNvencPreset(preset);

  // The NVIDIA choice also covers AMD and Intel cards, using the same preset level.
  if (otherVendor != null) {
    return buildStrategy({
      controlMode: 'advanced',
      requestedAdvancedEncoder: ids.requested,
      requestedAdvancedTwoPass: twoPass,
      effectiveCodec: codec,
      id: ids.vendorNeutral,
      plannerProfileId: ids.planner,
      encoderPreset,
      ...gpuFields(otherVendor, twoPass, capabilities),
      tuningProfile: 'advanced',
      fallbackReason: 'nvidia_unavailable',
    });
  }

  return buildStrategy({
    controlMode: 'advanced',
    requestedAdvancedEncoder: ids.requested,
    requestedAdvancedTwoPass: twoPass,
    effectiveCodec: codec,
    id: twoPass ? ids.twoPass : ids.singlePass,
    encoderPreset,
    ...gpuFields(nvencInfo, twoPass, capabilities),
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
  advancedHevcCpuPreset,
  advancedHevcNvencPreset,
  capabilities,
}: {
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
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
        executionMode: advancedTwoPass && capabilities.svtTwoPass !== false ? 'ffmpeg_two_pass' : 'single_pass',
        tuningProfile: 'advanced',
      });
    }
    case 'av1_nvenc': {
      return resolveAdvancedGpuStrategy({ codec: 'av1', twoPass: advancedTwoPass, preset: advancedAv1NvencPreset, capabilities });
    }
    case 'h264_nvenc': {
      return resolveAdvancedGpuStrategy({ codec: 'h264', twoPass: advancedTwoPass, preset: advancedH264NvencPreset, capabilities });
    }
    case 'hevc_nvenc': {
      return resolveAdvancedGpuStrategy({ codec: 'hevc', twoPass: advancedTwoPass, preset: advancedHevcNvencPreset, capabilities });
    }
    case 'hevc_cpu': {
      return buildStrategy({
        controlMode: 'advanced',
        requestedAdvancedEncoder: 'hevc_cpu',
        requestedAdvancedTwoPass: advancedTwoPass,
        effectiveCodec: 'hevc',
        id: advancedTwoPass ? 'advanced_hevc_cpu_two_pass' : 'advanced_hevc_cpu_single_pass',
        encoder: 'libx265',
        // x265 takes x264's preset names.
        encoderPreset: sanitizeH264CpuPreset(advancedHevcCpuPreset),
        hardware: 'cpu',
        usesGpu: false,
        executionMode: advancedTwoPass && capabilities.x265TwoPass !== false ? 'ffmpeg_two_pass' : 'single_pass',
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
  videoFormat,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  advancedHevcCpuPreset,
  advancedHevcNvencPreset,
  capabilities,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  /** Settings > Export > Video format, for the presets. */
  videoFormat: SizeLimitVideoFormat,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
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
      advancedHevcCpuPreset,
      advancedHevcNvencPreset,
      capabilities,
    });
  }

  return resolveSimplePresetStrategy({
    preset,
    videoFormat,
    capabilities,
  });
}
