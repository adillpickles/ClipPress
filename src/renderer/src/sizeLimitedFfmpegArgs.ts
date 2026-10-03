// These value imports carry their extension because `script/benchmarkSizeLimited.ts`
// loads this module in plain Node, which (unlike Vite) will not guess it. Type-only
// imports are erased before Node sees them, so they follow the usual house style.
import { getResolvedVideoArgs, toKbitrateArg } from './sizeLimitedEncoderArgs.ts';
import { buildSizeLimitedVideoFilter, sizeLimitedSwsFlags } from './sizeLimitedResolution.ts';
import { isMutedAudioGain } from './util/audioGain.ts';
import { getAudioTempoFilter } from './segmentSpeed.ts';
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

/** Input option: place before every video input so autorotation precedes cropping. */
export function getSizeLimitedRotationArgs(rotation: number | undefined) {
  return rotation !== undefined ? ['-display_rotation:v:0', String(360 - rotation)] : [];
}

export function getSizeLimitedSwsFlagsArgs() {
  return ['-sws_flags', sizeLimitedSwsFlags];
}

export function getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb, audioPlaybackRate = 1 }: {
  audioInputLabel: string | undefined,
  audioBitrate: number,
  audioGainDb?: number | undefined,
  audioPlaybackRate?: number | undefined,
}) {
  if (audioInputLabel == null) return ['-an'];
  const filters = [
    getAudioTempoFilter(audioPlaybackRate),
    audioGainDb != null && Math.abs(audioGainDb) >= 0.01 ? (isMutedAudioGain(audioGainDb) ? 'volume=0' : `volume=${audioGainDb.toFixed(2)}dB`) : '',
  ].filter(Boolean);
  return [
    '-map', audioInputLabel,
    ...(filters.length > 0 ? ['-filter:a', filters.join(',')] : []),
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
  outPath,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
  audioPlaybackRate,
  qualityCapOffset,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  experimentalArgs: string[],
  outPath: string,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
  audioPlaybackRate?: number | undefined,
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
    ...getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb, audioPlaybackRate }),
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
  passlogFile,
  outPath,
  passNumber,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
  audioPlaybackRate,
  qualityCapOffset,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  experimentalArgs: string[],
  passlogFile: string,
  outPath: string,
  passNumber: 1 | 2,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
  audioPlaybackRate?: number | undefined,
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
    ...(passNumber === 1 ? ['-an'] : getSizeLimitedAudioArgs({ audioInputLabel, audioBitrate, audioGainDb, audioPlaybackRate })),
    ...(passNumber === 2 ? ['-movflags', '+faststart'] : []),
    ...experimentalArgs,
    '-f', 'mp4',
    '-y', outPath,
  ];
}
