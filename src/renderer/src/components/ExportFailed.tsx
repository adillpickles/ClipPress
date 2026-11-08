import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiChevronDown, FiChevronRight, FiCopy, FiFilm, FiXCircle } from 'react-icons/fi';

import mainApi from '../mainApi';
import Button from './Button';
import resultStyles from './ExportResult.module.css';
import styles from './ExportFailed.module.css';

/**
 * The simple editor's card for an export that didn't work: the "Exported" card's twin (ExportResult), with the clip's
 * picture dimmed under a red cross, one plain line why, and the full message behind Details, to copy for a report.
 */
export default function ExportFailed({ name, picture, reason, details, actions }: {
  name: string,
  /** One of the clip's own pictures (the timeline's), when it has any. */
  picture?: string | undefined,
  reason: string,
  details?: string | undefined,
  actions?: ReactNode,
}) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyDetails = () => {
    if (details == null) return;
    mainApi.writeClipboardText(details).then(() => setCopied(true), (err: unknown) => console.error('Could not copy to the clipboard', err));
  };

  return (
    <div className={resultStyles['result']}>
      <div className={resultStyles['single']}>
        <div className={[resultStyles['thumb'], styles['picture']].join(' ')} aria-hidden>
          {picture != null ? <img src={picture} alt="" draggable={false} /> : <FiFilm className={resultStyles['placeholder']} />}
          <FiXCircle className={styles['cross']} />
        </div>
        <div className={[resultStyles['name'], styles['name']].join(' ')}>
          <span className={resultStyles['nameText']}>{name}</span>
        </div>
        <div className={resultStyles['facts']}>{reason}</div>
      </div>

      <div className={resultStyles['footer']}>
        {details != null && (
          <button type="button" className={resultStyles['detailsToggle']} aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
            {detailsOpen ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
            {t('Details')}
          </button>
        )}
        <span className={resultStyles['status']} />
        <div className={resultStyles['actions']}>{actions}</div>
      </div>

      {details != null && detailsOpen && (
        <div className={[resultStyles['detailsBody'], styles['details']].join(' ')}>
          <Button variant="ghost" size="sm" className={styles['copy']} onClick={copyDetails}>
            {copied ? <FiCheck aria-hidden /> : <FiCopy aria-hidden />}
            {copied ? t('Copied') : t('Copy')}
          </Button>
          <pre className={styles['message']}>{details}</pre>
        </div>
      )}
    </div>
  );
}
