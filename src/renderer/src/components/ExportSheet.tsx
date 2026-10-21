import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

import styles from './ExportSheet.module.css';
import CloseButton from './CloseButton';
import Button from './Button';

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
  children: ReactNode,
  onClosePress: () => void,
  title: string,
  subtitle?: ReactNode,
  width: CSSProperties['width'],
}) {
  const { t } = useTranslation();

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
            className={styles['box']}
            style={{ width }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
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
