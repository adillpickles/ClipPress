import { memo, useState } from 'react';
import { motion } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';
import useInterval from 'react-use/lib/useInterval';
import { FiActivity } from 'react-icons/fi';

import Button from './Button';
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
  const progressPercent = progress != null ? `${(progress * 100).toFixed(1)}%` : undefined;

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
        <div className={styles['iconBadge']}>
          <FiActivity />
        </div>

        <div className={styles['eyebrow']}>
          {t('Working')}
        </div>

        <div className={styles['title']}>
          {text}
        </div>

        {detailText != null && (
          <div className={styles['detail']}>
            {detailText}
          </div>
        )}

        <div className={styles['metaRow']}>
          <div className={styles['elapsed']}>
            {t('Elapsed: {{seconds}} seconds', { seconds: (elapsedMs / 1000).toFixed(1) })}
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
          <Button onClick={onAbortClick} style={{ padding: '.35em .95em' }}><Trans>Abort</Trans></Button>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(Working);
