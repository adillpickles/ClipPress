import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { OverlayBox, OverlayClip } from '../types';
import { clampOverlayBox, getPreviewFontSize, getRotatedVideoDimensions, isOverlayActiveAtTime } from '../textOverlays';

const minOverlayWidth = 0.08;
const minOverlayHeight = 0.1;
const moveHandleHeight = 22;
const resizeHandleHitSize = 30;

function clampBox(box: OverlayBox) {
  return clampOverlayBox({
    ...box,
    width: Math.max(box.width, minOverlayWidth),
    height: Math.max(box.height, minOverlayHeight),
  });
}

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
  const surfaceRef = useRef<HTMLDivElement>(null);
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

  const rotatedVideoDimensions = useMemo(() => getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation }), [rotation, videoHeight, videoWidth]);

  const videoAspectRatio = rotatedVideoDimensions.width / rotatedVideoDimensions.height;
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

  const visibleOverlays = useMemo(() => overlayClips.filter((overlayClip) => isOverlayActiveAtTime(overlayClip, relevantTime)), [overlayClips, relevantTime]);

  const interactionRef = useRef<{
    mode: 'move' | 'resize',
    overlayId: string,
    pointerX: number,
    pointerY: number,
    box: OverlayBox,
  }>();

  const beginInteraction = useCallback((event: ReactMouseEvent, overlayId: string, mode: 'move' | 'resize') => {
    if (surfaceRef.current == null) return;
    event.preventDefault();
    event.stopPropagation();

    const overlayClip = overlayClips.find((clip) => clip.overlayId === overlayId);
    if (overlayClip == null) return;

    interactionRef.current = {
      mode,
      overlayId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      box: overlayClip.box,
    };
    onSelectOverlay(overlayId);
  }, [onSelectOverlay, overlayClips]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (surfaceRef.current == null || interactionRef.current == null || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;
      const { overlayId, mode, pointerX, pointerY, box } = interactionRef.current;
      const deltaX = (event.clientX - pointerX) / surfaceSize.width;
      const deltaY = (event.clientY - pointerY) / surfaceSize.height;

      onUpdateOverlay(overlayId, (overlayClip) => {
        if (mode === 'move') {
          return {
            ...overlayClip,
            box: clampBox({
              ...box,
              x: box.x + deltaX,
              y: box.y + deltaY,
            }),
          };
        }

        return {
          ...overlayClip,
          box: clampBox({
            ...box,
            width: box.width + deltaX,
            height: box.height + deltaY,
          }),
        };
      });
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
  }, [onUpdateOverlay, surfaceSize.height, surfaceSize.width]);

  const surfaceStyle = useMemo<CSSProperties>(() => ({
    position: 'relative',
    width: surfaceSize.width,
    height: surfaceSize.height,
    pointerEvents: 'none',
  }), [surfaceSize.height, surfaceSize.width]);

  return (
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div ref={surfaceRef} style={surfaceStyle}>
        {visibleOverlays.map((overlayClip) => {
          const selected = overlayClip.overlayId === selectedOverlayId;
          const left = overlayClip.box.x * surfaceSize.width;
          const top = overlayClip.box.y * surfaceSize.height;
          const width = overlayClip.box.width * surfaceSize.width;
          const height = overlayClip.box.height * surfaceSize.height;
          const fontSize = getPreviewFontSize({ surfaceHeight: surfaceSize.height, boxHeight: overlayClip.box.height });
          const previewLineClamp = Math.max(
            1,
            Math.floor((height - 16 - (selected ? moveHandleHeight : 0)) / Math.max(fontSize * 1.15, 1)),
          );

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
                borderRadius: 8,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: selected ? '1px solid rgba(88, 200, 255, 0.95)' : '1px dashed rgba(255, 255, 255, 0.45)',
                  background: selected ? 'rgba(8, 13, 19, 0.2)' : 'transparent',
                  borderRadius: 8,
                  boxShadow: selected ? '0 0 0 1px rgba(88, 200, 255, 0.25)' : undefined,
                  overflow: 'hidden',
                }}
              >
                {selected && (
                  <button
                    onMouseDown={(event) => beginInteraction(event, overlayClip.overlayId, 'move')}
                    type="button"
                    style={{
                      height: moveHandleHeight,
                      cursor: 'move',
                      background: 'rgba(10, 16, 24, 0.75)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      width: '100%',
                      border: 'none',
                    }}
                  >
                    Text
                  </button>
                )}

                {selected ? (
                  <textarea
                    value={overlayClip.text}
                    onChange={(event) => onUpdateOverlay(overlayClip.overlayId, (clip) => ({ ...clip, text: event.target.value }))}
                    onMouseDown={(event) => event.stopPropagation()}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      height: `calc(100% - ${moveHandleHeight}px)`,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      overflow: 'auto',
                      background: 'transparent',
                      color: 'rgba(255, 255, 255, 0.98)',
                      padding: '8px 10px 10px',
                      fontFamily: 'Arial, sans-serif',
                      fontSize,
                      lineHeight: 1.15,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      padding: '8px 10px',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'rgba(255, 255, 255, 0.98)',
                      fontFamily: 'Arial, sans-serif',
                      fontSize,
                      lineHeight: 1.15,
                      textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: previewLineClamp,
                    }}
                  >
                    {overlayClip.text}
                  </div>
                )}
              </div>

              {selected && (
                <button
                  type="button"
                  onMouseDown={(event) => beginInteraction(event, overlayClip.overlayId, 'resize')}
                  title="Resize text box"
                  style={{
                    position: 'absolute',
                    right: -8,
                    bottom: -8,
                    width: resizeHandleHitSize,
                    height: resizeHandleHitSize,
                    cursor: 'nwse-resize',
                    background: 'linear-gradient(135deg, transparent 0 60%, rgba(88, 200, 255, 0.95) 60% 67%, transparent 67% 100%)',
                    border: 'none',
                    borderRadius: 999,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(TextOverlayEditor);
