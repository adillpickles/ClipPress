import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiZoomIn, FiZoomOut } from 'react-icons/fi';

import type { CropCorner, SegmentCrop } from '../segmentCrop';
import { fullFrameCrop, getSegmentCropPixels, isSameSegmentCrop, minCropSize, moveSegmentCrop, resizeSegmentCrop, zoomSegmentCrop } from '../segmentCrop';
import { getRotatedVideoDimensions } from '../textOverlays';
import styles from './SegmentCrop.module.css';

const maxZoom = 1 / minCropSize;
const zoomButtonStep = 0.25;
/** Wheel zooming commits once the wheel goes quiet, so a scroll is one undo step. */
const wheelCommitDelayMs = 350;

const corners: CropCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Shows each segment's crop in the preview and, while editing, the crop frame: a white frame with corner brackets
 * (as in the Photos app and phone editors), a faint thirds grid, a small chip with the clip and the size, and one
 * compact toolbar over the video, so the picture keeps its size when editing starts.
 */
export default function SegmentCropPreview({ children, frameContent, videoWidth, videoHeight, rotation, crop, editing, clipLabel, onChange, onDone, doneKeys, finishRef }: {
  children: ReactNode,
  /** Drawn inside the crop frame while editing, under its handles (the texts, which the export puts on the cropped picture). */
  frameContent?: ReactNode,
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
  crop: SegmentCrop,
  editing: boolean,
  /** The clip being cropped, named in the frame's chip: a crop is per clip, not for the whole export. */
  clipLabel?: string | undefined,
  onChange: (nextCrop: SegmentCrop) => void,
  onDone: () => void,
  /** Zoom / crop's own shortcut, which also finishes: shown in Done's hint. */
  doneKeys?: string | undefined,
  /** Set while editing: finishes like Done (a zoom still settling is kept), for the shortcut that closes it. */
  finishRef?: MutableRefObject<(() => void) | undefined> | undefined,
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<SegmentCrop>();
  const draftRef = useRef<SegmentCrop>();
  const interactionRef = useRef<{ corner?: CropCorner, crop: SegmentCrop, x: number, y: number, pointerId: number }>();
  const [dragging, setDragging] = useState(false);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const currentCrop = draft ?? crop;

  const setCropDraft = (next: SegmentCrop | undefined) => {
    draftRef.current = next;
    setDraft(next);
  };
  const cancelGesture = () => {
    clearTimeout(wheelTimerRef.current);
    setCropDraft(undefined);
    interactionRef.current = undefined;
    setDragging(false);
  };
  /**
   * Commits a pending wheel or slider zoom as its own undo step, before anything else edits the
   * crop. Returns the crop the next edit should build on. Never touches a pointer gesture.
   */
  const settleZoom = () => {
    clearTimeout(wheelTimerRef.current);
    const pending = interactionRef.current == null ? draftRef.current : undefined;
    if (pending == null) return draftRef.current ?? crop;
    setCropDraft(undefined);
    onChange(pending);
    return pending;
  };

  const lastCropRef = useRef(crop);
  useEffect(() => {
    const previousCrop = lastCropRef.current;
    lastCropRef.current = crop;
    // Leaving the editor, undo, project loading and segment switches cancel an unfinished
    // gesture. Re-renders that keep the crop, and the zoom a drag committed as it began, do not.
    const interaction = interactionRef.current;
    if (editing && (isSameSegmentCrop(previousCrop, crop) || (interaction != null && isSameSegmentCrop(interaction.crop, crop)))) return;
    clearTimeout(wheelTimerRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(undefined);
    draftRef.current = undefined;
    interactionRef.current = undefined;
    setDragging(false);
  }, [crop, editing]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (element == null) return undefined;
    const updateSize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editing) return undefined;
    const move = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const surface = surfaceRef.current;
      if (interaction == null || surface == null || event.pointerId !== interaction.pointerId) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const deltaX = (event.clientX - interaction.x) / rect.width;
      const deltaY = (event.clientY - interaction.y) / rect.height;
      const next = interaction.corner != null
        ? resizeSegmentCrop(interaction.crop, interaction.corner, deltaX, deltaY)
        : moveSegmentCrop(interaction.crop, deltaX, deltaY);
      draftRef.current = next;
      setDraft(next);
    };
    const end = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (interaction == null || event.pointerId !== interaction.pointerId) return;
      // A press without movement is not an edit.
      if (draftRef.current != null && !isSameSegmentCrop(draftRef.current, interaction.crop)) onChange(draftRef.current);
      draftRef.current = undefined;
      setDraft(undefined);
      interactionRef.current = undefined;
      setDragging(false);
    };
    const cancel = () => {
      clearTimeout(wheelTimerRef.current);
      draftRef.current = undefined;
      setDraft(undefined);
      interactionRef.current = undefined;
      setDragging(false);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (interactionRef.current != null || draftRef.current != null) cancel();
        else onDone();
      } else if (event.key === 'Enter' && interactionRef.current == null) {
        event.preventDefault();
        event.stopPropagation();
        clearTimeout(wheelTimerRef.current);
        if (draftRef.current != null) onChange(draftRef.current);
        cancel();
        onDone();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', keyDown, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', keyDown, true);
    };
  }, [editing, onChange, onDone]);

  useEffect(() => () => clearTimeout(wheelTimerRef.current), []);

  const finish = () => {
    settleZoom();
    onDone();
  };
  useEffect(() => {
    if (finishRef == null) return undefined;
    // eslint-disable-next-line no-param-reassign
    finishRef.current = editing ? finish : undefined;
    return () => {
      // eslint-disable-next-line no-param-reassign
      finishRef.current = undefined;
    };
  });

  const begin = (event: ReactPointerEvent<HTMLElement>, corner?: CropCorner) => {
    if (event.button !== 0 || interactionRef.current != null) return;
    event.preventDefault();
    event.stopPropagation();
    // A zoom still waiting for the wheel to go quiet is committed first, as its own step; the
    // drag owns the crop from here until the pointer is released.
    const base = settleZoom();
    interactionRef.current = { ...(corner != null ? { corner } : {}), crop: base, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setCropDraft(base);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const zoom = 1 / currentCrop.width;
  // Steps build on the latest draft, so several wheel ticks in one frame all count.
  const setZoom = (getNextZoom: (currentZoom: number) => number, commitNow: boolean) => {
    const base = commitNow ? settleZoom() : (draftRef.current ?? crop);
    const next = zoomSegmentCrop(base, Math.min(maxZoom, Math.max(1, getNextZoom(1 / base.width))));
    if (commitNow) {
      onChange(next);
    } else {
      setCropDraft(next);
    }
  };

  const onWheel = (event: ReactWheelEvent) => {
    if (!editing || interactionRef.current != null) return;
    event.stopPropagation();
    setZoom((current) => current * (event.deltaY < 0 ? 1.08 : 1 / 1.08), false);
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(settleZoom, wheelCommitDelayMs);
  };
  /** Arrow-key moves and resizes build on a pending zoom, committed first as its own step. */
  const nudge = (getNext: (base: SegmentCrop) => SegmentCrop) => onChange(getNext(settleZoom()));

  const dimensions = getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation });
  const aspect = dimensions.width / dimensions.height;
  const surfaceWidth = Math.min(size.width, size.height * aspect);
  const surfaceHeight = surfaceWidth / aspect;
  const pixels = getSegmentCropPixels(currentCrop, dimensions.width, dimensions.height);
  const visibleCrop = editing ? fullFrameCrop : { x: pixels.x / pixels.frameWidth, y: pixels.y / pixels.frameHeight, width: pixels.width / pixels.frameWidth, height: pixels.height / pixels.frameHeight };
  const contentStyle: CSSProperties = {
    position: 'absolute',
    left: `${(-visibleCrop.x / visibleCrop.width) * 100}%`,
    top: `${(-visibleCrop.y / visibleCrop.height) * 100}%`,
    width: `${100 / visibleCrop.width}%`,
    height: `${100 / visibleCrop.height}%`,
  };
  const frameStyle: CSSProperties = { left: `${currentCrop.x * 100}%`, top: `${currentCrop.y * 100}%`, width: `${currentCrop.width * 100}%`, height: `${currentCrop.height * 100}%` };

  return (
    <div ref={wrapperRef} className={styles['wrapper']}>
      <div ref={surfaceRef} className={styles['surface']} style={{ width: surfaceWidth, height: surfaceHeight }} onWheel={onWheel}>
        <div className={styles['viewport']} data-crop-preview={!editing ? 'true' : 'false'}>
          <div style={contentStyle}>{children}</div>
          {editing && <div className={styles['dim']} style={frameStyle} />}
        </div>
        {editing && (
          <div
            className={styles['frame']}
            role="group"
            aria-label={t('Crop frame')}
            data-dragging={dragging}
            style={frameStyle}
          >
            {frameContent}
            <button
              type="button"
              className={styles['move']}
              aria-label={t('Move crop frame')}
              title={t('Drag to reposition')}
              onPointerDown={(event) => begin(event)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.stopPropagation();
                event.preventDefault();
                const delta = event.shiftKey ? 0.05 : 0.01;
                nudge((base) => moveSegmentCrop(base, event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? delta : 0), event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? delta : 0)));
              }}
            />
            <div className={styles['grid']} />
            {/* Which clip, and the size it makes; the frame itself is what drags. */}
            <div className={styles['chip']}>
              {clipLabel != null && clipLabel !== '' && <span className={styles['chipClip']}>{clipLabel}</span>}
              <span className={styles['chipSize']}>{pixels.width} × {pixels.height}</span>
            </div>
            {corners.map((corner) => (
              <button
                key={corner}
                type="button"
                aria-label={t('Resize crop')}
                title={t('Drag to resize')}
                className={styles['corner']}
                data-crop-corner={corner}
                style={{ left: corner.endsWith('left') ? 0 : '100%', top: corner.startsWith('top') ? 0 : '100%', cursor: corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize' }}
                onPointerDown={(event) => begin(event, corner)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.stopPropagation();
                  event.preventDefault();
                  const delta = event.shiftKey ? 0.05 : 0.01;
                  nudge((base) => resizeSegmentCrop(base, corner, event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? delta : 0), event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? delta : 0)));
                }}
              />
            ))}
          </div>
        )}

        {editing && (
          <div className={styles['toolbar']} role="group" aria-label={t('Zoom and crop controls')} data-dragging={dragging}>
            <button type="button" className={styles['iconButton']} onClick={() => setZoom((current) => current - zoomButtonStep, true)} disabled={zoom <= 1.001} title={t('Zoom out')} aria-label={t('Zoom out')}><FiZoomOut aria-hidden /></button>
            <input
              className={styles['slider']}
              type="range"
              min={100}
              max={maxZoom * 100}
              step={1}
              value={Math.round(zoom * 100)}
              aria-label={t('Zoom')}
              aria-valuetext={`${Math.round(zoom * 100)}%`}
              onPointerDown={settleZoom}
              onChange={(event) => { const value = Number(event.target.value) / 100; setZoom(() => value, false); }}
              onPointerUp={settleZoom}
              onKeyUp={settleZoom}
              onBlur={settleZoom}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <button type="button" className={styles['iconButton']} onClick={() => setZoom((current) => current + zoomButtonStep, true)} disabled={zoom >= maxZoom - 0.001} title={t('Zoom in')} aria-label={t('Zoom in')}><FiZoomIn aria-hidden /></button>
            <output className={styles['zoomValue']}>{Math.round(zoom * 100)}%</output>
            <span className={styles['divider']} />
            <button type="button" className={styles['textButton']} onClick={() => { cancelGesture(); onChange(fullFrameCrop); }} disabled={zoom <= 1.001}>{t('Reset')}</button>
            <button type="button" className={styles['doneButton']} onClick={finish} title={t('Done')} data-tip-keys={doneKeys}>{t('Done')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
