import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import styles from './ExportSheet.module.css';
import CloseButton from './CloseButton';

// TODO use Dialog component instead, but we need to first remove usage of sweetalert2 inside export confirm because they don't play well together
function ExportSheet({
  visible,
  children,
  renderBottom,
  renderButton,
  onClosePress,
  title,
  width,
} : {
  visible: boolean,
  renderBottom?: (() => ReactNode | null) | undefined,
  renderButton: (() => ReactNode | null),
  children: ReactNode,
  onClosePress: () => void,
  title: string,
  width: CSSProperties['width'],
}) {
  // https://stackoverflow.com/questions/33454533/cant-scroll-to-top-of-flex-item-that-is-overflowing-container
  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles['sheet']}
            transition={{ duration: 0.3, ease: ['easeOut'] }}
          >
            <div className={styles['box']} style={{ width }}>
              <div className={styles['header']}>
                <div>
                  <h1 style={{ fontSize: '1.4em', marginTop: 0, marginBottom: '.15em' }}>{title}</h1>
                  {renderBottom != null && (
                    <div className={styles['headerMeta']}>{renderBottom()}</div>
                  )}
                </div>

                <div className={styles['headerActions']}>
                  {renderButton()}
                  <CloseButton type="submit" style={{ position: 'static', margin: 0 }} onClick={onClosePress} />
                </div>
              </div>

              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ExportSheet;
