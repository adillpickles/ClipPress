import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMove } from 'react-icons/fi';

import type { OverlayBox, OverlayClip } from '../types';
import {
  clampOverlayBox,
  defaultTextOverlayFontFamily,
  fitTextOverlayBox,
  getOverlayFontSize,
  getRotatedVideoDimensions,
  isOverlayActiveAtTime,
  layoutTextOverlay,
  maxTextOverlayFontSize,
  minTextOverlayFontSize,
  minTextOverlayWidth,
  textOverlayLineHeight,
} from '../textOverlays';
import styles from './TextOverlayEditor.module.css';

const cornerHandleSize = 18;

type InteractionMode = 'move' | 'width' | 'scale';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const textStyle: CSSProperties = {
  fontFamily: defaultTextOverlayFontFamily,
  lineHeight: textOverlayLineHeight,
  color: 'rgba(255, 255, 255, 0.98)',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
  whiteSpace: 'pre',
};

/**
 * Text boxes keep a fixed font size and grow to fit their lines, matching the exported image.
 * The right edge sets the wrap width; the corner scales the text; the grip above moves it.
 */
function TextOverlayEditor({
  overlayClips,
  selectedOverlayId,
  relevantTime,
  videoWidth,
  videoHeight,
  rotation,
  onSelectOverlay,
  onUpdateOverlay,
}: {
  overlayClips: OverlayClip[],
  selectedOverlayId: string | undefined,
  relevantTime: number,
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
  onSelectOverlay: (overlayId: string | undefined) => void,
  onUpdateOverlay: (overlayId: string, updater: (clip: OverlayClip) => OverlayClip) => void,
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = wrapperRef.current;
    if (element == null) return undefined;

    const updateSize = () => {
      setWrapperSize({ width: element.clientWidth, height: element.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const video = useMemo(() => getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation }), [rotation, videoHeight, videoWidth]);

  const videoAspectRatio = video.width / video.height;
  const wrapperAspectRatio = wrapperSize.height > 0 ? wrapperSize.width / wrapperSize.height : videoAspectRatio;

  const surfaceSize = useMemo(() => {
    if (wrapperSize.width <= 0 || wrapperSize.height <= 0) return { width: 0, height: 0 };
    if (wrapperAspectRatio > videoAspectRatio) {
      return {
        width: wrapperSize.height * videoAspectRatio,
        height: wrapperSize.height,
      };
    }
    return {
      width: wrapperSize.width,
      height: wrapperSize.width / videoAspectRatio,
    };
  }, [videoAspectRatio, wrapperAspectRatio, wrapperSize.height, wrapperSize.width]);

  // Preview pixels per video pixel.
  const previewScale = surfaceSize.height / video.height;

  const visibleOverlays = useMemo(() => overlayClips.filter((overlayClip) => isOverlayActiveAtTime(overlayClip, relevantTime)), [overlayClips, relevantTime]);

  // The text box only takes keyboard focus when the user asks to edit it: a text that was just
  // added, or a click on the box. Not when playback reaches it, which used to steal the keys from
  // playback (Space typed a space instead of pausing, #67).
  const textAreasRef = useRef(new Map<string, HTMLTextAreaElement>());
  // A click on a box that isn't selected yet asks to focus its text box once it appears. Only
  // honoured briefly, so that it can't fire later when playback brings the box back.
  const pendingFocusRef = useRef<{ overlayId: string, at: number }>();
  const knownOverlayIdsRef = useRef<Set<string>>(new Set(overlayClips.map((overlayClip) => overlayClip.overlayId)));

  const focusOverlayText = useCallback((overlayId: string) => {
    const textArea = textAreasRef.current.get(overlayId);
    if (textArea != null) {
      textArea.focus();
      pendingFocusRef.current = undefined;
    } else {
      pendingFocusRef.current = { overlayId, at: Date.now() };
    }
  }, []);

  // A text that was just added (Add Text) is ready to type into.
  useEffect(() => {
    const known = knownOverlayIdsRef.current;
    const added = overlayClips.filter((overlayClip) => !known.has(overlayClip.overlayId));
    added.forEach((overlayClip) => known.add(overlayClip.overlayId));
    if (selectedOverlayId != null && added.some((overlayClip) => overlayClip.overlayId === selectedOverlayId)) {
      textAreasRef.current.get(selectedOverlayId)?.focus();
    }
  }, [overlayClips, selectedOverlayId]);

  const setTextAreaRef = useCallback((overlayId: string, textArea: HTMLTextAreaElement | null) => {
    if (textArea == null) {
      textAreasRef.current.delete(overlayId);
      return;
    }
    textAreasRef.current.set(overlayId, textArea);
    const pending = pendingFocusRef.current;
    if (pending?.overlayId === overlayId) {
      pendingFocusRef.current = undefined;
      if (Date.now() - pending.at < 1000) textArea.focus();
    }
  }, []);

  const updateFitted = useCallback((overlayId: string, updater: (clip: OverlayClip) => OverlayClip) => {
    onUpdateOverlay(overlayId, (clip) => fitTextOverlayBox(updater(clip), video.width, video.height));
  }, [onUpdateOverlay, video.height, video.width]);

  const interactionRef = useRef<{
    mode: InteractionMode,
    overlayId: string,
    pointerX: number,
    pointerY: number,
    box: OverlayBox,
    fontSize: number,
  }>();

  const beginInteraction = useCallback((event: ReactMouseEvent, overlayClip: OverlayClip, mode: InteractionMode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      mode,
      overlayId: overlayClip.overlayId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      box: overlayClip.box,
      fontSize: getOverlayFontSize(overlayClip),
    };
    onSelectOverlay(overlayClip.overlayId);
  }, [onSelectOverlay]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (interaction == null || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;
      const { overlayId, mode, pointerX, pointerY, box, fontSize } = interaction;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;

      if (mode === 'move') {
        onUpdateOverlay(overlayId, (clip) => ({
          ...clip,
          box: clampOverlayBox({ ...box, x: box.x + (deltaX / surfaceSize.width), y: box.y + (deltaY / surfaceSize.height) }),
        }));
        return;
      }

      if (mode === 'width') {
        updateFitted(overlayId, (clip) => ({
          ...clip,
          box: { ...box, width: clamp(box.width + (deltaX / surfaceSize.width), minTextOverlayWidth, 1 - box.x) },
        }));
        return;
      }

      // Scale along the box diagonal: dragging the corner out grows the text and its wrap width together.
      const boxWidthPx = box.width * surfaceSize.width;
      const boxHeightPx = box.height * surfaceSize.height;
      const requested = 1 + ((deltaX + deltaY) / Math.max(1, boxWidthPx + boxHeightPx));
      const nextFontSize = clamp(fontSize * requested, minTextOverlayFontSize, maxTextOverlayFontSize);
      const factor = nextFontSize / fontSize;
      updateFitted(overlayId, (clip) => ({
        ...clip,
        fontSize: nextFontSize,
        box: { ...box, width: clamp(box.width * factor, minTextOverlayWidth, 1 - box.x) },
      }));
    };

    const onMouseUp = () => {
      interactionRef.current = undefined;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onUpdateOverlay, surfaceSize.height, surfaceSize.width, updateFitted]);

  const surfaceStyle = useMemo<CSSProperties>(() => ({
    position: 'relative',
    width: surfaceSize.width,
    height: surfaceSize.height,
    pointerEvents: 'none',
  }), [surfaceSize.height, surfaceSize.width]);

  return (
    <div ref={wrapperRef} className={styles['wrapper']}>
      <div style={surfaceStyle}>
        {surfaceSize.height > 0 && visibleOverlays.map((overlayClip) => {
          const selected = overlayClip.overlayId === selectedOverlayId;
          const fontSizePx = getOverlayFontSize(overlayClip) * video.height;
          const layout = layoutTextOverlay({ text: overlayClip.text, widthPx: overlayClip.box.width * video.width, fontSizePx });
          const left = overlayClip.box.x * surfaceSize.width;
          const top = overlayClip.box.y * surfaceSize.height;
          const width = overlayClip.box.width * surfaceSize.width;
          const height = layout.heightPx * previewScale;
          const scaledTextStyle: CSSProperties = {
            ...textStyle,
            fontSize: fontSizePx * previewScale,
            padding: `${layout.paddingY * previewScale}px ${layout.paddingX * previewScale}px`,
          };

          return (
            <div
              key={overlayClip.overlayId}
              role="button"
              tabIndex={-1}
              className={[styles['box'], ...(selected ? [styles['boxSelected']] : [])].join(' ')}
              onMouseDown={(event) => {
                event.stopPropagation();
                onSelectOverlay(overlayClip.overlayId);
                focusOverlayText(overlayClip.overlayId);
              }}
              style={{ left, top, width, height }}
            >
              {selected ? (
                <textarea
                  ref={(textArea) => setTextAreaRef(overlayClip.overlayId, textArea)}
                  aria-label={t('Text')}
                  value={overlayClip.text}
                  onChange={(event) => updateFitted(overlayClip.overlayId, (clip) => ({ ...clip, text: event.target.value }))}
                  onMouseDown={(event) => event.stopPropagation()}
                  // Escape leaves the text box, so the editor's shortcuts work again.
                  onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.blur(); }}
                  spellCheck={false}
                  style={{
                    ...scaledTextStyle,
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    margin: 0,
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    background: 'transparent',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                />
              ) : (
                <div style={{ ...scaledTextStyle, boxSizing: 'border-box', overflow: 'hidden', height: '100%' }}>
                  {layout.lines.map((line, index) => (
                    // Lines are positional; the same text can repeat.
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index}>{line || ' '}</div>
                  ))}
                </div>
              )}

              {selected && (
                <>
                  <button
                    type="button"
                    className={styles['moveGrip']}
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'move')}
                    title={t('Drag to move')}
                  >
                    <FiMove aria-hidden />
                  </button>
                  {/* Kept clear of the corner on a short box. */}
                  <button
                    type="button"
                    className={styles['widthHandle']}
                    aria-label={t('Text box width')}
                    title={t('Drag to change the text width')}
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'width')}
                    style={{ height: Math.min(28, Math.max(10, height - (cornerHandleSize * 2) - 4)) }}
                  />
                  <button
                    type="button"
                    className={styles['scaleCorner']}
                    aria-label={t('Text size')}
                    title={t('Drag to resize the text')}
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'scale')}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(TextOverlayEditor);
