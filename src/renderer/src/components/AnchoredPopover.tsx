import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './AnchoredPopover.module.css';

const margin = 8;

/**
 * A small floating panel next to a point or element (above it when there's room), portalled to the app root.
 * Closes on a click outside it or Escape.
 */
export default function AnchoredPopover({ anchor, onClose, children, label }: {
  /** Where to open: an element, or a point (e.g. where the user right-clicked). */
  anchor: HTMLElement | { x: number, y: number },
  onClose: () => void,
  children: ReactNode,
  label: string,
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number, left: number }>();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) return;
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
    const { width, height } = el.getBoundingClientRect();
    let top = rect.top - height - 8;
    if (top < margin) top = Math.min(window.innerHeight - height - margin, rect.bottom + 8);
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
    setPosition({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchor instanceof HTMLElement && anchor.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current();
    };
    // On the next tick, so the click that opened it doesn't close it.
    const timeout = setTimeout(() => window.addEventListener('pointerdown', onPointerDown, true));
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={styles['popover']}
      style={position != null ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
    >
      {children}
    </div>,
    document.getElementById('app-root') ?? document.body,
  );
}
