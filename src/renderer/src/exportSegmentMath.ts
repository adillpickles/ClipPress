import type { DefiniteSegmentBase } from './types';
import { getAudioTempoFilter, getSegmentOutputDuration, getSegmentPlaybackRate, getVideoTimingFilter } from './segmentSpeed';
import { getSegmentCropFilter } from './segmentCrop';
import { getSizeLimitedRotationArgs } from './sizeLimitedFfmpegArgs';

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
}: {
  filePath: string,
  segments: DefiniteSegmentBase[],
  rotation?: number | undefined,
}) {
  return segments.flatMap((segment) => [
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

export function buildSegmentConcatFilters({ segments, videoStreamIndex, audioStreamIndex, outputPlaybackRate, videoWidth, videoHeight }: {
  segments: DefiniteSegmentBase[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  outputPlaybackRate: number,
  videoWidth?: number | undefined,
  videoHeight?: number | undefined,
}) {
  const graph: string[] = [];
  const labels = segments.map((segment, index) => {
    const rate = getSegmentPlaybackRate(segment, outputPlaybackRate);
    const videoLabel = `[segmentv${index}]`;
    const cropFilter = videoWidth != null && videoHeight != null ? getSegmentCropFilter(segment, videoWidth, videoHeight) : undefined;
    graph.push(`[${index}:${videoStreamIndex}]${[getVideoTimingFilter(rate), cropFilter].filter(Boolean).join(',')}${videoLabel}`);
    if (audioStreamIndex == null) return videoLabel;
    const audioLabel = `[segmenta${index}]`;
    const tempo = getAudioTempoFilter(rate);
    graph.push(`[${index}:${audioStreamIndex}]asetpts=PTS-STARTPTS${tempo ? `,${tempo}` : ''}${audioLabel}`);
    return `${videoLabel}${audioLabel}`;
  });
  return { graph, labels: labels.join('') };
}
