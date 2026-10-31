import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiDownload, FiRotateCw, FiX } from 'react-icons/fi';

import useUpdateStatus from '../hooks/useUpdateStatus';
import { isStoreBuild } from '../util';
import UpdateControls from './UpdateControls';
import mainApi from '../mainApi';
import Spinner from './Spinner';
import styles from './UpdateNotice.module.css';
import formatVersion from '../../../common/formatVersion';
import { getReleaseUrl } from '../../../common/constants';

const { ipcRenderer, shell } = window.require('electron');

/** How long "ClipPress is up to date" stays after a manual check. */
const upToDateDisplayMs = 4000;
/** How long "… installs when you close the app" stays (with its restart button; Settings > Updates has it too). */
const readyDisplayMs = 12_000;

/** How far the download has got, as a ring round the download icon. */
function DownloadRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 15;
  return (
    <svg className={styles['ring']} viewBox="0 0 36 36">
      <circle className={styles['ringTrack']} cx="18" cy="18" r="15" />
      <circle className={styles['ringFill']} cx="18" cy="18" r="15" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)} />
    </svg>
  );
}

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

  if (status.phase === 'checking' || status.phase === 'up-to-date') {
    return (
      <div className={`${styles['toast']}${placement}`} role="status" aria-live="polite">
        {status.phase === 'checking' ? <Spinner /> : <FiCheckCircle aria-hidden className={styles['ok']} />}
        {status.phase === 'checking' ? t('Checking for updates…') : t('ClipPress is up to date.')}
      </div>
    );
  }

  // An update on its way: one button where the tick was, which is what to do next. Download (asked first), a ring
  // filling round it while it downloads, then restart (clockwise, the settings' revert turned round) to install now.
  // "What's new" opens the release.
  const version = status.version != null ? formatVersion(status.version) : '';
  const canDownload = status.phase === 'available' && status.supported && status.reason == null;
  if (canDownload || status.phase === 'downloading' || isReadyOnQuit) {
    const invoke = (action: () => Promise<unknown>) => { action().catch((error: unknown) => console.error('Update action failed', error)); };
    let message = t('ClipPress {{version}} installs when you close the app.', { version });
    if (canDownload) message = t('ClipPress {{version}} is available.', { version });
    else if (status.phase === 'downloading') message = t('Downloading ClipPress {{version}}…', { version });
    return (
      <div className={`${styles['toast']}${placement}`} role="status" aria-live="polite">
        {status.phase === 'downloading' ? (
          <span className={styles['action']} aria-hidden>
            <DownloadRing percent={status.percent ?? 0} />
            <FiDownload />
          </span>
        ) : (
          <button
            type="button"
            className={[styles['action'], ...(isReadyOnQuit ? [styles['actionReady']] : [])].join(' ')}
            title={isReadyOnQuit ? t('Restart ClipPress to install it now') : t('Download it')}
            onClick={() => invoke(() => (isReadyOnQuit ? mainApi.restartToUpdate() : mainApi.downloadUpdate()))}
          >
            {isReadyOnQuit ? <FiRotateCw aria-hidden /> : <FiDownload aria-hidden />}
          </button>
        )}
        <span className={styles['message']}>
          {message}
          {status.version != null && (
            <button type="button" className={styles['whatsNew']} onClick={() => invoke(() => shell.openExternal(getReleaseUrl(status.version!)))}>
              {t("What's new")}
            </button>
          )}
        </span>
        {canDownload && (
          <button type="button" className={styles['toastDismiss']} aria-label={t('Dismiss update notice')} title={t('Dismiss')} onClick={() => setDismissedPhase(phaseKey)}>
            <FiX aria-hidden />
          </button>
        )}
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
