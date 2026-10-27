import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import Button from './Button';
import type { ButtonSize } from './Button';
import styles from './ConfirmButton.module.css';

/** How long the question stays locked, so a double-click can't confirm by accident. */
export const confirmLockMs = 1000;
/** A question left alone goes back to the button. */
export const confirmIdleMs = 5000;

/**
 * A button for a small action that can't be taken back, confirmed in place instead of in a dialog: it turns red under
 * the pointer, and a click turns the button itself into the question, locked for a second while a soft red fills it;
 * once full, a second click does it. Escape, a click elsewhere or leaving it alone puts the button back.
 */
export default function ConfirmButton({ children, question, confirmLabel, onConfirm, size, className, grow = false }: {
  children: ReactNode,
  /** Short, a few words: "Reset every shortcut?" (else the confirm label, as a question). */
  question?: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
  size?: ButtonSize | undefined,
  className?: string | undefined,
  /** An icon button: it grows into the question (animated) rather than always keeping room for it. */
  grow?: boolean | undefined,
}) {
  const [state, setState] = useState<'idle' | 'locked' | 'armed'>('idle');
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState(state === 'locked' ? 'armed' : 'idle'), state === 'locked' ? confirmLockMs : confirmIdleMs);
    return () => clearTimeout(timer);
  }, [state]);

  const asking = state !== 'idle';
  const widthRef = useRef<number>();
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!grow || button == null) return;
    const from = widthRef.current;
    const to = button.offsetWidth;
    widthRef.current = to;
    if (from != null && from !== to && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      button.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 160, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }, [asking, grow]);

  useEffect(() => {
    if (!asking) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setState('idle');
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !buttonRef.current?.contains(e.target)) setState('idle');
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [asking]);

  const questionText = question ?? `${confirmLabel}?`;
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size={size}
      className={[styles['button'], ...(className != null ? [className] : [])].join(' ')}
      data-state={state}
      data-grow={grow || undefined}
      aria-disabled={state === 'locked' || undefined}
      aria-label={asking ? questionText : undefined}
      onBlur={() => setState('idle')}
      onClick={() => {
        if (state === 'idle') {
          setState('locked');
        } else if (state === 'armed') {
          setState('idle');
          onConfirm();
        }
      }}
    >
      {/* Both labels share one cell, so the button keeps its size when it asks. */}
      <span className={styles['labels']}>
        <span className={styles['idleLabel']} aria-hidden={asking || undefined}>{children}</span>
        <span className={styles['question']} aria-hidden={!asking || undefined}>{questionText}</span>
      </span>
    </Button>
  );
}
