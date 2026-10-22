import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useEffect, useRef } from 'react';

import { peakBetween } from '../audioPeaks';
import type { AudioPeaks } from '../audioPeaks';
import type { StateSegment } from '../types';
import styles from './AudioLane.module.css';

/**
 * The audio track under the clips: the waveform, drawn only for the visible stretch (so zooming in costs
 * nothing), bright inside kept clips and faint elsewhere, with each clip outlined like on the clips lane.
 */
function AudioLane({ peaks, height, segments, activeIndex, noneTicked, toLanePercent, pxToTime, lanePx, visibleStartPx, viewportPx, onClipContextMenu, onClipClick }: {
  peaks: AudioPeaks | undefined,
  height: number,
  segments: StateSegment[],
  activeIndex: number,
  /** With no clip ticked, the export takes all of them. */
  noneTicked: boolean,
  toLanePercent: (time: number) => number,
  pxToTime: (px: number) => number,
  lanePx: number,
  visibleStartPx: number,
  viewportPx: number,
  onClipContextMenu?: ((index: number, event: ReactMouseEvent<HTMLElement>) => void) | undefined,
  onClipClick?: ((index: number) => void) | undefined,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null || viewportPx <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(viewportPx);
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
    const exported = segments.filter((seg) => seg.end != null && (noneTicked || seg.selected));
    const isKept = (time: number) => exported.some((seg) => time >= seg.start && time < seg.end!);

    const mid = innerHeight / 2;
    for (let x = 0; x < width; x += 1) {
      const px = visibleStartPx + x;
      if (px > lanePx) break;
      const from = pxToTime(px);
      const to = pxToTime(px + 1);
      const peak = peakBetween(peaks, from, to);
      const h = Math.max(1, peak * (innerHeight - 2));
      const keptHere = isKept((from + to) / 2);
      ctx.fillStyle = keptHere ? kept : cut;
      ctx.globalAlpha = keptHere ? 0.95 : 0.4;
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
    ctx.globalAlpha = 1;
  }, [height, lanePx, noneTicked, peaks, pxToTime, segments, viewportPx, visibleStartPx]);

  return (
    <div className={styles['lane']} style={{ height }}>
      <canvas ref={canvasRef} className={styles['canvas']} style={{ left: visibleStartPx }} aria-hidden />
      {segments.map((seg, index) => {
        if (seg.end == null) return null;
        const left = toLanePercent(seg.start);
        const width = toLanePercent(seg.end) - left;
        const exported = noneTicked || seg.selected;
        return (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <div
            key={seg.segId}
            className={[styles['clip'], ...(index === activeIndex ? [styles['clipActive']] : []), ...(!exported ? [styles['clipExcluded']] : [])].join(' ')}
            style={{ left: `${left}%`, width: `${width}%` }}
            onClick={() => onClipClick?.(index)}
            onContextMenu={(e) => {
              if (onClipContextMenu == null) return;
              e.preventDefault();
              e.stopPropagation();
              onClipContextMenu(index, e);
            }}
          />
        );
      })}
    </div>
  );
}

export default memo(AudioLane);
