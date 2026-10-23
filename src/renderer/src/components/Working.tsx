import { memo, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import useInterval from 'react-use/lib/useInterval';
import { FiLoader } from 'react-icons/fi';

import Button from './Button';
import formatClockTime from '../util/clockTime';
import styles from './Working.module.css';


function Working({ text, detailText, progress, onAbortClick }: {
  text: string,
  detailText?: string | undefined,
  progress?: number | undefined,
  onAbortClick: () => void
}) {
  const { t } = useTranslation();

  const [startedAt] = useState(() => new Date());
  const [elapsedMs, setElapsedMs] = useState(0);
  // Whole percents: a decimal changing several times a second only flickers. Rounded down, so it never reads
  // 100% before it's done.
  const progressPercent = progress != null ? `${Math.floor(progress * 100)}%` : undefined;

  // Reassure the user that the app is not frozen
  // This is because some ffmpeg operations can take a long time without giving any progress updates, which might make the user think that the app is frozen
  // https://github.com/mifi/lossless-cut/issues/2746

  useInterval(() => {
    setElapsedMs(Date.now() - startedAt.getTime());
  }, 100);

  return (
    <div className={styles['wrapper']} style={{ position: 'absolute', bottom: 0, top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <motion.div
        className={styles['card']}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
      >
        <div className={styles['title']}>
          <FiLoader aria-hidden className={`${styles['titleIcon']} spinner-animation`} />
          {text}
        </div>

        {detailText != null && (
          <div className={styles['detail']}>
            {detailText}
          </div>
        )}

        <div className={styles['metaRow']}>
          <div className={styles['elapsed']}>
            {t('{{time}} elapsed', { time: formatClockTime(elapsedMs / 1000) })}
          </div>
          {progressPercent != null && (
            <div className={styles['progressValue']}>
              {progressPercent}
            </div>
          )}
        </div>

        {progress != null && (
          <div className={styles['progressTrack']}>
            <div className={styles['progressFill']} style={{ width: `${Math.max(progress * 100, 4)}%` }} />
          </div>
        )}

        <div className={styles['actions']}>
          <Button onClick={onAbortClick}>{t('Cancel')}</Button>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(Working);
