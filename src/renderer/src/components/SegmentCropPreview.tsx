import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CropCorner, SegmentCrop } from '../segmentCrop';
import { fullFrameCrop, getSegmentCropPixels, moveSegmentCrop, resizeSegmentCrop, zoomSegmentCrop } from '../segmentCrop';
import { getRotatedVideoDimensions } from '../textOverlays';
import styles from './SegmentCrop.module.css';

export default function SegmentCropPreview({ children, videoWidth, videoHeight, rotation, crop, editing, onChange, onDone }: {
  children: ReactNode,
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
  crop: SegmentCrop,
  editing: boolean,
  onChange: (nextCrop: SegmentCrop) => void,
  onDone: () => void,
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<SegmentCrop>();
  const draftRef = useRef<SegmentCrop>();
  const interactionRef = useRef<{ corner?: CropCorner, crop: SegmentCrop, x: number, y: number, pointerId: number }>();
  const currentCrop = draft ?? crop;
  const setCropDraft = (next: SegmentCrop | undefined) => { draftRef.current = next; setDraft(next); };
  const commit = () => {
    if (draftRef.current != null) onChange(draftRef.current);
    setCropDraft(undefined);
    interactionRef.current = undefined;
  };

  useEffect(() => {
    // Undo, project loading, and segment switches cancel an unfinished gesture.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(undefined);
    draftRef.current = undefined;
    interactionRef.current = undefined;
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
      if (interactionRef.current == null || event.pointerId !== interactionRef.current.pointerId) return;
      if (draftRef.current != null) onChange(draftRef.current);
      draftRef.current = undefined;
      setDraft(undefined);
      interactionRef.current = undefined;
    };
    const cancel = () => { draftRef.current = undefined; setDraft(undefined); interactionRef.current = undefined; };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (interactionRef.current != null || draftRef.current != null) cancel();
      else onDone();
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

  const begin = (event: ReactPointerEvent<HTMLButtonElement>, corner?: CropCorner) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = { ...(corner != null ? { corner } : {}), crop: currentCrop, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dimensions = getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation });
  const aspect = dimensions.width / dimensions.height;
  const availableWidth = Math.max(0, size.width - (editing ? 36 : 0));
  const availableHeight = Math.max(0, size.height - (editing ? 104 : 0));
  const surfaceWidth = Math.min(availableWidth, availableHeight * aspect);
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
  const corners: { corner: CropCorner, label: string }[] = [
    { corner: 'top-left', label: t('Crop top left corner') },
    { corner: 'top-right', label: t('Crop top right corner') },
    { corner: 'bottom-left', label: t('Crop bottom left corner') },
    { corner: 'bottom-right', label: t('Crop bottom right corner') },
  ];

  return (
    <div ref={wrapperRef} className={styles['wrapper']} style={{ paddingBottom: editing ? 68 : 0 }}>
      <div ref={surfaceRef} className={styles['surface']} style={{ width: surfaceWidth, height: surfaceHeight }}>
        <div className={styles['viewport']} data-crop-preview={!editing ? 'true' : 'false'}><div style={contentStyle}>{children}</div></div>
        {editing && (
          <div
            className={styles['frame']}
            role="group"
            aria-label={t('Crop frame')}
            style={{ left: `${currentCrop.x * 100}%`, top: `${currentCrop.y * 100}%`, width: `${currentCrop.width * 100}%`, height: `${currentCrop.height * 100}%` }}
          >
            <button
              type="button"
              className={styles['move']}
              aria-label={t('Move crop frame')}
              onPointerDown={(event) => begin(event)}
              onKeyDown={(event) => {
                event.stopPropagation();
                const delta = event.shiftKey ? 0.05 : 0.01;
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                  event.preventDefault();
                  onChange(moveSegmentCrop(crop, event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? delta : 0), event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? delta : 0)));
                }
                if (event.key === 'Escape') setCropDraft(undefined);
              }}
            />
            <div className={styles['guideVertical']} /><div className={styles['guideHorizontal']} />
            {corners.map(({ corner, label }) => (
              <button
                key={corner}
                type="button"
                aria-label={label}
                className={styles['corner']}
                data-crop-corner={corner}
                style={{ left: corner.endsWith('left') ? 0 : '100%', top: corner.startsWith('top') ? 0 : '100%', cursor: corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize' }}
                onPointerDown={(event) => begin(event, corner)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  const delta = event.shiftKey ? 0.05 : 0.01;
                  onChange(resizeSegmentCrop(crop, corner, event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? delta : 0), event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? delta : 0)));
                }}
              />
            ))}
          </div>
        )}
      </div>
      {editing && (
        <div className={styles['toolbar']} role="group" aria-label={t('Zoom and crop controls')}>
          <span className={styles['hint']}>{t('Drag a corner to crop. Drag inside to reposition.')}</span>
          <div className={styles['controls']}>
            <label htmlFor="segment-crop-zoom">{t('Zoom')}</label>
            <input
              id="segment-crop-zoom"
              type="range"
              min={100}
              max={400}
              step={1}
              value={Math.round(100 / currentCrop.width)}
              aria-valuetext={`${(1 / currentCrop.width).toFixed(2)}×`}
              onChange={(event) => setCropDraft(zoomSegmentCrop(crop, Number(event.target.value) / 100))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <output htmlFor="segment-crop-zoom">{(1 / currentCrop.width).toFixed(2)}×</output>
            <button type="button" onClick={() => { setCropDraft(undefined); onChange(fullFrameCrop); }}>{t('Reset')}</button>
            <button type="button" className={styles['done']} onClick={() => { commit(); onDone(); }}>{t('Done')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
