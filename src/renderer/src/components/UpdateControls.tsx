import { useTranslation } from 'react-i18next';

import mainApi from '../mainApi';
import Button from './Button';
import { getReleaseUrl } from '../../../common/constants';
import type { UpdateStatus } from '../../../common/updates';

const { shell } = window.require('electron');

/** `showCheckButton`: offer "Check for updates" when idle or up to date (Settings does, the floating notice doesn't, #62). */
export default function UpdateControls({ status, showCheckButton = true }: { status: UpdateStatus | undefined, showCheckButton?: boolean }) {
  const { t } = useTranslation();
  if (status == null) return null;
  const invoke = (action: () => Promise<unknown>) => { action().catch((error: unknown) => console.error('Update action failed', error)); };
  let message = t('Updates are checked after the app is ready.');
  switch (status.phase) {
    case 'checking': {
      message = t('Checking for updates…');
      break;
    }
    case 'up-to-date': {
      message = t('ClipPress is up to date.');
      break;
    }
    case 'available': {
      message = t('ClipPress {{version}} is available.', { version: status.version });
      break;
    }
    case 'downloading': {
      message = t('Downloading update… {{percent}}%', { percent: status.percent ?? 0 });
      break;
    }
    case 'ready': {
      message = status.installOnQuit
        ? t('ClipPress {{version}} will install when you close the app. Your next launch will use the new version.', { version: status.version })
        : t('ClipPress {{version}} is downloaded. Installation is paused.', { version: status.version });
      break;
    }
    case 'error': {
      message = t('The update could not be completed. Your current app is unchanged.');
      break;
    }
    default: { break; }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.5rem' }}>
      <div role="status" aria-live="polite" style={{ fontSize: '.875rem', lineHeight: 1.45 }}>{message}</div>
      {status.phase === 'available' && status.reason === 'settings-in-installation-folder' && (
        <div style={{ fontSize: '.8125rem', lineHeight: 1.45, color: 'var(--cp-text-muted)' }}>{t('Installing it would delete the settings that are still in the installation folder. ClipPress tries to move a settings file there out again the next time it starts; move a settings folder chosen with --config-dir out yourself.')}</div>
      )}
      {status.phase === 'available' && (status.supported
        ? <Button variant="primary" onClick={() => invoke(() => mainApi.downloadUpdate())}>{t('Download update')}</Button>
        // Not an installer to run by hand either, while it would delete settings.
        : status.reason !== 'settings-in-installation-folder' && <Button onClick={() => { if (status.version != null) invoke(() => shell.openExternal(getReleaseUrl(status.version!))); }}>{t('Open release download')}</Button>)}
      {status.phase === 'ready' && !status.installOnQuit && <Button variant="primary" onClick={() => invoke(() => mainApi.approveUpdateInstall())}>{t('Install when I close ClipPress')}</Button>}
      {!['checking', 'downloading', 'ready', 'available'].includes(status.phase) && !['offline', 'development', 'multiple-instances'].includes(status.reason ?? '') && (showCheckButton || status.phase === 'error') && (
        <Button onClick={() => invoke(() => (status.supported && status.phase === 'error' && status.version != null ? mainApi.downloadUpdate() : mainApi.checkForUpdates()))}>{status.phase === 'error' ? t('Try again') : t('Check for updates')}</Button>
      )}
    </div>
  );
}
