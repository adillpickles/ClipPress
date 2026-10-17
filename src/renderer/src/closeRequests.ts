import type { IpcRendererEvent } from 'electron';
import i18n from 'i18next';

import type { CloseDecision, UserCloseChoice } from './saveBeforeClose';

const { ipcRenderer } = window.require('electron');
const remote = window.require('@electron/remote');

export interface CloseRequestHandlers {
  /** Gets ready for the window to close (saving the project), and says whether it may. */
  onCloseRequest: () => Promise<CloseDecision>,
  /** Saves a waiting change at once, because the app may be about to end without closing normally. */
  onSaveNow: () => void,
  /** Whether anything is not saved yet, such as a change made after `onCloseRequest` saved everything. */
  hasUnsavedChanges: () => boolean,
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
function askAfterUnexpectedError(err: unknown): UserCloseChoice {
  const response = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'error',
    buttons: [i18n.t('Quit without saving'), i18n.t('Cancel')],
    defaultId: 1,
    cancelId: 1,
    title: i18n.t('Your latest changes could not be saved'),
    message: i18n.t('ClipPress could not make sure that your project is saved.'),
    detail: err instanceof Error ? err.message : String(err),
  });
  return response === 0 ? 'discard' : 'cancel';
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

  // The window only goes away (or the page reloads) once the page lets it unload. The editor can
  // still accept a change after it answered 'close' and before the window is gone: refusing then
  // makes the main process ask again, which saves that change too (see CloseGuard). When the user
  // chose to close without saving, the main process unloads the page regardless.
  window.addEventListener('beforeunload', (event) => {
    if (handlers == null || !handlers.hasUnsavedChanges()) return;
    console.warn('Not unloading the page yet: the project has unsaved changes');
    handlers.onSaveNow();
    event.preventDefault();
    // Electron cancels the unload reliably only with returnValue set.
    // eslint-disable-next-line no-param-reassign
    event.returnValue = '';
  });
}
