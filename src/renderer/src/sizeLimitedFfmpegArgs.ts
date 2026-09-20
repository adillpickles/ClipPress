// These value imports carry their extension because `script/benchmarkSizeLimited.ts`
// loads this module in plain Node, which (unlike Vite) will not guess it. Type-only
// imports are erased before Node sees them, so they follow the usual house style.
import { getResolvedVideoArgs, toKbitrateArg } from './sizeLimitedEncoderArgs.ts';
import { buildSizeLimitedVideoFilter, sizeLimitedSwsFlags } from './sizeLimitedResolution.ts';
import { isMutedAudioGain } from './util/audioGain.ts';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import type { SizeLimitedResolvedStrategy } from './sizeLimitedTypes';

/**
 * The ffmpeg output arguments a size-limited encode is made of.
 *
 * Kept free of `window`, the renderer's DOM types and the ffmpeg runner, so the same
 * argument list can be built from a plain Node process. That is what lets the benchmark
 * measure the commands ClipPress actually runs instead of a parallel copy of them that
 * drifts.
 *
 * `experimentalArgs` is passed in rather than derived here, because deciding whether the
 * experimental flag is on belongs to the app's settings, not to argument assembly.
 */

export function getSizeLimitedRotationArgs(rotation: number | undefined) {
  return rotation !== undefined ? ['-display_rotation:v:0', String(360 - rotation)] : [];
}

export function getSizeLimitedSwsFlagsArgs() {
  return ['-sws_flags', sizeLimitedSwsFlags];
}

export function getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb }: {
  audioInputLabel: string | undefined,
  audioBitrate: number,
  audioGainDb?: number | undefined,
}) {
  if (audioInputLabel == null) return ['-an'];
  return [
    '-map', audioInputLabel,
    ...(audioGainDb != null && Math.abs(audioGainDb) >= 0.01 ? ['-filter:a', isMutedAudioGain(audioGainDb) ? 'volume=0' : `volume=${audioGainDb.toFixed(2)}dB`] : []),
    '-c:a', 'aac', '-b:a', toKbitrateArg(audioBitrate), '-ac', '2',
  ];
}

export function getSizeLimitedCommonEncodeArgs({
  strategy,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  videoProfile,
  experimentalArgs,
  rotation,
  outPath,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
  qualityCapOffset,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  experimentalArgs: string[],
  rotation: number | undefined,
  outPath: string,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
  qualityCapOffset?: number | undefined,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...getResolvedVideoArgs({ strategy, videoBitrate, twoPass: false, videoProfile, sourceFps, outputPlaybackRate, qualityCapOffset }),
    ...(videoFilter != null ? ['-vf', videoFilter] : []),
    ...getSizeLimitedRotationArgs(rotation),
    ...getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb }),
    '-movflags', '+faststart',
    ...experimentalArgs,
    '-f', 'mp4',
    '-y', outPath,
  ];
}

export function getSizeLimitedTwoPassEncodeArgs({
  strategy,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  videoProfile,
  experimentalArgs,
  rotation,
  passlogFile,
  outPath,
  passNumber,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
  qualityCapOffset,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  experimentalArgs: string[],
  rotation: number | undefined,
  passlogFile: string,
  outPath: string,
  passNumber: 1 | 2,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
  qualityCapOffset?: number | undefined,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...getResolvedVideoArgs({ strategy, videoBitrate, twoPass: true, videoProfile, sourceFps, outputPlaybackRate, qualityCapOffset }),
    ...(videoFilter != null ? ['-vf', videoFilter] : []),
    '-pass', String(passNumber),
    '-passlogfile', passlogFile,
    ...getSizeLimitedRotationArgs(rotation),
    ...(passNumber === 1 ? ['-an'] : getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb })),
    ...(passNumber === 2 ? ['-movflags', '+faststart'] : []),
    ...experimentalArgs,
    '-f', 'mp4',
    '-y', outPath,
  ];
}
