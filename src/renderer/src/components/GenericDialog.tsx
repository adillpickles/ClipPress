import type { MouseEventHandler, ReactNode } from 'react';
import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';
import { useReducedMotionConfig } from 'motion/react';

import * as Dialog from './Dialog';
import * as AlertDialog from './AlertDialog';
import { DialogButton } from './Button';
import { showItemInFolder } from '../util';
import type { CleanupChoice, CleanupChoicesType } from '../dialogs';
import Checkbox from './Checkbox';
import ExportResult from './ExportResult';
import { morphFromWorkingCard } from './Working';
import HelpTip from './HelpTip';
import styles from './GenericDialog.module.css';


export interface GenericDialogParams {
  isAlert?: boolean;
  /**
   * Marks the dialogs that merely report a finished export. They carry no pending
   * decision, so opening new media is allowed to dismiss them; anything else on screen is
   * waiting for an answer and must not be closed behind the user's back.
   */
  kind?: 'exportResult';
  render: () => React.ReactNode;
  onClose?: () => void;
}

export interface SizeLimitedFinishedSummary {
  requestedLimitLabel: string,
  createdCount: number,
  skippedCount: number,
  largestCreatedSizeLabel?: string | undefined,
  singleCreatedSizeLabel?: string | undefined,
}

/** What the export after-steps add to every result: the copy already running, and the shelf's next clip. */
interface ExportResultExtras {
  autoCopied?: Promise<boolean> | undefined,
  nextClipName?: string | undefined,
  /** The merged file, when the export made one: it's the one a click or Ctrl+C copies. */
  mergedPath?: string | undefined,
}

export type ShowGenericDialog = (dialog: GenericDialogParams) => void;

interface GenericDialogContextValue {
  onOpenChange: (open: boolean) => void,
}

const GenericDialogContext = React.createContext<GenericDialogContextValue | undefined>(undefined);

export function useGenericDialogContext() {
  const context = useContext(GenericDialogContext);
  invariant(context);
  return context;
}

export default function GenericDialog({ dialog, onOpenChange }: {
  dialog: GenericDialogParams | undefined,
  onOpenChange: (open: boolean) => void,
}) {
  const context = useMemo(() => ({ onOpenChange }), [onOpenChange]);

  return (
    <>
      {/* Non-alert dialog */ }
      <Dialog.Root open={dialog != null && !dialog.isAlert} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay />

          <GenericDialogContext.Provider value={context}>
            {dialog != null && !dialog.isAlert && dialog.render()}
          </GenericDialogContext.Provider>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Alert dialog */ }
      <AlertDialog.Root open={dialog != null && !!dialog.isAlert} onOpenChange={onOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay />

          <GenericDialogContext.Provider value={context}>
            {dialog != null && dialog.isAlert && dialog.render()}
          </GenericDialogContext.Provider>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

export function useDialog() {
  const { t } = useTranslation();
  const [genericDialog, setGenericDialog] = useState<GenericDialogParams | undefined>();
  const genericDialogRef = useRef(genericDialog);

  const showGenericDialog = useCallback<ShowGenericDialog>((dialog) => {
    if (genericDialogRef.current) {
      throw new Error('A dialog is already open, cannot open another one');
    }
    genericDialogRef.current = dialog;
    setGenericDialog(dialog);
  }, []);

  const closeGenericDialog = useCallback(() => {
    genericDialogRef.current?.onClose?.();
    genericDialogRef.current = undefined;
    setGenericDialog(undefined);
  }, []);

  const confirmDialog = useCallback(({ title = t('Please confirm'), description, confirmButtonText = t('Confirm'), cancelButtonText = t('Cancel'), focusConfirm = false }: {
    title?: ReactNode,
    description?: string,
    confirmButtonText?: string,
    cancelButtonText?: string,
    focusConfirm?: boolean,
  }) => new Promise<boolean>((resolve) => {
    function ConfirmDialog() {
      const { onOpenChange } = useGenericDialogContext();
      const confirmRef = useRef<HTMLButtonElement>(null);

      const handleConfirmClick = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
        e.preventDefault();
        resolve(true);
        onOpenChange(false);
      }, [onOpenChange]);

      const handleOpenAutoFocus = useCallback((e: Event) => {
        if (focusConfirm && confirmRef.current) {
          e.preventDefault();
          confirmRef.current.focus();
        }
      }, []);

      return (
        <AlertDialog.Content className={AlertDialog.messageClassName} aria-describedby={description} onOpenAutoFocus={handleOpenAutoFocus}>
          <AlertDialog.Title>{title}</AlertDialog.Title>

          {description && <AlertDialog.Description>{description}</AlertDialog.Description>}

          <Dialog.ButtonRow center>
            <AlertDialog.Cancel asChild>
              <DialogButton>{cancelButtonText}</DialogButton>
            </AlertDialog.Cancel>

            <DialogButton primary onClick={handleConfirmClick} ref={confirmRef}>{confirmButtonText}</DialogButton>
          </Dialog.ButtonRow>
        </AlertDialog.Content>
      );
    }

    showGenericDialog({
      isAlert: true,
      render: () => <ConfirmDialog />,
      onClose: () => resolve(false),
    });
  }), [showGenericDialog, t]);

  /**
   * Dismisses a finished-export dialog, if that is what is currently open.
   *
   * Opening new media is an explicit move on to the next thing, so the previous result
   * should not stay parked over it. Deliberately narrow: a dialog that is waiting for an
   * answer (cleanup choices, a confirmation) keeps its turn.
   */
  const closeExportResultDialog = useCallback(() => {
    if (genericDialogRef.current?.kind !== 'exportResult') return;
    closeGenericDialog();
  }, [closeGenericDialog]);

  const openExportFinishedDialog = useCallback(async ({ filePath, children, width, title }: {
    filePath: string,
    children: ReactNode,
    width?: string,
    title?: ReactNode,
  }) => {
    const response = await new Promise<boolean>((resolve) => {
      function ExportFinishedDialog() {
        const { onOpenChange } = useGenericDialogContext();
        const showRef = useRef<HTMLButtonElement>(null);

        // Start on the main action rather than on the first focusable thing (the Details toggle).
        const handleOpenAutoFocus = useCallback((e: Event) => {
          if (showRef.current == null) return;
          e.preventDefault();
          showRef.current.focus({ focusVisible: false } as FocusOptions);
        }, []);

        const handleConfirmClick = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
          e.preventDefault();
          resolve(true);
          onOpenChange(false);
        }, [onOpenChange]);

        return (
          <Dialog.Content aria-describedby={undefined} style={{ width }} onOpenAutoFocus={handleOpenAutoFocus}>
            <Dialog.Title>{title ?? t('Success!')}</Dialog.Title>

            {children}

            <Dialog.ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Close')}</DialogButton>
              </Dialog.Close>

              <DialogButton primary ref={showRef} onClick={handleConfirmClick}>{t('Show in folder')}</DialogButton>
            </Dialog.ButtonRow>
          </Dialog.Content>
        );
      }

      showGenericDialog({
        kind: 'exportResult',
        render: () => <ExportFinishedDialog />,
        onClose: () => resolve(false),
      });
    });

    if (response) {
      showItemInFolder(filePath);
    }
  }, [showGenericDialog, t]);

  /**
   * After an export: the result (ExportResult, where a file's name shows it in its folder), then Close, and when the
   * shelf has another clip to do, Next clip as the main button. Resolves with 'next' when that was chosen.
   */
  const openExportResultDialog = useCallback(({ title, files, copyFiles, warnings, highlight, details, autoCopied, nextClipName }: {
    title: string,
    files: string[],
    copyFiles: string[],
    warnings: string[],
    highlight?: string | undefined,
    details?: ReactNode,
    autoCopied?: Promise<boolean> | undefined,
    nextClipName?: string | undefined,
  }) => new Promise<'next' | undefined>((resolve) => {
    function ExportResultDialog() {
      const { onOpenChange } = useGenericDialogContext();
      const mainRef = useRef<HTMLButtonElement>(null);
      const reduceMotion = useReducedMotionConfig() === true;

      // It grows out of the export's progress card, once, as it first mounts.
      const morphed = useRef(false);
      const contentRef = useCallback((el: HTMLDivElement | null) => {
        if (el == null || morphed.current) return;
        morphed.current = true;
        morphFromWorkingCard(el, { reduceMotion });
      }, [reduceMotion]);

      // Start on the main button rather than on the first focusable thing (the picture).
      const handleOpenAutoFocus = useCallback((e: Event) => {
        if (mainRef.current == null) return;
        e.preventDefault();
        mainRef.current.focus({ focusVisible: false } as FocusOptions);
      }, []);

      const onNextClick = useCallback(() => {
        resolve('next');
        onOpenChange(false);
      }, [onOpenChange]);

      return (
        <Dialog.Content ref={contentRef} aria-describedby={undefined} className={files.length > 1 ? styles['exportResultWide'] : styles['exportResult']} onOpenAutoFocus={handleOpenAutoFocus}>
          <Dialog.Title className={styles['centredTitle']}>{title}</Dialog.Title>
          <ExportResult
            files={files}
            copyFiles={copyFiles}
            warnings={warnings}
            highlight={highlight}
            details={details}
            autoCopied={autoCopied}
            actions={(
              <>
                <Dialog.Close asChild>
                  <DialogButton primary={nextClipName == null} ref={nextClipName == null ? mainRef : undefined}>{t('Close')}</DialogButton>
                </Dialog.Close>
                {nextClipName != null && (
                  <DialogButton primary ref={mainRef} onClick={onNextClick} title={nextClipName}>{t('Next clip')}</DialogButton>
                )}
              </>
            )}
          />
          <Dialog.CloseButton />
        </Dialog.Content>
      );
    }

    showGenericDialog({
      kind: 'exportResult',
      render: () => <ExportResultDialog />,
      onClose: () => resolve(undefined),
    });
  }), [showGenericDialog, t]);

  const openCutFinishedDialog = useCallback(({ filePaths, warnings, notices, highlight, showAdvice = true, ...extras }: {
    /** Every file the export made. */
    filePaths: string[],
    warnings: string[],
    notices: string[],
    highlight?: string | undefined,
    /** LosslessCut's standing advice (test the output, the Help menu), for advanced mode. */
    showAdvice?: boolean | undefined,
  } & ExportResultExtras) => openExportResultDialog({
    title: filePaths.length === 0 ? t('Nothing was exported') : t('Exported'),
    files: filePaths,
    copyFiles: extras.mergedPath != null ? [extras.mergedPath] : filePaths,
    warnings,
    highlight,
    autoCopied: extras.autoCopied,
    nextClipName: extras.nextClipName,
    details: (notices.length > 0 || showAdvice) ? (
      <ul className={styles['detailsList']}>
        {notices.map((notice) => <li key={notice}>{notice}</li>)}
        {showAdvice && (
          <>
            {/* https://github.com/mifi/lossless-cut/issues/2048 */}
            <li>{t('Please test the output file in your desired player/editor before you delete the source file.')}</li>
            <li>{t('If output does not look right, see the Help menu.')}</li>
          </>
        )}
      </ul>
    ) : undefined,
  }), [openExportResultDialog, t]);

  const openSizeLimitedFinishedDialog = useCallback(({ filePaths, warnings, notices, summary, highlight, ...extras }: {
    /** Every file the export made. */
    filePaths: string[],
    warnings: string[],
    notices: string[],
    summary: SizeLimitedFinishedSummary,
    highlight?: string | undefined,
  } & ExportResultExtras) => openExportResultDialog({
    title: summary.createdCount > 0 ? t('Exported') : t('Nothing was exported'),
    files: filePaths,
    copyFiles: extras.mergedPath != null ? [extras.mergedPath] : filePaths,
    warnings,
    highlight,
    autoCopied: extras.autoCopied,
    nextClipName: extras.nextClipName,
    // The limit it was made for, with whatever else is worth knowing, kept out of the way.
    details: (
      <ul className={styles['detailsList']}>
        <li>{t('Size limit: {{target}}', { target: summary.requestedLimitLabel })}</li>
        {notices.map((notice) => <li key={notice}>{notice}</li>)}
      </ul>
    ),
  }), [openExportResultDialog, t]);

  const openConcatFinishedDialog = useCallback(({ filePath, warnings, notices, created = true, showAdvice = true }: {
    filePath: string,
    warnings: string[],
    notices: string[],
    created?: boolean | undefined,
    showAdvice?: boolean | undefined,
  }) => openExportResultDialog({
    title: created ? t('Merged') : t('Nothing was exported'),
    files: created ? [filePath] : [],
    copyFiles: created ? [filePath] : [],
    warnings,
    details: (notices.length > 0 || showAdvice) ? (
      <ul className={styles['detailsList']}>
        {notices.map((notice) => <li key={notice}>{notice}</li>)}
        {showAdvice && (
          <>
            <li>{t('Please test the output files in your desired player/editor before you delete the source files.')}</li>
            <li>{t('If output does not look right, see the Help menu.')}</li>
          </>
        )}
      </ul>
    ) : undefined,
  }), [openExportResultDialog, t]);

  /**
   * The clean-up choices. Opened to clean up (Clean up, or after an export) its button acts at once; opened from
   * Settings (`saveOnly`) it only stores what should happen later, so the button just saves.
   */
  async function openCleanupFilesDialog(cleanupChoicesInitial: CleanupChoicesType, { saveOnly = false }: { saveOnly?: boolean | undefined } = {}) {
    return new Promise<CleanupChoicesType | undefined>((resolve) => {
      function CleanupChoices() {
        const [choices, setChoices] = useState(cleanupChoicesInitial);

        const getVal = (key: CleanupChoice) => !!choices[key];

        const onChange = (key: CleanupChoice, val: boolean | string) => setChoices((oldChoices) => {
          const newChoices = { ...oldChoices, [key]: Boolean(val) };
          if ((newChoices.trashSourceFile || newChoices.trashTmpFiles) && !newChoices.closeFile) {
            newChoices.closeFile = true;
          }
          return newChoices;
        });

        const trashTmpFiles = getVal('trashTmpFiles');
        const trashSourceFile = getVal('trashSourceFile');
        const trashProjectFile = getVal('trashProjectFile');
        const deleteIfTrashFails = getVal('deleteIfTrashFails');
        const closeFile = getVal('closeFile');
        const askForCleanup = getVal('askForCleanup');
        const cleanupAfterExport = getVal('cleanupAfterExport');

        const { onOpenChange } = useGenericDialogContext();

        const handleOkClick = useCallback(() => {
          resolve(choices);
          onOpenChange(false);
        }, [choices, onOpenChange]);

        // for convenience, focus confirm button when opening dialog
        // they probably just want to use current options
        // https://github.com/mifi/lossless-cut/issues/2622
        const confirmRef = useRef<HTMLButtonElement>(null);

        const handleOpenAutoFocus = useCallback((e: Event) => {
          if (confirmRef.current) {
            e.preventDefault();
            confirmRef.current.focus();
          }
        }, []);

        return (
          <Dialog.Content aria-describedby={undefined} style={{ width: '32rem' }} onOpenAutoFocus={handleOpenAutoFocus}>
            <Dialog.Title>
              {t('Clean up files')}
            </Dialog.Title>

            <Dialog.Description>
              {saveOnly
                ? t('What happens after an export, or when you choose Clean up.')
                : t('Choose what to clean up now. ClipPress keeps these choices for next time.')}
            </Dialog.Description>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', marginBottom: '1.25rem' }}>
              <div className={styles['choiceRow']}>
                <Checkbox label={t('Close the recording')} checked={closeFile} disabled={trashSourceFile || trashTmpFiles} onCheckedChange={(checked) => onChange('closeFile', checked)} />
                {(trashSourceFile || trashTmpFiles) && <HelpTip>{t('The recording has to be closed before its files can be moved.')}</HelpTip>}
              </div>
              <Checkbox label={t('Move temporary preview files to the Recycle Bin')} checked={trashTmpFiles} onCheckedChange={(checked) => onChange('trashTmpFiles', checked)} />
              <Checkbox label={t('Move the original recording to the Recycle Bin')} checked={trashSourceFile} onCheckedChange={(checked) => onChange('trashSourceFile', checked)} />
              <Checkbox label={t('Move the project file (.llc) to the Recycle Bin')} checked={trashProjectFile} onCheckedChange={(checked) => onChange('trashProjectFile', checked)} />
              <Checkbox label={t('Delete temporary and project files permanently if the Recycle Bin can\'t take them')} disabled={!(trashTmpFiles || trashProjectFile || trashSourceFile)} checked={deleteIfTrashFails} onCheckedChange={(checked) => onChange('deleteIfTrashFails', checked)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', paddingTop: '1rem', borderTop: '1px solid var(--cp-line)' }}>
              <Checkbox label={t('Do this automatically after each export')} checked={cleanupAfterExport} onCheckedChange={(checked) => onChange('cleanupAfterExport', checked)} />
              <div className={styles['choiceRow']}>
                <Checkbox label={t('Ask before cleaning up')} checked={askForCleanup} onCheckedChange={(checked) => onChange('askForCleanup', checked)} />
                <HelpTip>{t('When this is off, Clean up and the clean-up after each export use these choices without showing this window.')}</HelpTip>
              </div>
            </div>

            <Dialog.ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Cancel')}</DialogButton>
              </Dialog.Close>

              <DialogButton ref={confirmRef} onClick={handleOkClick} primary>{saveOnly ? t('Save') : t('Clean up now')}</DialogButton>
            </Dialog.ButtonRow>
          </Dialog.Content>
        );
      }

      showGenericDialog({
        render: () => <CleanupChoices />,
        onClose: () => resolve(undefined),
      });
    });
  }

  return {
    genericDialog,
    closeGenericDialog,
    closeExportResultDialog,
    showGenericDialog,
    confirmDialog,
    openExportFinishedDialog,
    openCutFinishedDialog,
    openSizeLimitedFinishedDialog,
    openConcatFinishedDialog,
    openCleanupFilesDialog,
  };
}

export type ConfirmDialog = ReturnType<typeof useDialog>['confirmDialog'];
