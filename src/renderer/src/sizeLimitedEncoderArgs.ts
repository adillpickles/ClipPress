import type { SizeLimitAdvancedNvencPreset } from '../../common/types.js';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import type { SizeLimitedResolvedStrategy } from './sizeLimitedTypes';
// The extension is required because `script/benchmarkSizeLimited.ts` loads this module in plain Node.
import { getAmfQualityPreset, getQsvPreset } from './gpuEncoders.ts';
import type { GpuEncoderName } from './gpuEncoders.ts';

const fastCpuX264Params = 'aq-mode=3:aq-strength=0.8:deblock=-1,-1:rc-lookahead=20:me=hex:subme=6';
const qualityCpuX264Params = 'aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3';
const premiumCpuX264Params = 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=40:me=umh:subme=8:ref=4';
const maxQualitySvtTune = '0';
const longGopSeconds = 10;
const fallbackLongGopFrames = 300;
/** The most frames AMD's H.264 encoder allows between keyframes. */
const maxAmfH264GopFrames = 1000;
const constrainedH264MaxRateFactor = 1.05;
const constrainedH264BufferFactor = 1.5;

export function toKbitrateArg(bitrate: number) {
  return `${Math.max(1, Math.floor(bitrate / 1000))}k`;
}

function getBitrateWindowArgs({ videoBitrate, maxRateFactor, bufferFactor }: {
  videoBitrate: number,
  maxRateFactor: number,
  bufferFactor: number,
}) {
  return [
    '-b:v', toKbitrateArg(videoBitrate),
    '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * maxRateFactor))),
    '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * bufferFactor))),
  ];
}

/**
 * About 10 s between keyframes: at these bitrates each one is costly, and the encoders still add one at a scene cut.
 * In frames of the output, which keeps the source's rate unless it's lowered (a whole-export speed change doesn't
 * raise it: measured CFR 30 at 400%).
 */
function getLongGopFrames({ outputFps, sourceFps }: { outputFps: number | undefined, sourceFps: number | undefined }) {
  const resolvedFps = outputFps ?? sourceFps;
  if (resolvedFps == null || !Number.isFinite(resolvedFps) || resolvedFps <= 0) return fallbackLongGopFrames;
  return Math.max(1, Math.round(resolvedFps * longGopSeconds));
}

/**
 * NVENC in VBR mode treats `-cq` as a quality ceiling: it will not spend more bits than
 * that quality needs, even when the bitrate window allows it. That is what keeps easy
 * content far below the requested file size. On a top-up attempt we lower the number
 * (higher quality) so the encoder can actually use the budget it was given.
 */
const minNvencCq = 10;

/** GPU strategies carry an NVENC-style preset; AMD and Intel translate it to their own scale. */
function getGpuPreset(strategy: SizeLimitedResolvedStrategy): SizeLimitAdvancedNvencPreset {
  const preset = String(strategy.encoderPreset);
  return /^p[1-7]$/u.test(preset) ? preset as SizeLimitAdvancedNvencPreset : 'p6';
}

/**
 * NVENC's own multipass. `fullres` stands in for a 2-pass request (FFmpeg pass logs do
 * nothing for hardware encoders); `qres` is the cheaper default for single-pass quality.
 */
function getNvencMultipassArgs(strategy: SizeLimitedResolvedStrategy, { twoPass, isFast }: { twoPass: boolean, isFast: boolean }) {
  if (strategy.encoderMultipass) return ['-multipass', 'fullres'];
  return !twoPass && !isFast ? ['-multipass', 'qres'] : [];
}

/** Whether the encoder has a quality cap that `qualityCapOffset` relaxes (only AV1 NVENC's `-cq`). */
export function hasQualityCap(encoder: SizeLimitedResolvedStrategy['encoder']) {
  return encoder === 'av1_nvenc';
}

function resolveNvencCq({ baseCq, qualityCapOffset }: { baseCq: number, qualityCapOffset: number | undefined }) {
  if (qualityCapOffset == null || qualityCapOffset <= 0) return String(baseCq);
  return String(Math.max(minNvencCq, baseCq - qualityCapOffset));
}

export function getResolvedVideoArgs({ strategy, videoBitrate, twoPass, videoProfile, sourceFps, qualityCapOffset }: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  twoPass: boolean,
  videoProfile: SizeLimitedVideoTransformProfile,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  qualityCapOffset?: number | undefined,
}) {
  switch (strategy.encoder) {
    case 'libsvtav1': {
      const svtav1Params = strategy.tuningProfile === 'max_quality'
        ? `tune=${maxQualitySvtTune}:keyint=${getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps })}`
        : undefined;
      return [
        '-c:v', 'libsvtav1',
        '-preset', String(strategy.encoderPreset),
        '-pix_fmt', 'yuv420p',
        '-b:v', toKbitrateArg(videoBitrate),
        ...(svtav1Params != null ? ['-svtav1-params', svtav1Params] : []),
      ];
    }

    case 'av1_nvenc': {
      const isMaxQuality = strategy.tuningProfile === 'max_quality';
      const isFast = strategy.tuningProfile === 'fast';
      if (strategy.basicEncoderSettings) {
        return [
          '-c:v', 'av1_nvenc',
          '-preset', String(strategy.encoderPreset),
          '-rc', 'vbr',
          '-cq', resolveNvencCq({ baseCq: isMaxQuality ? 26 : (isFast ? 33 : 28), qualityCapOffset }),
          '-pix_fmt', 'yuv420p',
          ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.05, bufferFactor: 1.5 }),
        ];
      }
      return [
        '-c:v', 'av1_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', isMaxQuality ? 'uhq' : 'hq',
        '-rc', 'vbr',
        ...getNvencMultipassArgs(strategy, { twoPass, isFast }),
        '-cq', resolveNvencCq({ baseCq: isMaxQuality ? 26 : (isFast ? 33 : 28), qualityCapOffset }),
        '-rc-lookahead', isMaxQuality ? '32' : (isFast ? '4' : '20'),
        '-spatial-aq', '1',
        '-temporal-aq', isFast ? '0' : '1',
        '-aq-strength', isMaxQuality ? '10' : (isFast ? '4' : '8'),
        ...(!isFast ? ['-b_ref_mode', 'middle'] : []),
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isMaxQuality ? 1.08 : 1.05,
          bufferFactor: isMaxQuality ? 2.2 : 1.5,
        }),
      ];
    }

    case 'libx264': {
      const isFast = strategy.tuningProfile === 'fast';
      const qualityParams = twoPass || strategy.tuningProfile === 'max_quality' ? premiumCpuX264Params : (isFast ? fastCpuX264Params : qualityCpuX264Params);
      return [
        '-c:v', 'libx264',
        '-preset', String(strategy.encoderPreset),
        '-pix_fmt', 'yuv420p',
        '-x264-params', qualityParams,
        // Keep H.264 size-first so the planner's under-cap budget remains trustworthy.
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: constrainedH264MaxRateFactor,
          bufferFactor: constrainedH264BufferFactor,
        }),
      ];
    }

    case 'h264_nvenc': {
      const isFast = strategy.tuningProfile === 'fast';
      // Without the look-ahead, temporal AQ and B-frames as references a Maxwell card lacks.
      if (strategy.basicEncoderSettings) {
        return [
          '-c:v', 'h264_nvenc',
          '-preset', String(strategy.encoderPreset),
          '-tune', 'hq',
          '-profile:v', 'high',
          '-rc', 'vbr',
          '-multipass', 'qres',
          '-spatial-aq', '1',
          '-aq-strength', isFast ? '6' : '8',
          '-pix_fmt', 'yuv420p',
          ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: constrainedH264MaxRateFactor, bufferFactor: constrainedH264BufferFactor }),
        ];
      }
      return [
        '-c:v', 'h264_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', 'hq',
        '-profile:v', 'high',
        // vbr_hq is deprecated: vbr with the multipass below makes the same file.
        '-rc', 'vbr',
        ...getNvencMultipassArgs(strategy, { twoPass, isFast: false }),
        '-rc-lookahead', isFast ? '12' : '20',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', isFast ? '6' : '8',
        '-strict_gop', '1',
        ...(!isFast ? ['-b_ref_mode', 'middle'] : []),
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: constrainedH264MaxRateFactor,
          bufferFactor: constrainedH264BufferFactor,
        }),
      ];
    }

    // AMD: the quality tools OBS turns on for every AMD card (FFmpeg leaves out what a card can't do), plus its
    // pre-analysis (scene cuts, fast motion) and B-frames where the card has them, except for Fast. The pre-analysis
    // look-ahead stays below 16: a deeper one can deadlock in this FFmpeg (fixed upstream later). The basic settings
    // are the plain ones every driver accepts. `notes/beta6-ux/research/gpu-encoders.md`.
    case 'av1_amf':
    case 'h264_amf': {
      const isAv1 = strategy.encoder === 'av1_amf';
      const isFast = strategy.tuningProfile === 'fast';
      const gopFrames = getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps });
      return [
        '-c:v', strategy.encoder,
        '-usage', 'transcoding',
        '-quality', getAmfQualityPreset(strategy.encoder, getGpuPreset(strategy)),
        ...(strategy.basicEncoderSettings ? [] : [
          ...(isAv1 ? ['-aq_mode', 'caq'] : ['-profile:v', 'high', '-vbaq', '1', '-preencode', '1']),
          '-enforce_hrd', '1',
          '-g', String(isAv1 ? gopFrames : Math.min(gopFrames, maxAmfH264GopFrames)),
          ...(!isFast ? ['-preanalysis', '1', '-pa_lookahead_buffer_depth', '11', '-pa_scene_change_detection_enable', '1', '-pa_high_motion_quality_boost_mode', 'auto', '-high_motion_quality_boost_enable', '1', '-bf', '2'] : []),
        ]),
        '-rc', 'vbr_peak',
        '-pix_fmt', 'nv12',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isAv1 ? 1.08 : constrainedH264MaxRateFactor,
          bufferFactor: isAv1 ? 2 : constrainedH264BufferFactor,
        }),
      ];
    }

    // Intel: High profile, no minimum bitrate (the driver's floor is about 0.9 Mbps at 1080p) and, except for Fast,
    // Intel's own recipe for its look-ahead rate control (Arc and newer; older chips turn it down and get the basic
    // settings). Never `-look_ahead 1`: Arc refuses it. `notes/beta6-ux/research/gpu-encoders.md`.
    case 'av1_qsv':
    case 'h264_qsv': {
      const isAv1 = strategy.encoder === 'av1_qsv';
      const isFast = strategy.tuningProfile === 'fast';
      return [
        '-c:v', strategy.encoder,
        '-preset', getQsvPreset(getGpuPreset(strategy)),
        ...(strategy.basicEncoderSettings ? [] : [
          ...(isAv1 ? [] : ['-profile:v', 'high', '-bitrate_limit', '0']),
          '-g', String(getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps })),
          ...(!isFast ? ['-extbrc', '1', '-look_ahead_depth', '40', '-adaptive_i', '1', '-adaptive_b', '1', '-b_strategy', '1', '-bf', '7'] : []),
        ]),
        '-pix_fmt', 'nv12',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isAv1 ? 1.08 : constrainedH264MaxRateFactor,
          bufferFactor: isAv1 ? 2 : constrainedH264BufferFactor,
        }),
      ];
    }

    default: {
      return [];
    }
  }
}

/**
 * What the encoder check opens a GPU encoder with to see whether it takes the tuned settings: those of the most
 * demanding profile, at a typical bitrate. A card or driver that turns them down keeps to the basic settings.
 */
export function getGpuProbeVideoArgs(encoder: GpuEncoderName) {
  const strategy = {
    encoder,
    encoderPreset: 'p7',
    tuningProfile: 'max_quality',
    encoderMultipass: encoder.endsWith('_nvenc'),
  } as SizeLimitedResolvedStrategy;
  return getResolvedVideoArgs({ strategy, videoBitrate: 2_000_000, twoPass: false, videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: 30 }, sourceFps: 30, outputPlaybackRate: 1 });
}
