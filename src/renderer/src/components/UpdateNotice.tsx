import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiX } from 'react-icons/fi';

import useUpdateStatus from '../hooks/useUpdateStatus';
import { isStoreBuild } from '../util';
import UpdateControls from './UpdateControls';
import Spinner from './Spinner';
import styles from './UpdateNotice.module.css';

const { ipcRenderer } = window.require('electron');

/** How long "ClipPress is up to date" stays after a manual check. */
const upToDateDisplayMs = 4000;

export default function UpdateNotice({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const status = useUpdateStatus();
  const [dismissedPhase, setDismissedPhase] = useState<string>();
  const phaseKey = `${status?.phase}:${status?.version}`;
  useEffect(() => {
    const show = () => setDismissedPhase(undefined);
    ipcRenderer.on('showUpdates', show);
    return () => { ipcRenderer.removeListener('showUpdates', show); };
  }, []);

  // A manual check that finds nothing only needs a brief confirmation (#62).
  const isUpToDate = status?.phase === 'up-to-date';
  useEffect(() => {
    if (!isUpToDate) return undefined;
    const timeout = setTimeout(() => setDismissedPhase(phaseKey), upToDateDisplayMs);
    return () => clearTimeout(timeout);
  }, [isUpToDate, phaseKey]);

  if (!visible || isStoreBuild || status == null || dismissedPhase === phaseKey || status.phase === 'idle'
    || (!status.manual && !['available', 'ready'].includes(status.phase))) return null;

  if (status.phase === 'checking' || status.phase === 'up-to-date') {
    return (
      <div className={styles['toast']} role="status" aria-live="polite">
        {status.phase === 'checking' ? <Spinner /> : <FiCheckCircle aria-hidden className={styles['ok']} />}
        {status.phase === 'checking' ? t('Checking for updates…') : t('ClipPress is up to date.')}
      </div>
    );
  }

  return (
    <div aria-label={t('App update')} className={styles['card']}>
      <button type="button" className={styles['dismiss']} aria-label={t('Dismiss update notice')} title={t('Dismiss')} onClick={() => setDismissedPhase(phaseKey)}>
        <FiX aria-hidden />
      </button>
      <UpdateControls status={status} showCheckButton={false} />
    </div>
  );
}
