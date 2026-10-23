import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import useUpdateStatus from '../hooks/useUpdateStatus';
import Switch from './Switch';
import Select from './Select';
import { SettingsInInstallFolderWarning, UpdateActions } from './UpdateControls';
import getUpdateMessage from '../util/updateMessage';
import SettingRow from './SettingRow';
import type { UpdateMode } from '../../../common/updates';

export default function UpdateSettings() {
  const { t } = useTranslation();
  const { enableUpdateCheck, setEnableUpdateCheck, updateMode, setUpdateMode } = useUserSettings();
  const status = useUpdateStatus();
  const modeId = useId();

  let description = t('This copy can check for new versions and open the download page.');
  let details: string | undefined = t('Automatic installation is available in the Windows installer. Portable copies can check for updates and open the release download.');
  if (status?.supported) {
    description = t('Downloads in the background and installs when you close ClipPress.');
    details = t('Updates download while you work and install only when you close ClipPress. No forced restart.');
  }
  if (status?.reason === 'offline') {
    description = t('Networking is disabled for this session.');
    details = undefined;
  }
  if (status?.reason === 'multiple-instances') {
    description = t('Automatic updates require single-instance mode.');
    details = undefined;
  }
  if (status?.reason === 'settings-in-installation-folder') {
    description = t('Paused while settings are kept in the installation folder.');
    details = t('Updates are not installed while settings are kept in the installation folder, because installing an update deletes that folder. ClipPress moves a settings file it finds there out when it starts; move a settings folder chosen with --config-dir out yourself.');
  }

  return (
    <>
      <SettingRow label={t('Check for updates automatically')} value={description} details={details}>
        <Switch checked={enableUpdateCheck} onCheckedChange={setEnableUpdateCheck} disabled={status?.reason === 'offline'} aria-label={t('Check for updates automatically')} />
      </SettingRow>

      {status?.supported && (
        <SettingRow label={t('When an update is found')} controlId={modeId}>
          <Select id={modeId} value={updateMode} onChange={(event) => setUpdateMode(event.target.value as UpdateMode)} disabled={!enableUpdateCheck}>
            <option value="automatic">{t('Download it (recommended)')}</option>
            <option value="ask">{t('Ask me first')}</option>
          </Select>
        </SettingRow>
      )}

      {/* Offline, the row above already says why nothing is checked. The message is the row's live value, so
          only the buttons sit on the right like every other row's control. */}
      {status != null && status.reason !== 'offline' && (
        <SettingRow
          label={t('Status')}
          value={(
            <>
              <span role="status" aria-live="polite">{getUpdateMessage(status, t, enableUpdateCheck)}</span>
              <SettingsInInstallFolderWarning status={status} />
            </>
          )}
        >
          <UpdateActions status={status} align="end" />
        </SettingRow>
      )}
    </>
  );
}
