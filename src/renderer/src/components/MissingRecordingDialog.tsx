import type { MouseEventHandler } from 'react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilm } from 'react-icons/fi';

import * as AlertDialog from './AlertDialog';
import * as Dialog from './Dialog';
import { DialogButton } from './Button';
import { useGenericDialogContext } from './GenericDialog';
import type { ShowGenericDialog } from './GenericDialog';
import { shortenFolderPath } from '../missingRecording';
import styles from './MissingRecordingDialog.module.css';

/**
 * "Can't find the recording" (#16): the edits being opened are for a recording that isn't where they say. Resolves
 * with whether the user wants to find it.
 */
export default function askToFindRecording(showGenericDialog: ShowGenericDialog, { name, folder, hasEdits }: {
  /** The recording's file name. */
  name: string,
  /** The folder it was in. */
  folder: string,
  /** Whether it has edits to open it with (a recent recording may have none). */
  hasEdits: boolean,
}) {
  return new Promise<boolean>((resolve) => {
    function MissingRecordingDialog() {
      const { t } = useTranslation();
      const { onOpenChange } = useGenericDialogContext();
      const findRef = useRef<HTMLButtonElement>(null);

      const handleFindClick = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
        e.preventDefault();
        resolve(true);
        onOpenChange(false);
      }, [onOpenChange]);

      // Start on the way forward rather than on Cancel.
      const handleOpenAutoFocus = useCallback((e: Event) => {
        if (findRef.current == null) return;
        e.preventDefault();
        findRef.current.focus({ focusVisible: false } as FocusOptions);
      }, []);

      return (
        <AlertDialog.Content className={styles['content']} onOpenAutoFocus={handleOpenAutoFocus}>
          <AlertDialog.Title>{t('Can\'t find the recording')}</AlertDialog.Title>
          <AlertDialog.Description>{hasEdits ? t('It may have been moved or renamed. Find it to open it with your edits.') : t('It may have been moved or renamed. Find it to open it.')}</AlertDialog.Description>

          <div className={styles['file']}>
            <span className={styles['icon']} aria-hidden><FiFilm /></span>
            <div className={styles['text']}>
              <span className={styles['name']} title={name}>{name}</span>
              <span className={styles['folder']} title={folder}>{t('Was in {{folder}}', { folder: shortenFolderPath(folder) })}</span>
            </div>
          </div>

          <Dialog.ButtonRow>
            <AlertDialog.Cancel asChild>
              <DialogButton>{t('Cancel')}</DialogButton>
            </AlertDialog.Cancel>
            <DialogButton primary ref={findRef} onClick={handleFindClick}>{t('Find it…')}</DialogButton>
          </Dialog.ButtonRow>
        </AlertDialog.Content>
      );
    }

    showGenericDialog({
      isAlert: true,
      render: () => <MissingRecordingDialog />,
      onClose: () => resolve(false),
    });
  });
}
