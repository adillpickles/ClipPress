import type { CSSProperties, MouseEvent as ReactMouseEvent, TextareaHTMLAttributes } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { OverlayClip } from '../types';
import type { UndoableSetOptions } from '../undoableHistory';
import {
  defaultTextOverlayFontFamily,
  fitTextOverlayBox,
  getOverlayFontSize,
  getRotatedVideoDimensions,
  isOverlayActiveAtTime,
  layoutTextOverlay,
  textOverlayLineHeight,
} from '../textOverlays';
import { moveTextBox, resizeTextBoxWidth, scaleTextBox } from '../textBox';
import type { TextBoxCorner, TextBoxSide, TextBoxStart } from '../textBox';
import holdDragCursor from '../dragCursor';
import styles from './TextOverlayEditor.module.css';

const corners: TextBoxCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const sides: TextBoxSide[] = ['left', 'right'];
/** A press moves the box only once the pointer has gone this far, so a click or double-click never nudges it. */
const moveDeadZonePx = 3;
/** How close (screen pixels) the box's centre must come to the picture's centre to snap onto it. */
const snapPx = 6;

type Gesture = { kind: 'move' } | { kind: 'corner', corner: TextBoxCorner } | { kind: 'side', side: TextBoxSide };

const textStyle: CSSProperties = {
  fontFamily: defaultTextOverlayFontFamily,
  lineHeight: textOverlayLineHeight,
  color: 'rgba(255, 255, 255, 0.98)',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
  whiteSpace: 'pre',
};

/**
 * One text's text box. Its ref callback stays the same while the box is there (an inline one changes every render, and
 * React calls the old one with null, which would read as the box going away and stop typing).
 */
function OverlayTextArea({ overlayId, onTextAreaRef, ...props }: { overlayId: string, onTextAreaRef: (id: string, textArea: HTMLTextAreaElement | null) => void } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useCallback((textArea: HTMLTextAreaElement | null) => onTextAreaRef(overlayId, textArea), [onTextAreaRef, overlayId]);
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <textarea ref={ref} {...props} />;
}

/**
 * The texts on the picture, as a design tool's text boxes (Clipchamp, Canva): a click selects a box and a drag anywhere
 * on it moves it (its centre snaps to the picture's centre lines); a click on the selected box (Canva's way), a
 * double-click, Enter or Add Text starts typing; the
 * corners resize the text and the sides change its width. Each text is laid out at the export's own pixel size and
 * scaled down, so it wraps exactly where the exported image does. Read-only, it just draws the texts (inside the
 * Zoom / Crop frame, where they'll land).
 */
function TextOverlayEditor({
  overlayClips,
  selectedOverlayId,
  relevantTime,
  videoWidth,
  videoHeight,
  rotation,
  readOnly = false,
  keysBlocked = false,
  onSelectOverlay,
  onUpdateOverlay,
}: {
  overlayClips: OverlayClip[],
  selectedOverlayId: string | undefined,
  relevantTime: number,
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
  readOnly?: boolean,
  /** A dialog or panel has the keys: Enter and Escape aren't the text box's. */
  keysBlocked?: boolean,
  onSelectOverlay?: ((overlayId: string | undefined) => void) | undefined,
  onUpdateOverlay?: ((overlayId: string, updater: (clip: OverlayClip) => OverlayClip, undo?: UndoableSetOptions) => void) | undefined,
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const [typingId, setTypingId] = useState<string>();
  const [guides, setGuides] = useState<{ vertical: boolean, horizontal: boolean }>();

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
  const editable = !readOnly && onUpdateOverlay != null && onSelectOverlay != null;
  const selectedVisible = editable && visibleOverlays.some((overlayClip) => overlayClip.overlayId === selectedOverlayId);

  // The text box only takes keyboard focus when the user asks to type: a text just added, a double-click or Enter.
  // Not when a box is selected or playback reaches it, which would take the keys from playback (Space, #67).
  const textAreasRef = useRef(new Map<string, HTMLTextAreaElement>());
  const knownOverlayIdsRef = useRef<Set<string>>(new Set(overlayClips.map((overlayClip) => overlayClip.overlayId)));

  const startTyping = useCallback((overlayId: string, at?: { x: number, y: number }) => {
    const textArea = textAreasRef.current.get(overlayId);
    if (textArea == null) return;
    let caret: number | undefined;
    if (at != null) {
      // The text box ignores the pointer until typing starts; it has to be hit-testable to find the caret there.
      textArea.style.pointerEvents = 'auto';
      const position = document.caretPositionFromPoint?.(at.x, at.y);
      textArea.style.pointerEvents = '';
      if (position?.offsetNode === textArea) caret = position.offset;
    }
    textArea.focus();
    // Where it was clicked, the caret alone (nothing selected); from Enter or Add Text, all of it, to type over.
    if (caret == null) textArea.select();
    else textArea.setSelectionRange(caret, caret);
  }, []);

  // A text that was just added (Add Text) is ready to type over.
  useEffect(() => {
    const known = knownOverlayIdsRef.current;
    const added = overlayClips.filter((overlayClip) => !known.has(overlayClip.overlayId));
    added.forEach((overlayClip) => known.add(overlayClip.overlayId));
    if (editable && selectedOverlayId != null && added.some((overlayClip) => overlayClip.overlayId === selectedOverlayId)) startTyping(selectedOverlayId);
  }, [editable, overlayClips, selectedOverlayId, startTyping]);

  // Enter types into the selected text; Escape lets go of it. Ahead of the editor's own shortcuts (Enter renames
  // the clip), but only while the selected text is on the picture and nothing else has the keys.
  useEffect(() => {
    if (!selectedVisible || keysBlocked || typingId != null || selectedOverlayId == null) return undefined;
    const overlayId = selectedOverlayId;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== 'Enter' && event.key !== 'Escape') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Only from the page itself or the picture: a focused control (a button reached with Tab, a field, a dialog)
      // keeps its own Enter and Escape.
      const { target } = event;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (target instanceof Element && target !== document.body && target !== document.documentElement && wrapperRef.current?.contains(target) !== true) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') startTyping(overlayId);
      else onSelectOverlay?.(undefined);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [keysBlocked, onSelectOverlay, selectedOverlayId, selectedVisible, startTyping, typingId]);

  const setTextAreaRef = useCallback((overlayId: string, textArea: HTMLTextAreaElement | null) => {
    if (textArea != null) {
      textAreasRef.current.set(overlayId, textArea);
      return;
    }
    textAreasRef.current.delete(overlayId);
    // A text box removed while typing (another text selected, the playhead moved on) gets no blur event.
    setTypingId((id) => (id === overlayId ? undefined : id));
  }, []);

  const measureHeight = useCallback((text: string) => (fontSize: number, width: number) => (
    layoutTextOverlay({ text, widthPx: width * video.width, fontSizePx: fontSize * video.height }).heightPx / video.height
  ), [video.height, video.width]);

  const gestureCleanupRef = useRef<() => void>();
  useEffect(() => () => gestureCleanupRef.current?.(), []);

  const beginGesture = useCallback((event: ReactMouseEvent, overlayClip: OverlayClip, gesture: Gesture) => {
    if (event.button !== 0 || onUpdateOverlay == null || surfaceSize.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    gestureCleanupRef.current?.();
    // Another box being typed in lets go of the keys (the press itself doesn't move the focus).
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && active !== textAreasRef.current.get(overlayClip.overlayId)) active.blur();
    onSelectOverlay?.(overlayClip.overlayId);

    const { overlayId, text } = overlayClip;
    const fontSize = getOverlayFontSize(overlayClip);
    const fitHeight = measureHeight(text);
    const start: TextBoxStart = { box: overlayClip.box, height: fitHeight(fontSize, overlayClip.box.width), fontSize };
    const surface = { ...surfaceSize };
    const pointer = { x: event.clientX, y: event.clientY };
    // A click (no drag) on a text already selected, not being typed in, types where it was clicked.
    const typeOnClick = gesture.kind === 'move' && overlayClip.overlayId === selectedOverlayId && typingId !== overlayClip.overlayId;
    // One undo step per drag, however long it pauses.
    const undo = { coalesceKey: `text-box:${overlayId}:${Date.now()}`, wholeGesture: true };
    let moving = gesture.kind !== 'move';
    let releaseCursor = gesture.kind === 'move' ? undefined : holdDragCursor(gesture.kind === 'side' ? 'ew-resize' : (gesture.corner === 'top-left' || gesture.corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'));

    const listeners = new AbortController();
    const finish = () => {
      listeners.abort();
      releaseCursor?.();
      setGuides(undefined);
      gestureCleanupRef.current = undefined;
    };
    gestureCleanupRef.current = finish;

    window.addEventListener('mousemove', (moveEvent) => {
      const delta = { x: moveEvent.clientX - pointer.x, y: moveEvent.clientY - pointer.y };
      if (!moving) {
        if (Math.hypot(delta.x, delta.y) < moveDeadZonePx) return;
        moving = true;
        releaseCursor = holdDragCursor('move');
      }
      if (gesture.kind === 'move') {
        const moved = moveTextBox(start, { x: delta.x / surface.width, y: delta.y / surface.height }, { x: snapPx / surface.width, y: snapPx / surface.height });
        setGuides(moved.guides.vertical || moved.guides.horizontal ? moved.guides : undefined);
        onUpdateOverlay(overlayId, (clip) => ({ ...clip, box: moved.box }), undo);
        return;
      }
      const resized = gesture.kind === 'corner'
        ? scaleTextBox(start, gesture.corner, delta, surface, fitHeight)
        : resizeTextBoxWidth(start, gesture.side, delta.x / surface.width, fitHeight);
      onUpdateOverlay(overlayId, (clip) => ({ ...clip, fontSize: resized.fontSize, box: resized.box }), undo);
    }, { signal: listeners.signal });
    window.addEventListener('mouseup', (upEvent) => {
      finish();
      if (typeOnClick && !moving) startTyping(overlayId, { x: upEvent.clientX, y: upEvent.clientY });
    }, { signal: listeners.signal });
    window.addEventListener('blur', finish, { signal: listeners.signal });
  }, [measureHeight, onSelectOverlay, onUpdateOverlay, selectedOverlayId, startTyping, surfaceSize, typingId]);

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
          const selected = editable && overlayClip.overlayId === selectedOverlayId;
          const typing = selected && typingId === overlayClip.overlayId;
          const fontSizePx = getOverlayFontSize(overlayClip) * video.height;
          const widthPx = overlayClip.box.width * video.width;
          const layout = layoutTextOverlay({ text: overlayClip.text, widthPx, fontSizePx });
          const height = layout.heightPx * previewScale;
          const scaledTextStyle: CSSProperties = {
            ...textStyle,
            fontSize: fontSizePx,
            padding: `${layout.paddingY}px ${layout.paddingX}px`,
          };
          // The side handles fit between the corners on a short box.
          const sideHandleHeight = Math.min(16, height - 24);

          return (
            <div
              key={overlayClip.overlayId}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? -1 : undefined}
              aria-label={editable ? t('Text: {{text}}', { text: overlayClip.text }) : undefined}
              className={[styles['box'], ...(editable ? [styles['boxEditable']] : []), ...(selected ? [styles['boxSelected']] : []), ...(typing ? [styles['boxTyping']] : [])].join(' ')}
              title={selected && !typing ? t('Click to type') : undefined}
              onMouseDown={editable ? (event) => beginGesture(event, overlayClip, { kind: 'move' }) : undefined}
              onDoubleClick={editable ? (event) => startTyping(overlayClip.overlayId, { x: event.clientX, y: event.clientY }) : undefined}
              style={{ left: overlayClip.box.x * surfaceSize.width, top: overlayClip.box.y * surfaceSize.height, width: overlayClip.box.width * surfaceSize.width, height }}
            >
              {/* Laid out at the export's pixel size, then scaled to the preview. */}
              <div className={styles['content']} style={{ width: widthPx, height: layout.heightPx, transform: `scale(${previewScale})` }}>
                {selected ? (
                  <OverlayTextArea
                    overlayId={overlayClip.overlayId}
                    onTextAreaRef={setTextAreaRef}
                    aria-label={t('Text')}
                    tabIndex={typing ? 0 : -1}
                    value={overlayClip.text}
                    onChange={(event) => onUpdateOverlay?.(overlayClip.overlayId, (clip) => fitTextOverlayBox({ ...clip, text: event.target.value }, video.width, video.height))}
                    onFocus={() => setTypingId(overlayClip.overlayId)}
                    onBlur={() => setTypingId((id) => (id === overlayClip.overlayId ? undefined : id))}
                    onMouseDown={(event) => { if (typing) event.stopPropagation(); }}
                    // The box is always as tall as its lines; it must never scroll (that hid the top line).
                    onScroll={(event) => { const textArea = event.currentTarget; textArea.scrollTop = 0; }}
                    // Escape stops typing; the text stays selected.
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.blur(); } }}
                    spellCheck={false}
                    className={styles['textArea']}
                    style={{ ...scaledTextStyle, whiteSpace: 'pre-wrap' }}
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
              </div>

              {selected && (
                <>
                  {corners.map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      tabIndex={-1}
                      aria-label={t('Text size')}
                      className={styles['corner']}
                      data-corner={corner}
                      onMouseDown={(event) => beginGesture(event, overlayClip, { kind: 'corner', corner })}
                    />
                  ))}
                  {sideHandleHeight >= 6 && sides.map((side) => (
                    <button
                      key={side}
                      type="button"
                      tabIndex={-1}
                      aria-label={t('Text box width')}
                      className={styles['side']}
                      data-side={side}
                      style={{ '--side-height': `${sideHandleHeight}px` } as CSSProperties}
                      onMouseDown={(event) => beginGesture(event, overlayClip, { kind: 'side', side })}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
        {guides?.vertical && <div className={styles['guideVertical']} />}
        {guides?.horizontal && <div className={styles['guideHorizontal']} />}
      </div>
    </div>
  );
}

export default memo(TextOverlayEditor);
