import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useUpdateStatus from '../hooks/useUpdateStatus';
import { isStoreBuild } from '../util';
import UpdateControls from './UpdateControls';

const { ipcRenderer } = window.require('electron');

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
  if (!visible || isStoreBuild || status == null || dismissedPhase === phaseKey || status.phase === 'idle'
    || (!status.manual && !['available', 'ready'].includes(status.phase))) return null;
  return (
    <div aria-label={t('App update')} style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 100, width: 420, maxWidth: 'calc(100vw - 40px)', padding: '16px 40px 16px 16px', boxSizing: 'border-box', borderRadius: 12, border: '1px solid var(--blue-8)', background: 'var(--gray-2)', color: 'var(--gray-12)', boxShadow: '0 5px 24px #0006' }}>
      <button type="button" aria-label={t('Dismiss update notice')} onClick={() => setDismissedPhase(phaseKey)} style={{ position: 'absolute', right: 10, top: 8, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 20 }}>×</button>
      <UpdateControls status={status} />
    </div>
  );
}
