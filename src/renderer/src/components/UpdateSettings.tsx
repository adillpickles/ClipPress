import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import useUpdateStatus from '../hooks/useUpdateStatus';
import Switch from './Switch';
import Select from './Select';
import UpdateControls from './UpdateControls';
import type { UpdateMode } from '../../../common/updates';

export default function UpdateSettings() {
  const { t } = useTranslation();
  const { enableUpdateCheck, setEnableUpdateCheck, updateMode, setUpdateMode } = useUserSettings();
  const status = useUpdateStatus();
  let explanation = t('Automatic installation is available in the Windows installer. Portable copies can check for updates and open the release download.');
  if (status?.supported) explanation = t('Updates download while you work and install only when you close ClipPress. No forced restart.');
  if (status?.reason === 'offline') explanation = t('Networking is disabled for this session.');
  if (status?.reason === 'multiple-instances') explanation = t('Automatic updates require single-instance mode.');
  return (
    <tr>
      <td>
        {t('App updates')}
        <div style={{ opacity: 0.75, fontSize: '.9em', marginTop: 6, maxWidth: 440 }}>
          {explanation}
        </div>
      </td>
      <td>
        <label htmlFor="check-automatically" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Switch id="check-automatically" checked={enableUpdateCheck} onCheckedChange={setEnableUpdateCheck} disabled={status?.reason === 'offline'} />
          {t('Check automatically')}
        </label>
        {status?.supported && (
        <Select value={updateMode} onChange={(event) => setUpdateMode(event.target.value as UpdateMode)} disabled={!enableUpdateCheck} style={{ padding: '6px 10px', marginBottom: 8 }} aria-label={t('Update mode')}>
          <option value="automatic">{t('Automatic (recommended)')}</option>
          <option value="ask">{t('Ask before downloading')}</option>
        </Select>
        )}
        <UpdateControls status={status} />
      </td>
    </tr>
  );
}
