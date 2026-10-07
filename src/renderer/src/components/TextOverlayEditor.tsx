import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const moveHandleHeight = 20;
const edgeHandleWidth = 10;
const cornerHandleSize = 16;
const accent = 'rgba(88, 200, 255, 0.95)';

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
 * The right edge sets the wrap width; the corner scales the text; the bar above moves it.
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
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
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
              onMouseDown={(event) => {
                event.stopPropagation();
                onSelectOverlay(overlayClip.overlayId);
              }}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                border: selected ? `1px solid ${accent}` : '1px dashed rgba(255, 255, 255, 0.45)',
                background: selected ? 'rgba(8, 13, 19, 0.2)' : 'transparent',
                borderRadius: 6,
              }}
            >
              {selected ? (
                <textarea
                  value={overlayClip.text}
                  onChange={(event) => updateFitted(overlayClip.overlayId, (clip) => ({ ...clip, text: event.target.value }))}
                  onMouseDown={(event) => event.stopPropagation()}
                  spellCheck={false}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
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
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'move')}
                    title="Drag to move"
                    style={{
                      position: 'absolute',
                      left: -1,
                      bottom: '100%',
                      height: moveHandleHeight,
                      padding: '0 8px',
                      border: 'none',
                      borderRadius: '6px 6px 0 0',
                      background: accent,
                      color: 'rgba(5, 12, 20, 0.9)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      cursor: 'move',
                    }}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    aria-label="Text box width"
                    title="Drag to change the text width"
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'width')}
                    style={{ position: 'absolute', top: '50%', right: -(edgeHandleWidth / 2) - 1, width: edgeHandleWidth, height: Math.min(28, Math.max(14, height - (cornerHandleSize * 2))), transform: 'translateY(-50%)', padding: 0, border: '1px solid rgba(5, 12, 20, 0.6)', borderRadius: 4, background: accent, cursor: 'ew-resize' }}
                  />
                  <button
                    type="button"
                    aria-label="Text size"
                    title="Drag to resize the text"
                    onMouseDown={(event) => beginInteraction(event, overlayClip, 'scale')}
                    style={{ position: 'absolute', right: -(cornerHandleSize / 2), bottom: -(cornerHandleSize / 2), width: cornerHandleSize, height: cornerHandleSize, padding: 0, border: '2px solid rgba(5, 12, 20, 0.6)', borderRadius: 999, background: accent, cursor: 'nwse-resize' }}
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
