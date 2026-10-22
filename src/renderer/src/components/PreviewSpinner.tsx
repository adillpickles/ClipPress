import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiLoader } from 'react-icons/fi';

import styles from './PreviewSpinner.module.css';

/**
 * A small centred spinner over the preview while the video is loading or waiting for data. It only appears
 * after a short delay, so quick loads and seeks don't flash it.
 */
export default function PreviewSpinner({ busy, delayMs = 250 }: { busy: boolean, delayMs?: number }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) return undefined;
    const timeout = setTimeout(() => setVisible(true), delayMs);
    return () => {
      clearTimeout(timeout);
      setVisible(false);
    };
  }, [busy, delayMs]);

  if (!busy || !visible) return null;

  return (
    <div className={styles['spinner']} role="status" aria-label={t('Loading')}>
      <FiLoader className="spinner-animation" aria-hidden />
    </div>
  );
}
