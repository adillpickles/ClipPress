import { useTranslation } from 'react-i18next';

import mainApi from '../mainApi';
import Button from './Button';
import { getReleaseUrl } from '../../../common/constants';
import type { UpdateStatus } from '../../../common/updates';
import getUpdateMessage from '../util/updateMessage';

const { shell } = window.require('electron');

/** Shown with an available update that can't be installed, because installing would delete the settings. */
export function SettingsInInstallFolderWarning({ status }: { status: UpdateStatus }) {
  const { t } = useTranslation();
  if (status.phase !== 'available' || status.reason !== 'settings-in-installation-folder') return null;
  return <div style={{ fontSize: '.8125rem', lineHeight: 1.45, color: 'var(--cp-text-muted)' }}>{t('Installing it would delete the settings that are still in the installation folder. ClipPress tries to move a settings file there out again the next time it starts; move a settings folder chosen with --config-dir out yourself.')}</div>;
}

/** The buttons for the current phase. `showCheckButton`: offer "Check for updates" when idle or up to date (Settings does, the floating notice doesn't, #62). */
export function UpdateActions({ status, showCheckButton = true, align = 'start' }: { status: UpdateStatus, showCheckButton?: boolean, align?: 'start' | 'end' }) {
  const { t } = useTranslation();
  const invoke = (action: () => Promise<unknown>) => { action().catch((error: unknown) => console.error('Update action failed', error)); };

  const download = status.phase === 'available' && (status.supported
    ? <Button variant="primary" onClick={() => invoke(() => mainApi.downloadUpdate())}>{t('Download update')}</Button>
    // Not an installer to run by hand either, while it would delete settings.
    : status.reason !== 'settings-in-installation-folder' && <Button onClick={() => { if (status.version != null) invoke(() => shell.openExternal(getReleaseUrl(status.version!))); }}>{t('Open release download')}</Button>);
  const approve = status.phase === 'ready' && !status.installOnQuit && <Button variant="primary" onClick={() => invoke(() => mainApi.approveUpdateInstall())}>{t('Install when I close ClipPress')}</Button>;
  const check = !['checking', 'downloading', 'ready', 'available'].includes(status.phase) && !['offline', 'development', 'multiple-instances'].includes(status.reason ?? '') && (showCheckButton || status.phase === 'error') && (
    <Button onClick={() => invoke(() => (status.supported && status.phase === 'error' && status.version != null ? mainApi.downloadUpdate() : mainApi.checkForUpdates()))}>{status.phase === 'error' ? t('Try again') : t('Check for updates')}</Button>
  );
  if (!download && !approve && !check) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: align === 'end' ? 'flex-end' : 'flex-start' }}>
      {download}
      {approve}
      {check}
    </div>
  );
}

/** The message, any warning and the buttons in one column: the floating update notice. */
export default function UpdateControls({ status, showCheckButton = true }: { status: UpdateStatus | undefined, showCheckButton?: boolean }) {
  const { t } = useTranslation();
  if (status == null) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.5rem' }}>
      <div role="status" aria-live="polite" style={{ fontSize: '.875rem', lineHeight: 1.45 }}>{getUpdateMessage(status, t)}</div>
      <SettingsInInstallFolderWarning status={status} />
      <UpdateActions status={status} showCheckButton={showCheckButton} />
    </div>
  );
}
