import type { MouseEventHandler, ReactNode } from 'react';
import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';

import * as Dialog from './Dialog';
import * as AlertDialog from './AlertDialog';
import { DialogButton } from './Button';
import { showItemInFolder } from '../util';
import type { CleanupChoice, CleanupChoicesType } from '../dialogs';
import { ListItem, Notices, OutputIncorrectSeeHelpMenu, UnorderedList, Warnings } from '../dialogs';
import Checkbox from './Checkbox';
import { saveColor, warningColor } from '../colors';


export interface GenericDialogParams {
  isAlert?: boolean;
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

/**
 * Secondary export information, collapsed by default.
 *
 * A successful export should read as one line and a file name. The codec strategy, the
 * retry notes and the "we kept one video and one audio track" explanations are all true
 * and worth keeping, but they are reference material, not the result. Warnings still
 * announce themselves in the headline and open this section automatically, so nothing
 * that needs acting on is hidden.
 */
function ExportDetails({ items, defaultOpen, label }: {
  items: ReactNode,
  defaultOpen: boolean,
  label: string,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginTop: '1em' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          opacity: 0.75,
          font: 'inherit',
          fontSize: '.85em',
        }}
      >
        {open ? '▾' : '▸'}
        {' '}
        {label}
      </button>

      {open && <UnorderedList>{items}</UnorderedList>}
    </div>
  );
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
        <AlertDialog.Content aria-describedby={description} style={{ width: '40vw' }} onOpenAutoFocus={handleOpenAutoFocus}>
          <AlertDialog.Title>{title}</AlertDialog.Title>

          {description && <AlertDialog.Description>{description}</AlertDialog.Description>}

          <Dialog.ButtonRow>
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

  const openExportFinishedDialog = useCallback(async ({ filePath, children, width, title }: {
    filePath: string,
    children: ReactNode,
    width?: string,
    title?: ReactNode,
  }) => {
    const response = await new Promise<boolean>((resolve) => {
      function ExportFinishedDialog() {
        const { onOpenChange } = useGenericDialogContext();

        const handleConfirmClick = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
          e.preventDefault();
          resolve(true);
          onOpenChange(false);
        }, [onOpenChange]);

        return (
          <Dialog.Content aria-describedby={undefined} style={{ width }}>
            <Dialog.Title>{title ?? t('Success!')}</Dialog.Title>

            {children}

            <Dialog.ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Close')}</DialogButton>
              </Dialog.Close>

              <DialogButton primary onClick={handleConfirmClick}>{t('Show')}</DialogButton>
            </Dialog.ButtonRow>
          </Dialog.Content>
        );
      }

      showGenericDialog({
        render: () => <ExportFinishedDialog />,
        onClose: () => resolve(false),
      });
    });

    if (response) {
      showItemInFolder(filePath);
    }
  }, [showGenericDialog, t]);

  const openCutFinishedDialog = useCallback(async ({ filePath, warnings, notices }: { filePath: string, warnings: string[], notices: string[] }) => {
    const hasWarnings = warnings.length > 0;

    // https://github.com/mifi/lossless-cut/issues/2048
    await openExportFinishedDialog({
      filePath,
      width: '60em',
      children: (
        <UnorderedList>
          <ListItem icon={<FaCheckCircle />} iconColor={hasWarnings ? warningColor : saveColor} style={{ fontWeight: 'bold' }}>{hasWarnings ? t('Export finished with warning(s)', { count: warnings.length }) : t('Export is done!')}</ListItem>
          <Warnings warnings={warnings} />
          <ListItem icon={<FaInfoCircle />}>{t('Please test the output file in your desired player/editor before you delete the source file.')}</ListItem>
          <OutputIncorrectSeeHelpMenu />
          <Notices notices={notices} />
        </UnorderedList>
      ),
    });
  }, [openExportFinishedDialog, t]);

  const openSizeLimitedFinishedDialog = useCallback(async ({ filePath, warnings, notices, summary }: {
    filePath: string,
    warnings: string[],
    notices: string[],
    summary: SizeLimitedFinishedSummary,
  }) => {
    const hasWarnings = warnings.length > 0;
    const wroteNewFiles = summary.createdCount > 0;
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

    const sizeText = (() => {
      if (!wroteNewFiles) return undefined;

      const actual = summary.createdCount === 1
        ? summary.singleCreatedSizeLabel
        : summary.largestCreatedSizeLabel;
      if (actual == null) return t('Limit {{target}}', { target: summary.requestedLimitLabel });

      return summary.createdCount === 1
        ? t('{{actual}} of {{target}} limit', { actual, target: summary.requestedLimitLabel })
        : t('{{count}} files, largest {{actual}} of {{target}} limit', {
          count: summary.createdCount,
          actual,
          target: summary.requestedLimitLabel,
        });
    })();

    const detailItems = (warnings.length > 0 || notices.length > 0) && (
      <>
        <Warnings warnings={warnings} />
        <Notices notices={notices} />
      </>
    );

    await openExportFinishedDialog({
      filePath,
      title: wroteNewFiles
        ? (hasWarnings ? t('Export finished with warnings') : t('Export successful'))
        : t('Nothing was exported'),
      width: '34em',
      children: (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5em' }}>
            <span style={{ color: hasWarnings ? warningColor : saveColor, marginTop: '.15em' }}>
              {hasWarnings ? <FaExclamationTriangle /> : <FaCheckCircle />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 'bold', wordBreak: 'break-word' }}>
                {wroteNewFiles ? fileName : t('No new files were written')}
              </div>
              {sizeText != null && (
                <div style={{ opacity: 0.75, fontSize: '.9em', marginTop: '.15em' }}>{sizeText}</div>
              )}
            </div>
          </div>

          {detailItems && (
            <ExportDetails
              items={detailItems}
              // A warning is something to act on, so it is shown straight away.
              defaultOpen={hasWarnings}
              label={hasWarnings
                ? t('Details ({{count}} warnings)', { count: warnings.length })
                : t('Details')}
            />
          )}
        </div>
      ),
    });
  }, [openExportFinishedDialog, t]);

  const openConcatFinishedDialog = useCallback(async ({ filePath, warnings, notices }: { filePath: string, warnings: string[], notices: string[] }) => {
    const hasWarnings = warnings.length > 0;

    await openExportFinishedDialog({
      filePath,
      width: '60em',
      children: (
        <UnorderedList>
          <ListItem icon={<FaCheckCircle />} iconColor={hasWarnings ? 'warning' : 'success'} style={{ fontWeight: 'bold' }}>{hasWarnings ? t('Files merged with warning(s)', { count: warnings.length }) : t('Files merged!')}</ListItem>
          <Warnings warnings={warnings} />
          <ListItem icon={<FaInfoCircle />}>{t('Please test the output files in your desired player/editor before you delete the source files.')}</ListItem>
          <OutputIncorrectSeeHelpMenu />
          <Notices notices={notices} />
        </UnorderedList>
      ),
    });
  }, [openExportFinishedDialog, t]);

  async function openCleanupFilesDialog(cleanupChoicesInitial: CleanupChoicesType) {
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
          <Dialog.Content aria-describedby={undefined} style={{ width: '80vw' }} onOpenAutoFocus={handleOpenAutoFocus}>
            <Dialog.Title>
              {t('Cleanup files?')}
            </Dialog.Title>

            <Dialog.Description>
              {t('What do you want to do after exporting a file or when pressing the "delete source file" button?')}
            </Dialog.Description>

            <Checkbox label={t('Close currently opened file')} checked={closeFile} disabled={trashSourceFile || trashTmpFiles} onCheckedChange={(checked) => onChange('closeFile', checked)} />

            <div style={{ marginBottom: '2em' }}>
              <Checkbox label={t('Trash auto-generated files')} checked={trashTmpFiles} onCheckedChange={(checked) => onChange('trashTmpFiles', checked)} />
              <Checkbox label={t('Trash original source file')} checked={trashSourceFile} onCheckedChange={(checked) => onChange('trashSourceFile', checked)} />
              <Checkbox label={t('Trash project LLC file')} checked={trashProjectFile} onCheckedChange={(checked) => onChange('trashProjectFile', checked)} />
              <Checkbox label={t('Permanently delete the files if trash fails?')} disabled={!(trashTmpFiles || trashProjectFile || trashSourceFile)} checked={deleteIfTrashFails} onCheckedChange={(checked) => onChange('deleteIfTrashFails', checked)} />
            </div>

            <div style={{ marginBottom: '2em' }}>
              <Checkbox label={t('Show this dialog every time?')} checked={askForCleanup} onCheckedChange={(checked) => onChange('askForCleanup', checked)} />
              <Checkbox label={t('Do all of this automatically after exporting a file?')} checked={cleanupAfterExport} onCheckedChange={(checked) => onChange('cleanupAfterExport', checked)} />
            </div>

            <Dialog.ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Cancel')}</DialogButton>
              </Dialog.Close>

              <DialogButton ref={confirmRef} onClick={handleOkClick} primary>{t('Confirm')}</DialogButton>
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
