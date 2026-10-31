import type { DefiniteSegmentBase } from './types';
import { getAudioTempoFilter, getSegmentOutputDuration, getSegmentPlaybackRate, getVideoTimingFilter } from './segmentSpeed';
import { getGpuFramesFilter } from './gpuEncoders';
import { getSegmentCropFilter } from './segmentCrop';
import { getSizeLimitedRotationArgs } from './sizeLimitedFfmpegArgs';
import { combineAudioGain, getVolumeFilter, isClipVolumeChanged, isNeutralAudioGain } from './util/audioGain';

export function getRelativeSegmentOverlapWindow({
  overlayStart,
  overlayEnd,
  segmentStart,
  segmentEnd,
  outputPlaybackRate,
  timelineOffset = 0,
}: {
  overlayStart: number,
  overlayEnd: number,
  segmentStart: number,
  segmentEnd: number,
  outputPlaybackRate: number,
  timelineOffset?: number,
}) {
  if (!(overlayStart < segmentEnd && overlayEnd > segmentStart)) return undefined;

  return {
    start: timelineOffset + ((Math.max(overlayStart, segmentStart) - segmentStart) / outputPlaybackRate),
    end: timelineOffset + ((Math.min(overlayEnd, segmentEnd) - segmentStart) / outputPlaybackRate),
  };
}

/**
 * Read each text image once. `overlay` repeats a finished input's last frame by default,
 * while `-loop 1` would decode the PNG again for every video frame and slow exports down.
 */
export function buildOverlayImageInputArgs(imagePaths: string[]) {
  return imagePaths.flatMap((imagePath) => ['-i', imagePath]);
}

export function buildConcatSegmentInputArgs({
  filePath,
  segments,
  rotation,
  decodeArgs = [],
}: {
  filePath: string,
  segments: DefiniteSegmentBase[],
  rotation?: number | undefined,
  /** Input options such as hardware decoding, repeated for every segment input. */
  decodeArgs?: string[] | undefined,
}) {
  return segments.flatMap((segment) => [
    ...decodeArgs,
    '-ss', segment.start.toFixed(5),
    '-t', (segment.end - segment.start).toFixed(5),
    ...getSizeLimitedRotationArgs(rotation),
    '-i', filePath,
  ]);
}

/** Reuse each image input across its occurrences, including repeated source ranges. */
export function buildMergedOverlayFilters({ overlayAssets, segments, outputPlaybackRate, imageInputStartIndex, videoInputLabel, videoOutputLabel }: {
  overlayAssets: { start: number, end: number, x: number, y: number }[],
  segments: DefiniteSegmentBase[],
  outputPlaybackRate: number,
  imageInputStartIndex: number,
  videoInputLabel: string,
  videoOutputLabel: string,
}) {
  const occurrences: { start: number, end: number, x: number, y: number, assetIndex: number }[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const segmentOffset = cursor;
    overlayAssets.forEach((asset, assetIndex) => {
      const overlap = getRelativeSegmentOverlapWindow({
        overlayStart: asset.start,
        overlayEnd: asset.end,
        segmentStart: segment.start,
        segmentEnd: segment.end,
        outputPlaybackRate: getSegmentPlaybackRate(segment, outputPlaybackRate),
        timelineOffset: segmentOffset,
      });
      if (overlap != null) occurrences.push({ ...overlap, x: asset.x, y: asset.y, assetIndex });
    });
    cursor += getSegmentOutputDuration(segment, outputPlaybackRate);
  }

  const graph: string[] = [];
  const imageLabels = occurrences.map((occurrence) => `[${imageInputStartIndex + occurrence.assetIndex}:v]`);
  overlayAssets.forEach((_asset, assetIndex) => {
    const indexes = occurrences.flatMap((occurrence, index) => (occurrence.assetIndex === assetIndex ? [index] : []));
    if (indexes.length < 2) return;
    for (const index of indexes) imageLabels[index] = `[overlayImage${index}]`;
    graph.push(`[${imageInputStartIndex + assetIndex}:v]split=${indexes.length}${indexes.map((index) => imageLabels[index]).join('')}`);
  });

  let currentLabel = videoInputLabel;
  occurrences.forEach((occurrence, index) => {
    const nextLabel = index === occurrences.length - 1 ? videoOutputLabel : `[overlayVideo${index}]`;
    graph.push(`${currentLabel}${imageLabels[index]}overlay=${occurrence.x}:${occurrence.y}:enable='between(t,${occurrence.start.toFixed(5)},${occurrence.end.toFixed(5)})'${nextLabel}`);
    currentLabel = nextLabel;
  });
  return { graph, videoOutputLabel: currentLabel };
}

/** An audio track mixed into an export's one track, at its own volume (dB; undefined for as recorded). */
export interface MixedAudioTrack { index: number, gainDb: number | undefined }

/**
 * Every audio track of a recording mixed into one (game and mic on separate tracks, as OBS can record them, each at
 * its own volume): a Discord export has one track, and players only play the first. Added together as they'd be heard
 * (not averaged, which would make both quieter), with a limiter that only touches peaks above full scale (its delay
 * compensated). Each track first starts where it starts in the clip (a mic track that begins late keeps its silence:
 * `amix` alone would pull it to the start). `after` runs on the mix; the graph ends at `outputLabel`.
 */
export function buildAudioMixFilter({ inputIndex, tracks, after = [], outputLabel }: {
  inputIndex: number,
  tracks: readonly MixedAudioTrack[],
  after?: readonly string[] | undefined,
  outputLabel: string,
}) {
  const graph = tracks.map(({ index, gainDb }, track) => `[${inputIndex}:${index}]${['aresample=async=1:first_pts=0', ...(isNeutralAudioGain(gainDb) ? [] : [getVolumeFilter(gainDb!)])].join(',')}[mix${inputIndex}t${track}]`);
  const mix = [`amix=inputs=${tracks.length}:duration=longest:normalize=0`, 'alimiter=limit=1:level=0:latency=1', ...after.filter(Boolean)];
  graph.push(`${tracks.map((_, track) => `[mix${inputIndex}t${track}]`).join('')}${mix.join(',')}${outputLabel}`);
  return graph;
}

export function buildSegmentConcatFilters({ segments, videoStreamIndex, audioStreamIndex, outputPlaybackRate, videoWidth, videoHeight, gpuFrames, mixedAudioTracks }: {
  segments: DefiniteSegmentBase[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  outputPlaybackRate: number,
  videoWidth?: number | undefined,
  videoHeight?: number | undefined,
  /** The inputs' frames stay on the GPU (`getHardwareDecodeArgs`); see `getGpuFramesFilter`. */
  gpuFrames?: { downloadFormat: string, outputFps: number | undefined } | undefined,
  /** Two or more audio tracks, each with its track volume, mixed into one before the clip's speed and volume. */
  mixedAudioTracks?: readonly MixedAudioTrack[] | undefined,
}) {
  const graph: string[] = [];
  const labels = segments.map((segment, index) => {
    const rate = getSegmentPlaybackRate(segment, outputPlaybackRate);
    const videoLabel = `[segmentv${index}]`;
    const cropFilter = videoWidth != null && videoHeight != null ? getSegmentCropFilter(segment, videoWidth, videoHeight) : undefined;
    const gpuFramesFilter = gpuFrames != null ? getGpuFramesFilter({ rate, ...gpuFrames }) : undefined;
    graph.push(`[${index}:${videoStreamIndex}]${[getVideoTimingFilter(rate), gpuFramesFilter, cropFilter].filter(Boolean).join(',')}${videoLabel}`);
    if (audioStreamIndex == null) return videoLabel;
    const audioLabel = `[segmenta${index}]`;
    const tempo = getAudioTempoFilter(rate);
    if (mixedAudioTracks != null && mixedAudioTracks.length > 1) {
      // Mixed: the clip's volume goes into each track's, before the mix and its limiter (as for one clip).
      const tracks = mixedAudioTracks.map((track) => ({ ...track, gainDb: combineAudioGain(track.gainDb, segment) }));
      graph.push(...buildAudioMixFilter({ inputIndex: index, tracks, after: ['asetpts=PTS-STARTPTS', tempo], outputLabel: audioLabel }));
      return `${videoLabel}${audioLabel}`;
    }
    // The clip's own volume; the track volume is applied once, after the concat.
    const clipVolume = isClipVolumeChanged(segment) ? getVolumeFilter(combineAudioGain(undefined, segment)) : undefined;
    graph.push(`[${index}:${audioStreamIndex}]${['asetpts=PTS-STARTPTS', tempo, clipVolume].filter(Boolean).join(',')}${audioLabel}`);
    return `${videoLabel}${audioLabel}`;
  });
  return { graph, labels: labels.join('') };
}
