import type { SizeLimitAdvancedNvencPreset } from '../../common/types.js';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import type { SizeLimitedResolvedStrategy } from './sizeLimitedTypes';
// The extension is required because `script/benchmarkSizeLimited.ts` loads this module in plain Node.
import { getAmfQualityPreset, getQsvPreset } from './gpuEncoders.ts';

const fastCpuX264Params = 'aq-mode=3:aq-strength=0.8:deblock=-1,-1:rc-lookahead=20:me=hex:subme=6';
const qualityCpuX264Params = 'aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3';
const premiumCpuX264Params = 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=40:me=umh:subme=8:ref=4';
const maxQualitySvtTune = '0';
const maxQualityGopSeconds = 10;
const fallbackMaxQualityKeyintFrames = 300;
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

function getMaxQualityKeyintFrames({
  outputFps,
  sourceFps,
  outputPlaybackRate,
}: {
  outputFps: number | undefined,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
}) {
  const resolvedFps = outputFps ?? (sourceFps != null && Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps * outputPlaybackRate : undefined);
  if (resolvedFps == null || !Number.isFinite(resolvedFps) || resolvedFps <= 0) return fallbackMaxQualityKeyintFrames;
  return Math.max(1, Math.round(resolvedFps * maxQualityGopSeconds));
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

export function getResolvedVideoArgs({ strategy, videoBitrate, twoPass, videoProfile, sourceFps, outputPlaybackRate, qualityCapOffset }: {
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
        ? `tune=${maxQualitySvtTune}:keyint=${getMaxQualityKeyintFrames({
          outputFps: videoProfile.outputFps,
          sourceFps,
          outputPlaybackRate,
        })}`
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
      return [
        '-c:v', 'h264_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', 'hq',
        '-profile:v', 'high',
        '-rc', 'vbr_hq',
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

    // AMD and Intel arguments stay close to defaults every driver generation accepts: a
    // peak-constrained bitrate window plus the vendor's quality preset. If a driver still
    // rejects them, the export retries on the next encoder (see sizeLimitedExport).
    case 'av1_amf':
    case 'h264_amf': {
      const isAv1 = strategy.encoder === 'av1_amf';
      return [
        '-c:v', strategy.encoder,
        '-usage', 'transcoding',
        '-quality', getAmfQualityPreset(strategy.encoder, getGpuPreset(strategy)),
        '-rc', 'vbr_peak',
        '-pix_fmt', 'nv12',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isAv1 ? 1.08 : constrainedH264MaxRateFactor,
          bufferFactor: isAv1 ? 2 : constrainedH264BufferFactor,
        }),
      ];
    }

    case 'av1_qsv':
    case 'h264_qsv': {
      const isAv1 = strategy.encoder === 'av1_qsv';
      return [
        '-c:v', strategy.encoder,
        '-preset', getQsvPreset(getGpuPreset(strategy)),
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
