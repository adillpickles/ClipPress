import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiInfo } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import styles from './HelpTip.module.css';

const showDelayMs = 120;
const margin = 8;

/**
 * A small "i" that explains something on hover or keyboard focus, instead of text that is always on screen.
 * The bubble is portalled to the app root so scroll areas and dialogs don't clip it.
 */
export default function HelpTip({ children, label, lit = false }: { children: ReactNode, label?: string, /** The settings search found its text. */ lit?: boolean }) {
  const { t } = useTranslation();
  const tipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number, left: number }>();

  const show = useCallback((immediately: boolean) => {
    clearTimeout(showTimeoutRef.current);
    if (immediately) setOpen(true);
    else showTimeoutRef.current = setTimeout(() => setOpen(true), showDelayMs);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(showTimeoutRef.current);
    setOpen(false);
    setPosition(undefined);
  }, []);

  useEffect(() => () => clearTimeout(showTimeoutRef.current), []);

  // Below the icon, kept inside the window; above it when there's no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const bubble = bubbleRef.current;
    if (button == null || bubble == null) return;
    const anchor = button.getBoundingClientRect();
    const { width, height } = bubble.getBoundingClientRect();
    let top = anchor.bottom + 6;
    if (top + height + margin > window.innerHeight) top = Math.max(margin, anchor.top - height - 6);
    const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - 24), window.innerWidth - width - margin);
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hide();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [hide, open]);

  const portalTarget = document.getElementById('app-root') ?? document.body;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={[styles['button'], ...(open ? [styles['buttonOpen']] : []), ...(lit ? [styles['buttonLit']] : [])].join(' ')}
        aria-label={label ?? t('More about this setting')}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => show(false)}
        onMouseLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        // A click (or tap) opens it too, for anyone who doesn't hover; it closes on leaving, blur or Escape.
        onClick={() => show(true)}
      >
        <FiInfo aria-hidden />
      </button>
      {open && createPortal(
        <div
          ref={bubbleRef}
          id={tipId}
          role="tooltip"
          className={styles['bubble']}
          style={position != null ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
        >
          {children}
        </div>,
        portalTarget,
      )}
    </>
  );
}
