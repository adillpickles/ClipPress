import type { MouseEventHandler, ReactNode } from 'react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';
import prettyBytes from 'pretty-bytes';
import { FaCheckCircle, FaExclamationTriangle, FaFileVideo, FaInfoCircle } from 'react-icons/fa';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

import * as Dialog from './Dialog';
import * as AlertDialog from './AlertDialog';
import { DialogButton } from './Button';
import { readFileSize, showItemInFolder } from '../util';
import type { CleanupChoice, CleanupChoicesType } from '../dialogs';
import { ListItem, Notices, OutputIncorrectSeeHelpMenu, UnorderedList, Warnings } from '../dialogs';
import Checkbox from './Checkbox';
import HelpTip from './HelpTip';
import { saveColor, warningColor } from '../colors';
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
        className={styles['disclosure']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
        {label}
      </button>

      {open && <UnorderedList>{items}</UnorderedList>}
    </div>
  );
}

/** The file name to show as the result, without the directory it landed in. */
function getResultFileName(filePath: string) {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/**
 * The body every "export finished" dialog uses.
 *
 * One line saying what was produced, one line of context, and everything else folded
 * away. The inherited dialogs put the standing advice ("test the output", "see the Help
 * menu") at the same level as the result, which made a routine success read like a
 * report to work through.
 */
function ExportResultBody({ hasWarnings, headline, subtitle, filePaths, highlight, details, warningCount, sizeFilePath }: {
  hasWarnings: boolean,
  headline: ReactNode,
  subtitle?: ReactNode,
  /** Listed under the headline when there is more than one, so a multi-file export names every file it made. */
  filePaths?: string[] | undefined,
  /** Something the user should see without opening Details (e.g. the original went to the Recycle Bin). */
  highlight?: ReactNode,
  details?: ReactNode,
  warningCount: number,
  sizeFilePath?: string | undefined,
}) {
  const { t } = useTranslation();
  const [measuredFile, setMeasuredFile] = useState<{ path: string, size: number }>();
  const size = measuredFile?.path === sizeFilePath ? measuredFile?.size : undefined;
  useEffect(() => {
    let active = true;
    if (sizeFilePath != null) {
      readFileSize(sizeFilePath).then((value) => {
        if (active) setMeasuredFile({ path: sizeFilePath, size: value });
      }).catch((error) => console.warn('Unable to read exported file size', error));
    }
    return () => { active = false; };
  }, [sizeFilePath]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5em' }}>
        <span style={{ color: hasWarnings ? warningColor : saveColor, marginTop: '.15em' }}>
          {hasWarnings ? <FaExclamationTriangle /> : <FaCheckCircle />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', wordBreak: 'break-word' }}>{headline}</div>
          {size != null && <div style={{ opacity: 0.75, fontSize: '.9em', marginTop: '.15em' }}>{prettyBytes(size)}</div>}
          {subtitle != null && (
            <div style={{ opacity: 0.75, fontSize: '.9em', marginTop: '.15em' }}>{subtitle}</div>
          )}
          {filePaths != null && filePaths.length > 1 && (
            <ul className={styles['fileList']}>
              {filePaths.map((path) => (
                <li key={path} className={styles['fileItem']} title={path}>
                  <FaFileVideo aria-hidden className={styles['fileIcon']} />
                  <span className={styles['fileName']}>{getResultFileName(path)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {highlight != null && (
        <div style={{ marginTop: '.7em', padding: '.5em .7em', borderRadius: 'var(--cp-radius)', background: 'var(--cp-accent-soft)', color: 'var(--cp-text)', fontSize: '.9em' }}>{highlight}</div>
      )}

      {details != null && (
        <ExportDetails
          items={details}
          // A warning is something to act on, so it is shown straight away.
          defaultOpen={hasWarnings}
          label={hasWarnings
            ? t('Details ({{count}} warnings)', { count: warningCount })
            : t('Details')}
        />
      )}
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

  const openCutFinishedDialog = useCallback(async ({ filePath, filePaths, warnings, notices, highlight, fileCount = 1 }: {
    filePath: string,
    /** Every file the export made, to name them all when there is more than one. */
    filePaths?: string[] | undefined,
    warnings: string[],
    notices: string[],
    highlight?: string | undefined,
    fileCount?: number | undefined,
  }) => {
    const hasWarnings = warnings.length > 0;

    await openExportFinishedDialog({
      filePath,
      title: fileCount === 0 ? t('Nothing was exported') : (hasWarnings ? t('Export finished with warnings') : t('Export successful')),
      width: '34em',
      children: (
        <ExportResultBody
          hasWarnings={hasWarnings}
          warningCount={warnings.length}
          // One bold file name read as if only one file was made, so several files lead with their count.
          headline={(() => {
            if (fileCount === 0) return t('No new files were written');
            if (fileCount > 1) return t('{{count}} files exported', { count: fileCount });
            return getResultFileName(filePath);
          })()}
          sizeFilePath={fileCount === 1 ? filePath : undefined}
          filePaths={filePaths}
          highlight={highlight}
          details={(
            <>
              <Warnings warnings={warnings} />
              <Notices notices={notices} />
              {/* https://github.com/mifi/lossless-cut/issues/2048 */}
              <ListItem icon={<FaInfoCircle />}>{t('Please test the output file in your desired player/editor before you delete the source file.')}</ListItem>
              <OutputIncorrectSeeHelpMenu />
            </>
          )}
        />
      ),
    });
  }, [openExportFinishedDialog, t]);

  const openSizeLimitedFinishedDialog = useCallback(async ({ filePath, filePaths, warnings, notices, summary, highlight }: {
    filePath: string,
    /** Every file the export made, to name them all when there is more than one. */
    filePaths?: string[] | undefined,
    warnings: string[],
    notices: string[],
    summary: SizeLimitedFinishedSummary,
    highlight?: string | undefined,
  }) => {
    const hasWarnings = warnings.length > 0;
    const wroteNewFiles = summary.createdCount > 0;
    const wroteSeveralFiles = summary.createdCount > 1;

    const sizeText = (() => {
      if (!wroteNewFiles) return undefined;

      const actual = summary.createdCount === 1
        ? summary.singleCreatedSizeLabel
        : summary.largestCreatedSizeLabel;
      if (actual == null) return t('Limit {{target}}', { target: summary.requestedLimitLabel });

      // With several files the headline already gives the count.
      return wroteSeveralFiles
        ? t('Largest {{actual}} of {{target}} limit', { actual, target: summary.requestedLimitLabel })
        : t('{{actual}} of {{target}} limit', { actual, target: summary.requestedLimitLabel });
    })();

    // One bold file name read as if only one file was made, so several files lead with their count.
    const headline = (() => {
      if (!wroteNewFiles) return t('No new files were written');
      if (wroteSeveralFiles) return t('{{count}} files exported', { count: summary.createdCount });
      return getResultFileName(filePath);
    })();

    const detailItems = (warnings.length > 0 || notices.length > 0)
      ? (
        <>
          <Warnings warnings={warnings} />
          <Notices notices={notices} />
        </>
      )
      : undefined;

    await openExportFinishedDialog({
      filePath,
      title: wroteNewFiles
        ? (hasWarnings ? t('Export finished with warnings') : t('Export successful'))
        : t('Nothing was exported'),
      width: '34em',
      children: (
        <ExportResultBody
          hasWarnings={hasWarnings}
          warningCount={warnings.length}
          headline={headline}
          subtitle={sizeText}
          filePaths={filePaths}
          highlight={highlight}
          details={detailItems}
        />
      ),
    });
  }, [openExportFinishedDialog, t]);

  const openConcatFinishedDialog = useCallback(async ({ filePath, warnings, notices, sourceCount, created = true }: {
    filePath: string,
    warnings: string[],
    notices: string[],
    sourceCount?: number | undefined,
    created?: boolean | undefined,
  }) => {
    const hasWarnings = warnings.length > 0;

    await openExportFinishedDialog({
      filePath,
      title: !created ? t('Nothing was exported') : (hasWarnings ? t('Merge finished with warnings') : t('Merge successful')),
      width: '34em',
      children: (
        <ExportResultBody
          hasWarnings={hasWarnings}
          warningCount={warnings.length}
          headline={created ? getResultFileName(filePath) : t('No new files were written')}
          sizeFilePath={created ? filePath : undefined}
          subtitle={created && sourceCount != null && sourceCount > 1 ? t('Merged from {{count}} files', { count: sourceCount }) : undefined}
          details={(
            <>
              <Warnings warnings={warnings} />
              <Notices notices={notices} />
              <ListItem icon={<FaInfoCircle />}>{t('Please test the output files in your desired player/editor before you delete the source files.')}</ListItem>
              <OutputIncorrectSeeHelpMenu />
            </>
          )}
        />
      ),
    });
  }, [openExportFinishedDialog, t]);

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
