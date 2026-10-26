import { FiAlertTriangle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import styles from './PreviewFailedCard.module.css';


/** Shown over the preview when FFmpeg-assisted playback can't start from the playhead. */
export default function PreviewFailedCard({ hint, action }: {
  hint: string,
  action?: { label: string, onClick: () => void } | undefined,
}) {
  const { t } = useTranslation();

  return (
    <div className={styles['failedWrapper']}>
      <div className={styles['failed']} role="status">
        <div className={styles['failedTitle']}>
          <FiAlertTriangle aria-hidden className={styles['failedIcon']} />
          {t('Can\'t preview this part')}
        </div>
        {/* The title says what went wrong; this says what to do. */}
        <div className={styles['failedText']}>{hint}</div>
        {action != null && (
          <Button variant="primary" size="sm" onClick={action.onClick} className={styles['failedButton']}>{action.label}</Button>
        )}
      </div>
    </div>
  );
}
