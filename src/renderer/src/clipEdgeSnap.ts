/** A clip's edges, as far as snapping is concerned (an unfinished clip has no end yet). */
interface SnapClip {
  start: number,
  end?: number | undefined,
}

/** A gap this wide on the timeline can be seen, so I and O never snap across it. */
const visibleGapPx = 2;

/**
 * How close the playhead must be to a clip edge for I and O to lock onto it: 3 frames with the whole recording in view,
 * 1 frame once zoomed in at all, and never across a gap you can see on the timeline (a short recording, or deep zoom),
 * so a frame-exact place right next to an edge is always reachable.
 */
export function getEdgeSnapDistance({ duration, zoom, fps, laneWidthPx }: {
  duration: number,
  zoom: number,
  fps: number | undefined,
  /** The timeline's width on screen, when known. */
  laneWidthPx?: number | undefined,
}) {
  const frame = fps != null && fps > 0 ? 1 / fps : 1 / 30;
  // A hair over, so a playhead exactly that many frames off still counts.
  const byFrames = ((zoom > 1 ? 1 : 3) + 0.05) * frame;
  if (laneWidthPx == null || !(laneWidthPx > 0)) return byFrames;
  return Math.min(byFrames, (visibleGapPx * duration) / zoom / laneWidthPx);
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

/**
 * The clip edge (a start or an end) before or after `time`, for Alt+← / →; the recording's start and end count too.
 * Edges within half a frame of `time` are where the playhead already is, so they're passed by.
 */
export function findClipEdge({ time, clips, duration, direction, frame }: {
  time: number,
  clips: readonly SnapClip[],
  duration: number,
  direction: -1 | 1,
  frame: number,
}) {
  const edges = [0, duration, ...clips.flatMap((clip) => (clip.end != null ? [clip.start, clip.end] : [clip.start]))];
  const ahead = edges.filter((edge) => (direction < 0 ? edge < time - frame / 2 : edge > time + frame / 2));
  if (ahead.length === 0) return undefined;
  return direction < 0 ? Math.max(...ahead) : Math.min(...ahead);
}

/** Where a new clip starting at `start` should end by default: `length` later, but not running into the next clip. */
export function getNewClipEnd({ start, length, duration, clips }: { start: number, length: number, duration: number, clips: readonly SnapClip[] }) {
  const nextStart = Math.min(...clips.flatMap((clip) => (clip.start > start ? [clip.start] : [])));
  return Math.min(start + length, duration, nextStart);
}
