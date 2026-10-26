/** A clip's edges, as far as snapping is concerned (an unfinished clip has no end yet). */
interface SnapClip {
  start: number,
  end?: number | undefined,
}

/**
 * How close the playhead must be to a clip edge for I and O to lock onto it: about 8 px of the timeline at its current
 * zoom (0.7% of what's in view), but never less than 1.5 frames, so a playhead a frame off still lands on the edge, nor
 * more than half a second, so a moment chosen by playing up to it isn't moved far. Zooming in makes it smaller, which is
 * how a frame-exact place right next to an edge is still reached.
 */
export function getEdgeSnapDistance({ visibleDuration, fps }: { visibleDuration: number, fps: number | undefined }) {
  const frame = fps != null && fps > 0 ? 1 / fps : 1 / 30;
  return Math.min(Math.max(visibleDuration * 0.007, frame * 1.5), 0.5);
}

function nearest(time: number, edges: number[], distance: number) {
  let best: number | undefined;
  edges.forEach((edge) => {
    const gap = Math.abs(edge - time);
    if (gap <= distance && (best == null || gap < Math.abs(best - time))) best = edge;
  });
  return best;
}

/**
 * Where I starts a clip when the playhead is just next to the end of a clip (this one's included): exactly at that end,
 * so the clips sit back to back, neither overlapping nor leaving a sliver of a gap. Undefined when no end is near.
 * The current clip's own start isn't an edge to snap to, so its start can still be moved a frame.
 */
export function snapCutStart({ time, clips, distance }: { time: number, clips: readonly SnapClip[], distance: number }) {
  return nearest(time, clips.flatMap((clip) => (clip.end != null ? [clip.end] : [])), distance);
}

/**
 * Where O ends the current clip when the playhead is just next to where another clip starts: exactly there. Undefined
 * when no start is near. Only starts after this clip's own start count, so the clip never ends up empty.
 */
export function snapCutEnd({ time, clips, currentIndex, distance }: { time: number, clips: readonly SnapClip[], currentIndex: number, distance: number }) {
  const current = clips[currentIndex];
  if (current == null) return undefined;
  return nearest(time, clips.flatMap((clip, index) => (index !== currentIndex && clip.start > current.start ? [clip.start] : [])), distance);
}

/** Where a new clip starting at `start` should end by default: `length` later, but not running into the next clip. */
export function getNewClipEnd({ start, length, duration, clips }: { start: number, length: number, duration: number, clips: readonly SnapClip[] }) {
  const nextStart = Math.min(...clips.flatMap((clip) => (clip.start > start ? [clip.start] : [])));
  return Math.min(start + length, duration, nextStart);
}
