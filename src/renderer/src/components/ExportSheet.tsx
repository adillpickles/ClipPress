import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

import styles from './ExportSheet.module.css';
import CloseButton from './CloseButton';
import Button from './Button';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]';

/** What Tab can reach inside `container`, in order: enabled, shown, and not taken out of the Tab order. */
function getTabStops(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
}

// TODO use Dialog component instead, but we need to first remove usage of sweetalert2 inside export confirm because they don't play well together
function ExportSheet({
  visible,
  children,
  renderBottom,
  renderButton,
  onClosePress,
  title,
  subtitle,
  width,
} : {
  visible: boolean,
  /** Shown at the left of the footer (warnings). */
  renderBottom?: (() => ReactNode | null) | undefined,
  /** The primary action, at the right of the footer. */
  renderButton: (() => ReactNode | null),
  /** Focus starts on the element marked `data-autofocus` in here (e.g. the chosen option), else on the sheet itself. */
  children: ReactNode,
  onClosePress: () => void,
  title: string,
  subtitle?: ReactNode,
  width: CSSProperties['width'],
}) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);

  // Keyboard focus moves into the sheet when it opens and goes back when it closes. Only a control the keyboard
  // was on (Tab, then Enter on Export) gets it back: after a click or the E shortcut focus belongs to the page,
  // where the app's shortcuts work (a focused button would take Space instead of play/pause, #60).
  useEffect(() => {
    if (!visible) return undefined;

    const { activeElement } = document;
    const returnFocusTo = activeElement instanceof HTMLElement && activeElement !== document.body && activeElement.matches(':focus-visible')
      ? activeElement
      : undefined;

    const box = boxRef.current;
    // Never the Export button: a habitual Space (play/pause) or Enter right after opening would start the export.
    // On the sheet itself those keys do nothing, and E (export) and Tab still work.
    const initialFocus = box?.querySelector<HTMLElement>('[data-autofocus]') ?? box;
    initialFocus?.focus({ preventScroll: true });

    return () => {
      if (returnFocusTo?.isConnected) {
        returnFocusTo.focus({ preventScroll: true });
        return;
      }
      // The sheet fades out before it's removed; don't leave focus (and the shortcuts) inside it meanwhile.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && box?.contains(focused)) focused.blur();
    };
  }, [visible]);

  // Tab and Shift+Tab go round the sheet instead of into the page behind it. Only when focus is in the sheet, or
  // on the page after a click on the backdrop: popups opened from the sheet (sweetalert2 toasts, menus) keep
  // their own focus.
  useEffect(() => {
    if (!visible) return undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      const box = boxRef.current;
      if (e.key !== 'Tab' || e.defaultPrevented || box == null) return;
      const active = document.activeElement;
      const isInBox = active != null && box.contains(active);
      if (!isInBox && active !== document.body) return;

      const stops = getTabStops(box);
      const first = stops[0];
      const last = stops.at(-1);
      if (first == null || last == null) return;

      let next: HTMLElement | undefined;
      if (!isInBox || active === box) next = e.shiftKey ? last : first;
      else if (e.shiftKey && active === first) next = last;
      else if (!e.shiftKey && active === last) next = first;
      if (next == null) return;

      e.preventDefault();
      next.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  // https://stackoverflow.com/questions/33454533/cant-scroll-to-top-of-flex-item-that-is-overflowing-container
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={styles['sheet']}
          transition={{ duration: 0.18, ease: ['easeOut'] }}
        >
          <motion.div
            ref={boxRef}
            className={styles['box']}
            style={{ width }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            // Focusable so focus can rest on the sheet itself (e.g. after a click on its background).
            tabIndex={-1}
            data-export-sheet
            initial={{ y: 8, scale: 0.99 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className={styles['header']}>
              <div style={{ minWidth: 0 }}>
                <h1 className={styles['title']}>{title}</h1>
                {subtitle != null && <div className={styles['subtitle']}>{subtitle}</div>}
              </div>

              <CloseButton style={{ position: 'static', margin: '-.25rem -.5rem 0 0' }} onClick={onClosePress} />
            </div>

            <div className={`consistent-scrollbar ${styles['scrollArea']}`}>
              {children}
            </div>

            <div className={styles['footer']}>
              <div className={styles['footerMeta']}>{renderBottom?.()}</div>
              <div className={styles['footerActions']}>
                <Button size="lg" onClick={onClosePress}>{t('Cancel')}</Button>
                {renderButton()}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ExportSheet;
