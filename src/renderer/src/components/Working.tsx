import { memo, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import useInterval from 'react-use/lib/useInterval';
import { FiLoader } from 'react-icons/fi';

import Button from './Button';
import formatClockTime from '../util/clockTime';
import styles from './Working.module.css';


/** A quiet task (opening a clip) shows nothing for this long, and offers Cancel only after the next. */
const quietShowAfterMs = 500;
const quietCancelAfterMs = 4000;

/**
 * Opening a clip: usually done before anything would show. If it takes a while (a slow drive, a big file), a small
 * card says so at the top, with a soft moving bar, and leaves the app as it is underneath; Cancel comes later.
 * Clicks on the app wait meanwhile (an invisible layer), as they do while it works on anything else.
 */
function QuietWorking({ text, onAbortClick }: { text: string, onAbortClick: () => void }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'hidden' | 'shown' | 'cancellable'>('hidden');
  useEffect(() => {
    const show = setTimeout(() => setStage('shown'), quietShowAfterMs);
    const cancellable = setTimeout(() => setStage('cancellable'), quietCancelAfterMs);
    return () => {
      clearTimeout(show);
      clearTimeout(cancellable);
    };
  }, []);

  return (
    <div className={styles['quietWrapper']}>
      {stage !== 'hidden' && (
        <motion.div
          className={styles['quietCard']}
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          <div className={styles['quietRow']}>
            <span className={styles['quietText']}>{text}</span>
            {stage === 'cancellable' && (
              <button type="button" className={styles['quietCancel']} onClick={onAbortClick}>{t('Cancel')}</button>
            )}
          </div>
          <div className={styles['indeterminate']} aria-hidden />
        </motion.div>
      )}
    </div>
  );
}

function WorkingCard({ text, detailText, progress, onAbortClick }: {
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

function Working({ text, detailText, progress, quiet = false, onAbortClick }: {
  text: string,
  detailText?: string | undefined,
  progress?: number | undefined,
  quiet?: boolean | undefined,
  onAbortClick: () => void
}) {
  if (quiet) return <QuietWorking text={text} onAbortClick={onAbortClick} />;
  return <WorkingCard text={text} detailText={detailText} progress={progress} onAbortClick={onAbortClick} />;
}

export default memo(Working);
