import type { DefiniteSegmentBase } from './types';
import { getAudioTempoFilter, getSegmentPlaybackRate, getVideoTimingFilter } from './segmentSpeed';

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

export function buildConcatSegmentInputArgs({
  filePath,
  segments,
}: {
  filePath: string,
  segments: DefiniteSegmentBase[],
}) {
  return segments.flatMap((segment) => [
    '-ss', segment.start.toFixed(5),
    '-t', (segment.end - segment.start).toFixed(5),
    '-i', filePath,
  ]);
}

export function buildSegmentConcatFilters({ segments, videoStreamIndex, audioStreamIndex, outputPlaybackRate }: {
  segments: DefiniteSegmentBase[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  outputPlaybackRate: number,
}) {
  const graph: string[] = [];
  const labels = segments.map((segment, index) => {
    const rate = getSegmentPlaybackRate(segment, outputPlaybackRate);
    const videoLabel = `[segmentv${index}]`;
    graph.push(`[${index}:${videoStreamIndex}]${getVideoTimingFilter(rate)}${videoLabel}`);
    if (audioStreamIndex == null) return videoLabel;
    const audioLabel = `[segmenta${index}]`;
    const tempo = getAudioTempoFilter(rate);
    graph.push(`[${index}:${audioStreamIndex}]asetpts=PTS-STARTPTS${tempo ? `,${tempo}` : ''}${audioLabel}`);
    return `${videoLabel}${audioLabel}`;
  });
  return { graph, labels: labels.join('') };
}
