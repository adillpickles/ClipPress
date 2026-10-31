import type { FilmstripFrame } from './filmstrip';

function nearestFrame(frames: readonly FilmstripFrame[], time: number) {
  // Frames are sorted by time.
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  const after = frames[low]!;
  const before = frames[low - 1];
  return before != null && time - before.time < after.time - time ? before : after;
}

/**
 * The pictures on an export's progress card: `count` frames spread evenly over the clips being exported, in their
 * order, each the filmstrip frame nearest its time (the timeline made them already). Empty while there are none.
 */
export default function pickExportFrames(frames: readonly FilmstripFrame[], clips: readonly { start: number, end: number }[], count: number) {
  const lengths = clips.map(({ start, end }) => Math.max(0, end - start));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (frames.length === 0 || !(total > 0) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => {
    let at = ((index + 0.5) / count) * total;
    let clip = 0;
    while (clip < clips.length - 1 && at > lengths[clip]!) {
      at -= lengths[clip]!;
      clip += 1;
    }
    return nearestFrame(frames, clips[clip]!.start + Math.min(at, lengths[clip]!)).url;
  });
}
