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
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
}

export interface SizeLimitedEncoderCapabilities {
  h264Nvenc: boolean,
  av1Nvenc: boolean,
  libx264: boolean,
  libsvtav1: boolean,
}

export type SizeLimitedStrategyId =
  | 'max_quality_av1_cpu_two_pass'
  | 'max_quality_av1_nvenc_two_pass'
  | 'max_quality_h264_cpu_two_pass'
  | 'max_quality_h264_nvenc_two_pass'
  | 'quality_av1_nvenc'
  | 'quality_av1_cpu'
  | 'quality_h264_cpu'
  | 'fast_av1_nvenc'
  | 'advanced_av1_cpu_single_pass'
  | 'advanced_av1_cpu_two_pass'
  | 'advanced_av1_nvenc_single_pass'
  | 'advanced_av1_nvenc_two_pass'
  | 'advanced_h264_cpu_single_pass'
  | 'advanced_h264_cpu_two_pass'
  | 'advanced_h264_nvenc_single_pass'
  | 'advanced_h264_nvenc_two_pass';

export type SizeLimitedEncoderName = 'h264_nvenc' | 'av1_nvenc' | 'libx264' | 'libsvtav1';

export type SizeLimitedHardwareTarget = 'nvidia' | 'cpu';

export type SizeLimitedExecutionMode = 'single_pass' | 'ffmpeg_two_pass';

export type SizeLimitedTuningProfile = 'max_quality' | 'quality' | 'fast' | 'advanced';

export type SizeLimitedPlannerProfileId = SizeLimitedStrategyId;

export type SizeLimitedEncoderPreset = SizeLimitAdvancedAv1CpuPreset | SizeLimitAdvancedNvencPreset | SizeLimitAdvancedH264CpuPreset;

export interface SizeLimitedResolvedStrategy {
  controlMode: SizeLimitControlMode,
  preset?: SizeLimitPreset | undefined,
  requestedAdvancedEncoder?: SizeLimitAdvancedEncoder | undefined,
  requestedAdvancedTwoPass?: boolean | undefined,
  effectiveCodec: SizeLimitCodec,
  id: SizeLimitedStrategyId,
  plannerProfileId: SizeLimitedPlannerProfileId,
  encoder: SizeLimitedEncoderName,
  encoderPreset: SizeLimitedEncoderPreset,
  hardware: SizeLimitedHardwareTarget,
  usesGpu: boolean,
  executionMode: SizeLimitedExecutionMode,
  tuningProfile: SizeLimitedTuningProfile,
  fallbackReason?: 'av1_unavailable' | 'av1_nvenc_unavailable' | 'h264_nvenc_unavailable' | 'svt_av1_unavailable' | undefined,
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

export interface SizeLimitedProgressMetadata {
  attemptNumber: number,
  maxAttempts: number,
  phaseNumber: number,
  phaseCount: number,
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
  /**
   * Set when the encode succeeded but a step after it (renaming the file into place)
   * did not. The file at `path` is complete and usable; only its name or location is
   * not what was asked for. Never set for a failed encode, which throws instead.
   */
  postProcessingWarning?: string | undefined,
}
