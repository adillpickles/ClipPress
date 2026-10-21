import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { FiInfo } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import styles from './Settings.module.css';

/**
 * One setting: a short name and a one-line description on the left, the control on the right.
 * Longer explanations are one click away (the info button) instead of always on screen (#63).
 */
export default function SettingRow({ label, description, details, children, controlId }: {
  label: ReactNode,
  description?: ReactNode,
  details?: ReactNode,
  children: ReactNode,
  /** The id of the control, so that the label focuses it. */
  controlId?: string | undefined,
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();

  return (
    <div className={styles['row']}>
      <div className={styles['rowText']}>
        <div className={styles['rowLabel']}>
          {controlId != null ? <label htmlFor={controlId}>{label}</label> : label}
          {details != null && (
            <button
              type="button"
              className={[styles['infoButton'], ...(showDetails ? [styles['infoButtonActive']] : [])].join(' ')}
              aria-expanded={showDetails}
              aria-controls={detailsId}
              aria-label={t('More about this setting')}
              title={showDetails ? t('Hide details') : t('More about this setting')}
              onClick={() => setShowDetails((v) => !v)}
            >
              <FiInfo aria-hidden />
            </button>
          )}
        </div>
        {description != null && <div className={styles['rowDescription']}>{description}</div>}
        {details != null && showDetails && <div id={detailsId} className={styles['rowDetails']}>{details}</div>}
      </div>
      <div className={styles['rowControl']}>{children}</div>
    </div>
  );
}
