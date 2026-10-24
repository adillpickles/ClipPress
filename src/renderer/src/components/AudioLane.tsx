import { memo, useEffect, useRef } from 'react';
import { FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import { peakBetween } from '../audioPeaks';
import type { AudioPeaks } from '../audioPeaks';
import type { StateSegment } from '../types';
import { getPreviewGainFactor } from '../hooks/usePreviewAudioGain';
import { combineAudioGain, dbToPercent, isClipVolumeChanged } from '../util/audioGain';
import styles from './AudioLane.module.css';

/**
 * The audio track under the clips: the waveform, drawn only for the visible stretch (so zooming in costs
 * nothing), bright inside kept clips and faint elsewhere, with each clip outlined like on the clips lane.
 * The track volume scales the whole waveform, and a clip's own volume its stretch on top (as they play); a clip's
 * volume also shows as a small badge. Right-click a clip to change it.
 */
function AudioLane({ peaks, trackGainDb, height, segments, activeIndex, noneTicked, invertCutSegments, toLanePercent, pxToTime, lanePx, visibleStartPx, viewportPx, onClipContextMenu, onClipClick }: {
  peaks: AudioPeaks | undefined,
  /** The volume of the drawn track, under every clip's. */
  trackGainDb: number | undefined,
  height: number,
  segments: StateSegment[],
  activeIndex: number,
  /** With no clip ticked, the export takes all of them. */
  noneTicked: boolean,
  /** Clips are what's removed: the export is everything between them (and clip volumes don't apply). */
  invertCutSegments: boolean,
  toLanePercent: (time: number) => number,
  pxToTime: (px: number) => number,
  lanePx: number,
  visibleStartPx: number,
  viewportPx: number,
  /** Opens the clip's volume popover at a point on screen. */
  onClipContextMenu?: ((index: number, point: { x: number, y: number }) => void) | undefined,
  onClipClick?: ((index: number) => void) | undefined,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Within the lane: the scroll position can still be the one from before a zoom-out, and a canvas sticking out
  // past the lane's end would make the timeline scrollable beyond it.
  const canvasWidth = Math.max(0, Math.min(viewportPx, lanePx));
  const canvasLeft = Math.min(Math.max(0, visibleStartPx), Math.max(0, lanePx - canvasWidth));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null || viewportPx <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(canvasWidth);
    const innerHeight = height - 10;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${innerHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, innerHeight);
    if (peaks == null || lanePx <= 0) return;

    const css = getComputedStyle(canvas);
    const kept = css.getPropertyValue('--accent-9').trim() || '#3bb3bd';
    const cut = css.getPropertyValue('--gray-9').trim() || '#6e6e6e';
    // The untouched whole-file placeholder isn't a clip: with "Removed" it removes nothing (the export keeps all).
    const clips = segments.filter((seg) => seg.end != null && !(invertCutSegments && seg.initial));
    const exported = clips.filter((seg) => noneTicked || seg.selected);
    const isKept = invertCutSegments
      ? (time: number) => !clips.some((seg) => time >= seg.start && time < seg.end!)
      : (time: number) => exported.some((seg) => time >= seg.start && time < seg.end!);
    // The selected clip wins where clips overlap, as in the preview.
    const active = segments[activeIndex];
    const ordered = active != null ? [active, ...segments.filter((seg) => seg !== active)] : segments;
    const louder = invertCutSegments ? [] : ordered.flatMap((seg) => (seg.end != null ? [{ start: seg.start, end: seg.end, factor: getPreviewGainFactor(combineAudioGain(undefined, seg)) }] : []));
    const trackFactor = getPreviewGainFactor(trackGainDb);
    const volumeAt = (time: number) => trackFactor * (louder.find((clip) => time >= clip.start && time < clip.end)?.factor ?? 1);

    const mid = innerHeight / 2;
    for (let x = 0; x < width; x += 1) {
      const px = canvasLeft + x;
      if (px > lanePx) break;
      const from = pxToTime(px);
      const to = pxToTime(px + 1);
      const middle = (from + to) / 2;
      const peak = Math.min(1, peakBetween(peaks, from, to) * volumeAt(middle));
      const h = Math.max(1, peak * (innerHeight - 2));
      const keptHere = isKept(middle);
      ctx.fillStyle = keptHere ? kept : cut;
      ctx.globalAlpha = keptHere ? 0.95 : 0.4;
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
    ctx.globalAlpha = 1;
  }, [activeIndex, canvasLeft, canvasWidth, height, invertCutSegments, lanePx, noneTicked, peaks, pxToTime, segments, trackGainDb, viewportPx]);

  return (
    <div className={styles['lane']} style={{ height }}>
      <canvas ref={canvasRef} className={styles['canvas']} style={{ left: canvasLeft }} aria-hidden />
      {segments.map((seg, index) => {
        if (seg.end == null) return null;
        const left = toLanePercent(seg.start);
        const width = toLanePercent(seg.end) - left;
        const exported = !invertCutSegments && (noneTicked || seg.selected);
        const volumeChanged = !invertCutSegments && isClipVolumeChanged(seg);
        return (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <div
            key={seg.segId}
            className={[styles['clip'], ...(index === activeIndex ? [styles['clipActive']] : []), ...(!exported ? [styles['clipExcluded']] : [])].join(' ')}
            style={{ left: `${left}%`, width: `${width}%` }}
            onClick={() => onClipClick?.(index)}
            // Capture: the timeline's own menu listens on the scroller, which a bubbling event reaches first.
            onContextMenuCapture={(e) => {
              if (onClipContextMenu == null) return;
              e.preventDefault();
              e.stopPropagation();
              onClipContextMenu(index, { x: e.clientX, y: e.clientY });
            }}
            title={onClipContextMenu != null ? t("Right-click to change this clip's volume") : undefined}
          >
            {volumeChanged && (
              <button
                type="button"
                className={styles['badge']}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // From the badge itself, so it also lands right when pressed with the keyboard.
                  const rect = e.currentTarget.getBoundingClientRect();
                  onClipContextMenu?.(index, { x: rect.left + rect.width / 2, y: rect.top });
                }}
                title={t('Clip volume')}
                aria-label={t('Clip volume')}
              >
                {seg.audioMuted ? <FiVolumeX aria-hidden /> : `${dbToPercent(seg.audioGainDb ?? 0)}%`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(AudioLane);
