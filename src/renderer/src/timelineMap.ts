import { getSegmentSpeed } from './segmentSpeed';

interface TimelinePiece {
  sourceStart: number,
  sourceEnd: number,
  displayStart: number,
  /** Display seconds per source second. */
  scale: number,
}

export interface TimelineMap {
  /** Source seconds → timeline (display) seconds. */
  toDisplay: (sourceTime: number) => number,
  /** Timeline (display) seconds → source seconds. */
  toSource: (displayTime: number) => number,
  displayDuration: number,
  pieces: TimelinePiece[],
}

/**
 * Lays the source file out the way the edit plays: a retimed segment occupies its output
 * length and everything after it ripples, like Resolve's retime controls. Cut gaps stay at
 * normal speed. Where segments overlap, the first one in segment order sets the rate.
 */
export function createTimelineMap(segments: { start: number, end?: number | undefined, speed?: number | undefined }[], fileDuration: number): TimelineMap {
  const retimed = segments.filter((segment): segment is typeof segment & { end: number } => (
    segment.end != null && segment.end > segment.start && getSegmentSpeed(segment) !== 1
  ));
  const clamp = (time: number) => Math.min(fileDuration, Math.max(0, time));
  const edges = [...new Set([0, fileDuration, ...retimed.flatMap((segment) => [clamp(segment.start), clamp(segment.end)])])].sort((a, b) => a - b);

  const pieces: TimelinePiece[] = [];
  let displayStart = 0;
  for (let i = 0; i < edges.length - 1; i += 1) {
    const sourceStart = edges[i]!;
    const sourceEnd = edges[i + 1]!;
    const owner = retimed.find((segment) => segment.start <= sourceStart && segment.end >= sourceEnd);
    const scale = owner != null ? 1 / getSegmentSpeed(owner) : 1;
    const last = pieces.at(-1);
    if (last != null && last.scale === scale) {
      last.sourceEnd = sourceEnd;
    } else {
      pieces.push({ sourceStart, sourceEnd, displayStart, scale });
    }
    displayStart += (sourceEnd - sourceStart) * scale;
  }
  if (pieces.length === 0) pieces.push({ sourceStart: 0, sourceEnd: fileDuration, displayStart: 0, scale: 1 });

  const displayDuration = displayStart;

  // Times outside the file extrapolate at normal speed from the nearest end.
  const toDisplay = (sourceTime: number) => {
    const piece = pieces.find((candidate) => sourceTime < candidate.sourceEnd) ?? pieces.at(-1)!;
    if (sourceTime < piece.sourceStart) return piece.displayStart - (piece.sourceStart - sourceTime);
    const within = Math.min(sourceTime, piece.sourceEnd) - piece.sourceStart;
    return piece.displayStart + (within * piece.scale) + Math.max(0, sourceTime - piece.sourceEnd);
  };

  const toSource = (displayTime: number) => {
    const piece = pieces.find((candidate) => displayTime < candidate.displayStart + ((candidate.sourceEnd - candidate.sourceStart) * candidate.scale)) ?? pieces.at(-1)!;
    if (displayTime < piece.displayStart) return piece.sourceStart - (piece.displayStart - displayTime);
    const pieceDisplayEnd = piece.displayStart + ((piece.sourceEnd - piece.sourceStart) * piece.scale);
    const within = Math.min(displayTime, pieceDisplayEnd) - piece.displayStart;
    return piece.sourceStart + (within / piece.scale) + Math.max(0, displayTime - pieceDisplayEnd);
  };

  return { toDisplay, toSource, displayDuration, pieces };
}

/**
 * Splits an image covering source [from, to] into one clipped span per timeline piece, so
 * waveforms stretch inside slowed segments and compress inside sped-up ones.
 * Percentages are relative to a lane spanning `laneDuration` (outer) and to each span (inner).
 */
export function getWarpedImageSpans(map: TimelineMap, from: number, to: number, laneDuration = map.displayDuration) {
  if (!(to > from) || !(laneDuration > 0)) return [];
  return map.pieces.flatMap((piece) => {
    const start = Math.max(from, piece.sourceStart);
    const end = Math.min(to, piece.sourceEnd);
    if (!(end > start)) return [];
    const displayStart = map.toDisplay(start);
    const spanDisplay = map.toDisplay(end) - displayStart;
    if (!(spanDisplay > 0)) return [];
    return [{
      left: (displayStart / laneDuration) * 100,
      width: (spanDisplay / laneDuration) * 100,
      innerLeft: (-((start - from) * piece.scale) / spanDisplay) * 100,
      innerWidth: (((to - from) * piece.scale) / spanDisplay) * 100,
    }];
  });
}
