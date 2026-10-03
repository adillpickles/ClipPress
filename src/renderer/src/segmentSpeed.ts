export interface SpeedSegment {
  start: number,
  end?: number | undefined,
  speed?: number | undefined,
  initial?: true,
}

export const minSegmentSpeed = 0.25;
export const maxSegmentSpeed = 4;

export function isSegmentSpeedValid(speed: number) {
  return Number.isFinite(speed) && speed >= minSegmentSpeed && speed <= maxSegmentSpeed;
}

export function getSegmentSpeed(segment: { speed?: number | undefined }) {
  return segment.speed != null && isSegmentSpeedValid(segment.speed) ? segment.speed : 1;
}

export function getSegmentPlaybackRate(segment: { speed?: number | undefined }, outputPlaybackRate = 1) {
  if (!Number.isFinite(outputPlaybackRate) || outputPlaybackRate <= 0) throw new Error('Invalid playback rate');
  return getSegmentSpeed(segment) * outputPlaybackRate;
}

export function getSegmentOutputDuration(segment: SpeedSegment, outputPlaybackRate?: number, fileDuration?: number) {
  return Math.max(0, (segment.end ?? fileDuration ?? segment.start) - segment.start) / getSegmentPlaybackRate(segment, outputPlaybackRate);
}

/** Each atempo stage stays in its pitch-preserving range, including slow motion. */
export function getAudioTempoFilter(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid playback rate');
  const stages: number[] = [];
  let remaining = rate;
  while (remaining > 2) {
    stages.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining *= 2;
  }
  if (remaining !== 1) stages.push(remaining);
  return stages.map((stage) => `atempo=${stage}`).join(',');
}

export function getVideoTimingFilter(rate: number) {
  return `setpts=(PTS-STARTPTS)/${rate}`;
}

/** Prefer the active occurrence when repeated/overlapping source ranges have different speeds. */
export function getPreviewSegment<T extends SpeedSegment>(segments: T[], activeIndex: number, time: number, fileDuration?: number) {
  const containsTime = (segment: SpeedSegment) => time >= segment.start && time < (segment.end ?? (segment.initial ? fileDuration : undefined) ?? segment.start);
  const active = segments[activeIndex];
  return active != null && containsTime(active) ? active : segments.find((candidate) => containsTime(candidate));
}

export function getPreviewSegmentSpeed(segments: SpeedSegment[], activeIndex: number, time: number, fileDuration?: number) {
  const segment = getPreviewSegment(segments, activeIndex, time, fileDuration);
  return segment != null ? getSegmentSpeed(segment) : 1;
}
