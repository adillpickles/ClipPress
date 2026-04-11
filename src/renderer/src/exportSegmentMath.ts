import type { DefiniteSegmentBase } from './types';

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
  outputPlaybackRate,
}: {
  filePath: string,
  segments: DefiniteSegmentBase[],
  outputPlaybackRate: number,
}) {
  return segments.flatMap((segment) => [
    ...(outputPlaybackRate !== 1 ? ['-itsscale', String(1 / outputPlaybackRate)] : []),
    '-ss', segment.start.toFixed(5),
    '-t', (segment.end - segment.start).toFixed(5),
    '-i', filePath,
  ]);
}
