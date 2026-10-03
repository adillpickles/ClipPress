import { useTranslation } from 'react-i18next';

import mainApi from '../mainApi';
import Button from './Button';
import { getReleaseUrl } from '../../../common/constants';
import type { UpdateStatus } from '../../../common/updates';

const { shell } = window.require('electron');

export default function UpdateControls({ status }: { status: UpdateStatus | undefined }) {
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
    <div>
      <div role="status" aria-live="polite" style={{ fontSize: '.9em', marginBottom: 6 }}>{message}</div>
      {status.phase === 'available' && (status.supported
        ? <Button onClick={() => invoke(() => mainApi.downloadUpdate())}>{t('Download update')}</Button>
        : <Button onClick={() => { if (status.version != null) invoke(() => shell.openExternal(getReleaseUrl(status.version!))); }}>{t('Open release download')}</Button>)}
      {status.phase === 'ready' && !status.installOnQuit && <Button onClick={() => invoke(() => mainApi.approveUpdateInstall())}>{t('Install when I close ClipPress')}</Button>}
      {!['checking', 'downloading', 'ready', 'available'].includes(status.phase) && !['offline', 'development', 'multiple-instances'].includes(status.reason ?? '') && (
        <Button onClick={() => invoke(() => (status.supported && status.phase === 'error' && status.version != null ? mainApi.downloadUpdate() : mainApi.checkForUpdates()))}>{status.phase === 'error' ? t('Try again') : t('Check for updates')}</Button>
      )}
    </div>
  );
}
