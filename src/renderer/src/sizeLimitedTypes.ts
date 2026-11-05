import type {
  ExportEncodeMode,
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitCodec,
  SizeLimitControlMode,
  SizeLimitPreset,
  SizeLimitSimpleFps,
  SizeLimitSimpleResolution,
  SizeLimitVideoFormat,
} from '../../common/types.js';

/**
 * The vocabulary of size-limited export, kept apart from `types.ts`.
 *
 * `types.ts` describes the running editor and reaches for DOM and Electron types, which
 * ties anything that imports it to the renderer. The size-limited planner, strategy
 * resolution and encoder arguments are plain arithmetic over these shapes, so they are
 * also usable from a plain Node process — which is how the benchmark measures the code
 * that actually ships rather than a copy of it. Re-exported from `types.ts`, so existing
 * imports keep working.
 */

export interface SizeLimitedExportOptions {
  mode: ExportEncodeMode,
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  videoFormat: SizeLimitVideoFormat,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
}

export type SizeLimitedGpuCapability = 'h264Nvenc' | 'av1Nvenc' | 'hevcNvenc' | 'h264Amf' | 'av1Amf' | 'hevcAmf' | 'h264Qsv' | 'av1Qsv' | 'hevcQsv';

/** What a size-limited export makes. */
export type SizeLimitedCodec = SizeLimitCodec | 'hevc';

export interface SizeLimitedEncoderCapabilities {
  h264Nvenc: boolean,
  av1Nvenc: boolean,
  libx264: boolean,
  libsvtav1: boolean,
  /** CPU HEVC (x265): in the bundled FFmpeg; missing counts as unavailable. */
  libx265?: boolean | undefined,
  // AMD and Intel encoders, and the CPU size, are optional so callers that only know about
  // NVENC (such as the benchmark) keep working; missing means unavailable or unknown.
  h264Amf?: boolean | undefined,
  av1Amf?: boolean | undefined,
  h264Qsv?: boolean | undefined,
  av1Qsv?: boolean | undefined,
  hevcNvenc?: boolean | undefined,
  hevcAmf?: boolean | undefined,
  hevcQsv?: boolean | undefined,
  /** Whether SVT-AV1's two-pass is real in this FFmpeg (8.1 and newer); missing means yes, as with the bundled one. */
  svtTwoPass?: boolean | undefined,
  /** Whether this FFmpeg runs x265's two-pass (`-x265-stats`); missing means yes, as with the bundled one. */
  x265TwoPass?: boolean | undefined,
  /** Logical CPU threads, used to decide whether a CPU encode is quick enough to prefer. */
  cpuThreads?: number | undefined,
  /** GPU encoders that open with their basic settings but not the tuned ones (an older card or driver). */
  basicSettingsOnly?: readonly SizeLimitedGpuCapability[] | undefined,
  /**
   * Whether NVIDIA's HEVC opens with its "ultra high quality" tuning (RTX 40 and 50 do; NVIDIA doesn't say which older
   * cards do, so the encoder check asks the card). Missing means no.
   */
  hevcNvencUhq?: boolean | undefined,
}

export type SizeLimitedStrategyId =
  | 'max_quality_hevc_cpu'
  | 'quality_hevc_cpu'
  | 'fast_hevc_cpu'
  | 'max_quality_av1_cpu'
  | 'max_quality_av1_nvenc_two_pass'
  | 'max_quality_h264_cpu_two_pass'
  | 'max_quality_h264_nvenc_two_pass'
  | 'quality_av1_nvenc'
  | 'quality_av1_cpu'
  | 'quality_h264_cpu'
  | 'fast_av1_nvenc'
  // Vendor-neutral paths: AMD and Intel encoders, NVIDIA H.264 where AV1 is missing, and CPU
  // fallbacks for Fast. They borrow the planner budgets of the closest calibrated profile.
  | 'max_quality_av1_gpu'
  | 'max_quality_h264_gpu'
  | 'max_quality_hevc_gpu'
  | 'quality_av1_gpu'
  | 'quality_h264_gpu'
  | 'quality_hevc_gpu'
  | 'fast_av1_gpu'
  | 'fast_hevc_gpu'
  | 'fast_h264_gpu'
  | 'fast_av1_cpu'
  | 'fast_h264_cpu'
  | 'advanced_av1_gpu'
  | 'advanced_h264_gpu'
  | 'advanced_hevc_gpu'
  | 'advanced_hevc_cpu_single_pass'
  | 'advanced_hevc_cpu_two_pass'
  | 'advanced_hevc_nvenc_single_pass'
  | 'advanced_hevc_nvenc_two_pass'
  | 'advanced_av1_cpu_single_pass'
  | 'advanced_av1_cpu_two_pass'
  | 'advanced_av1_nvenc_single_pass'
  | 'advanced_av1_nvenc_two_pass'
  | 'advanced_h264_cpu_single_pass'
  | 'advanced_h264_cpu_two_pass'
  | 'advanced_h264_nvenc_single_pass'
  | 'advanced_h264_nvenc_two_pass';

export type SizeLimitedEncoderName = 'h264_nvenc' | 'av1_nvenc' | 'hevc_nvenc' | 'h264_amf' | 'av1_amf' | 'hevc_amf' | 'h264_qsv' | 'av1_qsv' | 'hevc_qsv' | 'libx264' | 'libx265' | 'libsvtav1';

export type SizeLimitedHardwareTarget = 'nvidia' | 'amd' | 'intel' | 'cpu';

export type SizeLimitedExecutionMode = 'single_pass' | 'ffmpeg_two_pass';

export type SizeLimitedTuningProfile = 'max_quality' | 'quality' | 'fast' | 'advanced';

export type SizeLimitedPlannerProfileId = SizeLimitedStrategyId;

export type SizeLimitedEncoderPreset = SizeLimitAdvancedAv1CpuPreset | SizeLimitAdvancedNvencPreset | SizeLimitAdvancedH264CpuPreset;

export interface SizeLimitedResolvedStrategy {
  controlMode: SizeLimitControlMode,
  preset?: SizeLimitPreset | undefined,
  requestedAdvancedEncoder?: SizeLimitAdvancedEncoder | undefined,
  requestedAdvancedTwoPass?: boolean | undefined,
  effectiveCodec: SizeLimitedCodec,
  id: SizeLimitedStrategyId,
  plannerProfileId: SizeLimitedPlannerProfileId,
  encoder: SizeLimitedEncoderName,
  encoderPreset: SizeLimitedEncoderPreset,
  hardware: SizeLimitedHardwareTarget,
  usesGpu: boolean,
  executionMode: SizeLimitedExecutionMode,
  tuningProfile: SizeLimitedTuningProfile,
  fallbackReason?: 'av1_unavailable' | 'av1_nvenc_unavailable' | 'h264_nvenc_unavailable' | 'svt_av1_unavailable' | 'gpu_av1_unavailable' | 'gpu_hevc_unavailable' | 'hevc_unavailable' | 'x265_unavailable' | 'gpu_unavailable' | 'nvidia_unavailable' | undefined,
  /**
   * Hardware encoders ignore FFmpeg's 2-pass logs, so running one twice only repeats the same
   * encode. A 2-pass GPU strategy instead runs once with the encoder's own full multipass.
   */
  encoderMultipass?: boolean | undefined,
  /** A GPU encoder run with only its basic settings, because this card or driver turned the tuned ones down. */
  basicEncoderSettings?: boolean | undefined,
  /** NVIDIA HEVC with its "ultra high quality" tuning, on a card that takes it (hevcNvencUhq). */
  nvencUhq?: boolean | undefined,
}

export interface SizeLimitedRetryStep {
  attemptNumber: number,
  totalBitrate: number,
  videoBitrate: number,
  audioBitrate: number,
  /**
   * How far to relax the encoder's quality cap on this attempt, in `-cq` points.
   *
   * Set only on a top-up attempt after a large undershoot. The NVENC encoders are driven
   * with both a bitrate window and a `-cq` quality cap, and on easy content (screen
   * capture, static footage) the quality cap binds long before the bitrate does, so the
   * result lands far below the requested size. Raising the bitrate alone changes nothing;
   * the cap has to move with it.
   *
   * Scaled to the size of the gap: relaxing the cap has a much larger effect on output
   * size than the bitrate does, so a fixed relaxation overshoots a near miss while
   * barely denting a big one.
   */
  qualityCapOffset?: number | undefined,
}

/** Why an attempt after the first runs: the last came out over the limit, or well under it (the top-up). */
export type SizeLimitedRetryReason = 'smaller' | 'sharper';

export interface SizeLimitedProgressMetadata {
  attemptNumber: number,
  maxAttempts: number,
  phaseNumber: number,
  phaseCount: number,
  retryReason?: SizeLimitedRetryReason | undefined,
}

export interface SizeLimitedPlan {
  strategyId: SizeLimitedPlannerProfileId,
  hardTargetBytes: number,
  targetZoneMinBytes: number,
  targetZoneMaxBytes: number,
  firstAttemptTargetBytes: number,
  retryTargetBytes: number,
  duration: number,
  overheadBytes: number,
  hasAudio: boolean,
  maxAttempts: number,
  retryMinFactor: number,
  retryMaxFactor: number,
  minTotalBitrate: number,
  /**
   * A result at or below this size wasted enough of the budget to be worth one more
   * attempt at higher quality. Above it, the file is close enough to the requested size
   * that a second encode is not worth the wait.
   */
  undershootRetryBelowBytes: number,
  initialAttempt: SizeLimitedRetryStep,
}

export interface SizeLimitedExecutionResult {
  path: string,
  size: number,
  targetBytes: number,
  attemptCount: number,
  metTarget: boolean,
  created: boolean,
  strategy: SizeLimitedResolvedStrategy,
  /** A copy of the recording's own bytes, as they already fit (lossless when it fits), not an encode. */
  copied?: boolean | undefined,
  /**
   * Set when the encode succeeded but a step after it (renaming the file into place)
   * did not. The file at `path` is complete and usable; only its name or location is
   * not what was asked for. Never set for a failed encode, which throws instead.
   */
  postProcessingWarning?: string | undefined,
}
