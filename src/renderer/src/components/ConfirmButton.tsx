import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import type { ButtonSize } from './Button';
import styles from './ConfirmButton.module.css';

/**
 * A button for a small action that can't be taken back, confirmed in place instead of in a dialog: it turns red under
 * the pointer, and a click swaps it for the question with its confirm and Cancel right there. Escape or a click
 * elsewhere puts the button back.
 */
export default function ConfirmButton({ children, question, confirmLabel, onConfirm, size, className }: {
  children: ReactNode,
  /** Short, a few words: "Reset every shortcut?" */
  question?: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
  size?: ButtonSize | undefined,
  className?: string | undefined,
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const groupRef = useRef<HTMLSpanElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!asking) return undefined;
    confirmRef.current?.focus({ focusVisible: false } as FocusOptions);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setAsking(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !groupRef.current?.contains(e.target)) setAsking(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [asking]);

  if (!asking) {
    return (
      <Button variant="ghost" size={size} className={[styles['idle'], ...(className != null ? [className] : [])].join(' ')} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span ref={groupRef} className={[styles['asking'], ...(className != null ? [className] : [])].join(' ')} role="group" aria-label={question ?? confirmLabel}>
      {question != null && <span className={styles['question']}>{question}</span>}
      <Button ref={confirmRef} variant="danger" size={size} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</Button>
      <Button variant="ghost" size={size} onClick={() => setAsking(false)}>{t('Cancel')}</Button>
    </span>
  );
}
