import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiX } from 'react-icons/fi';

import useUpdateStatus from '../hooks/useUpdateStatus';
import { isStoreBuild } from '../util';
import UpdateControls from './UpdateControls';
import Spinner from './Spinner';
import styles from './UpdateNotice.module.css';
import formatVersion from '../../../common/formatVersion';

const { ipcRenderer } = window.require('electron');

/** How long "ClipPress is up to date" stays after a manual check. */
const upToDateDisplayMs = 4000;
/** How long "… installs when you close the app" stays: there is nothing to do about it. */
const readyDisplayMs = 8000;

export default function UpdateNotice({ visible, overClipsPanel = false }: {
  visible: boolean,
  /** The Clips panel is open: sit over its list, clear of its footer, rather than in the window's corner. */
  overClipsPanel?: boolean,
}) {
  const { t } = useTranslation();
  const status = useUpdateStatus();
  const [dismissedPhase, setDismissedPhase] = useState<string>();
  const phaseKey = `${status?.phase}:${status?.version}`;
  useEffect(() => {
    const show = () => setDismissedPhase(undefined);
    ipcRenderer.on('showUpdates', show);
    return () => { ipcRenderer.removeListener('showUpdates', show); };
  }, []);

  const shown = visible && !isStoreBuild && status != null && dismissedPhase !== phaseKey && status.phase !== 'idle'
    && (status.manual || ['available', 'ready'].includes(status.phase));

  // A manual check that finds nothing (#62), and an update that installs by itself when the app closes, only
  // need a brief confirmation; Settings > Updates still shows them afterwards. The timer only runs while the
  // toast is on screen, so it never runs out behind Settings, and it starts over each time the toast comes back
  // (Help > Check for updates while an update waits brings it back without changing the phase).
  const isUpToDate = status?.phase === 'up-to-date';
  const isReadyOnQuit = status?.phase === 'ready' && status.installOnQuit;
  const hidesItself = shown && (isUpToDate || isReadyOnQuit);
  useEffect(() => {
    if (!hidesItself) return undefined;
    const timeout = setTimeout(() => setDismissedPhase(phaseKey), isUpToDate ? upToDateDisplayMs : readyDisplayMs);
    return () => clearTimeout(timeout);
  }, [hidesItself, isUpToDate, phaseKey]);

  if (!shown) return null;

  const placement = overClipsPanel ? ` ${styles['overClipsPanel']}` : '';

  if (status.phase === 'checking' || status.phase === 'up-to-date' || isReadyOnQuit) {
    let message = t('ClipPress is up to date.');
    if (status.phase === 'checking') message = t('Checking for updates…');
    else if (isReadyOnQuit) message = t('ClipPress {{version}} installs when you close the app.', { version: status.version != null ? formatVersion(status.version) : '' });
    return (
      <div className={`${styles['toast']}${placement}`} role="status" aria-live="polite">
        {status.phase === 'checking' ? <Spinner /> : <FiCheckCircle aria-hidden className={styles['ok']} />}
        {message}
      </div>
    );
  }

  return (
    <div role="region" aria-label={t('App update')} className={`${styles['card']}${placement}`}>
      <button type="button" className={styles['dismiss']} aria-label={t('Dismiss update notice')} title={t('Dismiss')} onClick={() => setDismissedPhase(phaseKey)}>
        <FiX aria-hidden />
      </button>
      <UpdateControls status={status} showCheckButton={false} />
    </div>
  );
}
