import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useReducedMotionConfig } from 'motion/react';

/** I, O, undo and the like move a clip's edges with a short glide: quick, but clearly a move. */
export const glideMs = 180;
const easeOut = (progress: number) => 1 - ((1 - progress) ** 3);

interface Edges { start: number, end: number | undefined }
type Shown = ReadonlyMap<string, Edges>;

const sameEdges = (a: Edges | undefined, b: Edges) => a != null && a.start === b.start && a.end === b.end;

/**
 * The clips as the timeline draws them: when an edit moves a clip's edges, they glide from where they're shown to the
 * new place. Every lane draws from this one list (the clip block with its frames, its audio and the waveform, its speed
 * band), so they move as one, in every frame. At once while something is dragged (`instant`: the edge follows the
 * pointer) and with Reduce motion. Only for drawing: everything else uses the clips themselves.
 */
export default function useGlidingSegments<T extends { segId: string, start: number, end?: number | undefined }>(segments: readonly T[], instant: boolean): readonly T[] {
  const reduceMotion = useReducedMotionConfig() === true;
  const still = instant || reduceMotion;
  const [shown, setShown] = useState<Shown>(() => new Map(segments.map((seg) => [seg.segId, { start: seg.start, end: seg.end }])));
  // What's on screen right now, for a glide that starts mid-way through another.
  const shownRef = useRef(shown);
  useLayoutEffect(() => { shownRef.current = shown; }, [shown]);

  // Started before the edit's frame is painted, and timed from then, so the first frame already moves.
  useLayoutEffect(() => {
    const targets = new Map(segments.map((seg) => [seg.segId, { start: seg.start, end: seg.end }]));
    const from = shownRef.current;
    const moving = [...targets].filter(([segId, edges]) => from.has(segId) && !sameEdges(from.get(segId), edges));
    const changed = moving.length > 0 || targets.size !== from.size || [...targets.keys()].some((segId) => !from.has(segId));
    if (!changed) return undefined;
    let frame: number;
    if (still || moving.length === 0) {
      // Nothing to glide (a clip added or removed, or a drag): the shown edges catch up.
      frame = requestAnimationFrame(() => setShown(targets));
    } else {
      // Counted from a frame ago: the key's own frame (whose clock reads earlier than now) already takes the first step.
      const startAt = performance.now() - (1000 / 60);
      const step = (time: number) => {
        const progress = Math.min(1, Math.max(0, time - startAt) / glideMs);
        const eased = easeOut(progress);
        const lerp = (a: number, b: number) => a + ((b - a) * eased);
        // Drawn in this very frame (an update from here would otherwise wait for the next one).
        flushSync(() => setShown(new Map([...targets].map(([segId, to]) => {
          const was = from.get(segId);
          if (was == null || progress >= 1) return [segId, to];
          return [segId, { start: lerp(was.start, to.start), end: was.end != null && to.end != null ? lerp(was.end, to.end) : to.end }];
        }))));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(frame);
  }, [segments, still]);

  return useMemo(() => {
    if (still) return segments;
    let any = false;
    const drawn = segments.map((seg) => {
      const edges = shown.get(seg.segId);
      if (edges == null || sameEdges(edges, { start: seg.start, end: seg.end })) return seg;
      any = true;
      return { ...seg, start: edges.start, end: edges.end };
    });
    return any ? drawn : segments;
  }, [segments, shown, still]);
}
