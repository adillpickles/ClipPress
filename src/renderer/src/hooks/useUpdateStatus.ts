import { useEffect, useState } from 'react';
import type { IpcRendererEvent } from 'electron';

import mainApi from '../mainApi';
import type { UpdateStatus } from '../../../common/updates';

const { ipcRenderer } = window.require('electron');

export default function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>();
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const listener = (_event: IpcRendererEvent, next: UpdateStatus) => { receivedEvent = true; setStatus(next); };
    ipcRenderer.on('update-status', listener);
    mainApi.getUpdateStatus().then((next) => {
      if (active && !receivedEvent) setStatus(next);
    }).catch((error: unknown) => console.error('Failed to read update status', error));
    return () => { active = false; ipcRenderer.removeListener('update-status', listener); };
  }, []);
  return status;
}
