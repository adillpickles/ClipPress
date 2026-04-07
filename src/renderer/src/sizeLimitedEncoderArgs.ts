import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import type { SizeLimitedResolvedStrategy } from './types';

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

export function getResolvedVideoArgs({ strategy, videoBitrate, twoPass, videoProfile, sourceFps, outputPlaybackRate }: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  twoPass: boolean,
  videoProfile: SizeLimitedVideoTransformProfile,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
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
        ...(!twoPass && !isFast ? ['-multipass', 'qres'] : []),
        '-cq', isMaxQuality ? '26' : (isFast ? '33' : '28'),
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
      const useFastCbr = strategy.id === 'fast_h264_nvenc';
      return [
        '-c:v', 'h264_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', 'hq',
        '-profile:v', 'high',
        '-rc', useFastCbr ? 'cbr_hq' : 'vbr_hq',
        ...(twoPass || useFastCbr ? [] : ['-multipass', 'qres']),
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

    default: {
      return [];
    }
  }
}
