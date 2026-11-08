import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle } from 'react-icons/fa';

import * as Dialog from './Dialog';
import { DialogButton } from './Button';
import { warningColor } from '../colors';
import useLastDefined from '../hooks/useLastDefined';


export interface GenericError {
  err?: unknown | undefined;
  title?: string | undefined;
}

/**
 * We need to be able to show errors from anywhere in the app, also while dialogs are open. Also originating from keyboard actions
 */
export default function ErrorDialog({ error, onOpenChange }: {
  error: GenericError | undefined,
  onOpenChange: (open: boolean) => void,
}) {
  const { t } = useTranslation();
  // The message stays while the dialog fades out.
  const shownError = useLastDefined(error);

  return (
    <Dialog.Root open={error != null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-describedby={t('An error has occurred.')} style={{ width: '40em' }}>
          {shownError != null && (
            <>
              <Dialog.Title>
                <FaExclamationTriangle style={{ color: warningColor, marginRight: '.5em', verticalAlign: 'middle' }} />
                {shownError.title ?? t('Error')}
              </Dialog.Title>

              <div style={{ overflow: 'auto', maxHeight: '50vh', whiteSpace: 'pre-wrap' }}>
                {shownError.err instanceof Error ? shownError.err.message : String(shownError.err)}
              </div>
            </>
          )}

          <Dialog.ButtonRow>
            <Dialog.Close asChild>
              <DialogButton primary>{t('OK')}</DialogButton>
            </Dialog.Close>
          </Dialog.ButtonRow>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
