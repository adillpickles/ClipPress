import type { IpcRendererEvent } from 'electron';
import i18n from 'i18next';

import type { CloseDecision } from './saveBeforeClose';

const { ipcRenderer } = window.require('electron');
const remote = window.require('@electron/remote');

export interface CloseRequestHandlers {
  /** Gets ready for the window to close (saving the project), and says whether it may. */
  onCloseRequest: () => Promise<CloseDecision>,
  /** Saves a waiting change at once, because the app may be about to end without closing normally. */
  onSaveNow: () => void,
}

let handlers: CloseRequestHandlers | undefined;

/**
 * Registers how the editor gets ready for closing. Returns a function that unregisters it.
 * Without handlers, for example while an error screen replaces the editor, closing goes ahead.
 */
export function setCloseRequestHandlers(next: CloseRequestHandlers) {
  handlers = next;
  return () => {
    if (handlers === next) handlers = undefined;
  };
}

/** A last resort when getting ready failed unexpectedly: the user decides, through a native dialog. */
function askAfterUnexpectedError(err: unknown): CloseDecision {
  const response = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'error',
    buttons: [i18n.t('Quit without saving'), i18n.t('Cancel')],
    defaultId: 1,
    cancelId: 1,
    title: i18n.t('Your latest changes could not be saved'),
    message: i18n.t('ClipPress could not make sure that your project is saved.'),
    detail: err instanceof Error ? err.message : String(err),
  });
  return response === 0 ? 'close' : 'cancel';
}

/**
 * Answers the main process, which asks before every close of the window (`close-requested`):
 * first that the request arrived, then whether to close.
 */
export function listenForCloseRequests() {
  ipcRenderer.on('close-requested', async (_event: IpcRendererEvent, id: number) => {
    ipcRenderer.send('close-request-ack', id);
    let decision: CloseDecision = 'close';
    try {
      if (handlers != null) decision = await handlers.onCloseRequest();
    } catch (err) {
      console.error('Failed to get ready to close', err);
      decision = askAfterUnexpectedError(err);
    }
    ipcRenderer.send('close-request-decision', id, decision);
  });

  ipcRenderer.on('save-project-now', () => handlers?.onSaveNow());
}
