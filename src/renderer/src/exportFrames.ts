import type { AudioPeaks } from './audioPeaks';
import type { FilmstripFrame } from './filmstrip';

/** A clip being exported: where it is in the recording, and how long it lasts in the export (after its speed). */
export interface ExportStripClip { start: number, end: number, outputDuration: number }

function spreadTotal(clips: readonly ExportStripClip[]) {
  return clips.reduce((sum, { outputDuration }) => sum + Math.max(0, outputDuration), 0);
}

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

/** Where `count` points spread evenly over the export fall: which clip, and the time in the recording. */
function spreadOverExport(clips: readonly ExportStripClip[], count: number) {
  const lengths = clips.map(({ outputDuration }) => Math.max(0, outputDuration));
  const total = spreadTotal(clips);
  if (!(total > 0) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => {
    let at = ((index + 0.5) / count) * total;
    let clip = 0;
    while (clip < clips.length - 1 && at > lengths[clip]!) {
      at -= lengths[clip]!;
      clip += 1;
    }
    const { start, end } = clips[clip]!;
    const fraction = lengths[clip]! > 0 ? Math.min(1, at / lengths[clip]!) : 0;
    return { clip, time: start + fraction * Math.max(0, end - start) };
  });
}

/**
 * The pictures on an export's progress card: `count` frames spread evenly over the export (a sped-up clip gets less
 * of it), each the filmstrip frame nearest its time (the timeline made them already), with the clip it's from.
 * Empty while there are none.
 */
export default function pickExportFrames(frames: readonly FilmstripFrame[], clips: readonly ExportStripClip[], count: number) {
  if (frames.length === 0) return [];
  return spreadOverExport(clips, count).map(({ clip, time }) => ({ url: nearestFrame(frames, time).url, clip }));
}

/** A sound-only export's card: `count` bars of the waveform the audio lane already has, spread the same way (0..1). */
export function pickExportWaveform({ peaks, bucketSeconds }: AudioPeaks, clips: readonly ExportStripClip[], count: number) {
  if (peaks.length === 0 || !(bucketSeconds > 0)) return [];
  const barSeconds = spreadTotal(clips) / count;
  return spreadOverExport(clips, count).map(({ clip, time }) => {
    // The loudest peak over this bar's stretch of the recording (a bar covers more of a sped-up clip).
    const { start, end, outputDuration } = clips[clip]!;
    const halfWidth = ((barSeconds * (end - start)) / Math.max(outputDuration, 1e-6)) / 2;
    const from = Math.max(0, Math.floor((time - halfWidth) / bucketSeconds));
    const to = Math.min(peaks.length - 1, Math.ceil((time + halfWidth) / bucketSeconds));
    let loudest = 0;
    for (let bucket = from; bucket <= to; bucket += 1) loudest = Math.max(loudest, peaks[bucket] ?? 0);
    return loudest;
  });
}

/** Each clip's stretch of the strip, as fractions of it (for their colours on a multi-clip export). */
export function getExportClipSpans(clips: readonly ExportStripClip[]) {
  const total = spreadTotal(clips);
  if (!(total > 0)) return [];
  let from = 0;
  return clips.map(({ outputDuration }) => {
    const span = { from, to: from + Math.max(0, outputDuration) / total };
    from = span.to;
    return span;
  });
}
