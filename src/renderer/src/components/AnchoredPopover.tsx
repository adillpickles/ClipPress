import type { ReactNode, SyntheticEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './AnchoredPopover.module.css';

const margin = 8;

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

const focusableSelector = 'input:not(:disabled), button:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A small floating panel next to a point or element (above it when there's room), portalled to the app root.
 * Closes on a click outside it or Escape.
 */
export default function AnchoredPopover({ anchor, onClose, children, label, className, align = 'center', dataShelf, keyboardFocus = false, onPointerEnter, onPointerLeave }: {
  /** Where to open: an element, or a point (e.g. where the user right-clicked). */
  anchor: HTMLElement | { x: number, y: number },
  onClose: () => void,
  children: ReactNode,
  label: string,
  className?: string | undefined,
  /** Centred on the anchor, or lined up with its left edge. */
  align?: 'center' | 'start' | undefined,
  /** Marks the shelf's popover, so focus inside it can be found. */
  dataShelf?: boolean | undefined,
  /**
   * Opened from the keyboard, focus moves to the popover's control marked `data-autofocus`, else its first one (it
   * is portalled to the end of the app, so Tab wouldn't reach it soon), and Escape or a click outside gives it back
   * to what opened it. Opened with the mouse, focus stays where it is.
   */
  keyboardFocus?: boolean | undefined,
  onPointerEnter?: (() => void) | undefined,
  onPointerLeave?: (() => void) | undefined,
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number, left: number }>();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // What had focus when it opened, if that was from the keyboard (its focus ring showing).
  const [opener] = useState(() => {
    const active = document.activeElement;
    return keyboardFocus && active instanceof HTMLElement && active.matches(':focus-visible') ? active : undefined;
  });
  const focusMovedRef = useRef(false);
  useEffect(() => {
    // Once placed: focusing it while it still waits off-screen would scroll.
    if (opener == null || position == null || focusMovedRef.current) return;
    focusMovedRef.current = true;
    const el = ref.current;
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(focusableSelector))?.focus({ preventScroll: true });
  }, [opener, position]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) return;
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
    const { width, height } = el.getBoundingClientRect();
    let top = rect.top - height - 8;
    if (top < margin) top = Math.min(window.innerHeight - height - margin, rect.bottom + 8);
    const preferredLeft = align === 'start' ? rect.left : rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(margin, preferredLeft), window.innerWidth - width - margin);
    setPosition({ top, left });
  }, [align, anchor]);

  useEffect(() => {
    const close = () => {
      // Also when focus fell to the page, e.g. its reset button turned disabled when pressed.
      const focusInside = ref.current?.contains(document.activeElement) || document.activeElement === document.body;
      if (opener != null && opener.isConnected && focusInside) opener.focus({ preventScroll: true });
      onCloseRef.current();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchor instanceof HTMLElement && anchor.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    // On the next tick, so the click that opened it doesn't close it.
    const timeout = setTimeout(() => window.addEventListener('pointerdown', onPointerDown, true));
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, opener]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-shelf={dataShelf ? '' : undefined}
      className={[styles['popover'], ...(className != null ? [className] : [])].join(' ')}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      // Portalled, but React still bubbles its events to the component that rendered it: keep the wheel from
      // zooming something underneath (the crop editor zooms on it). Clicks are left alone: stopping them would also
      // hide them from window listeners, like other menus' click-outside handling.
      onWheel={stopPropagation}
      style={position != null ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
    >
      {children}
    </div>,
    document.getElementById('app-root') ?? document.body,
  );
}
