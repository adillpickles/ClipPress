import type { ComponentProps } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { FiChevronRight, FiEdit2, FiList, FiSettings } from 'react-icons/fi';
import { LuListVideo } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import Button from './components/Button';
import ShelfButton from './components/ShelfButton';

import ExportButton from './components/ExportButton';
import SimpleModeButton from './components/SimpleModeButton';
import useUserSettings from './hooks/useUserSettings';
import type { SegmentToExport } from './types';
import styles from './TopMenu.module.css';

function TopMenu({
  filePath,
  currentClipName,
  onCurrentClipNameChange,
  numStreamsToCopy,
  numStreamsTotal,
  setStreamsSelectorShown,
  toggleSettings,
  onOpenFiles,
  onShelfShown,
  shelf,
  nextClipName,
  onOpenNextClip,
  clipsPanelShown,
  onShowClipsPanel,
  onExportPress,
  segmentsToExport,
}: {
  filePath: string | undefined,
  currentClipName: string | undefined,
  onCurrentClipNameChange: (name: string) => void,
  numStreamsToCopy: number,
  numStreamsTotal: number,
  setStreamsSelectorShown: (v: boolean) => void,
  toggleSettings: () => void,
  onOpenFiles: () => void,
  onShelfShown: () => void,
  shelf: ComponentProps<typeof ShelfButton>['shelf'],
  /** Simple mode: the clip after this one in the shelf, if any. */
  nextClipName: string | undefined,
  onOpenNextClip: () => void,
  clipsPanelShown: boolean,
  onShowClipsPanel: () => void,
  onExportPress: () => void,
  segmentsToExport: SegmentToExport[],
}) {
  const { t } = useTranslation();
  const { simpleMode, enableAdvancedMode } = useUserSettings();
  // Without the extension, so it reads as the name exports get, not the recording's file name on disk.
  const fallbackFileName = filePath ? window.require('path').parse(filePath).name : undefined;
  const fileName = currentClipName ?? fallbackFileName;
  const [renameDraft, setRenameDraft] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const draftName = useMemo(() => (isRenaming ? renameDraft : (fileName ?? '')), [fileName, isRenaming, renameDraft]);

  const commitRename = useCallback(() => {
    if (fallbackFileName == null) return;
    onCurrentClipNameChange(draftName.trim() === '' ? fallbackFileName : draftName.trim());
    setIsRenaming(false);
  }, [draftName, fallbackFileName, onCurrentClipNameChange]);

  if (filePath == null) return null;

  return (
    <div className={`no-user-select ${styles['wrapper']}`}>
      <div className={styles['primary']}>
        <ShelfButton onOpenFiles={onOpenFiles} onShelfShown={onShelfShown} shelf={shelf} />

        {fileName != null && (
          <div className={styles['fileChip']}>
            {isRenaming ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className={styles['fileNameInput']}
                value={draftName}
                placeholder={t('Export name')}
                aria-label={t('Export name')}
                onChange={(e) => setRenameDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setRenameDraft(fileName ?? '');
                    setIsRenaming(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={styles['fileNameButton']}
                title={`${fileName}\n${t('Exports are named after this. Click to change it.')}`}
                onClick={() => {
                  if (fileName == null) return;
                  setRenameDraft(fileName);
                  setIsRenaming(true);
                }}
              >
                <span className={styles['fileName']}>{fileName}</span>
                <FiEdit2 aria-hidden className={styles['fileNameEdit']} />
              </button>
            )}
          </div>
        )}

        {nextClipName != null && (
          <Button variant="ghost" onClick={onOpenNextClip} title={t('Next clip: {{name}}', { name: nextClipName })}>
            {t('Next clip')}
            <FiChevronRight aria-hidden />
          </Button>
        )}
      </div>

      <div className={styles['actions']}>
        {!simpleMode && (
          <Button onClick={() => setStreamsSelectorShown(true)} title={t('Choose which tracks to keep')}>
            <FiList aria-hidden />
            {t('Tracks kept')} ({numStreamsToCopy}/{numStreamsTotal})
          </Button>
        )}

        {/* The way back to the Clips panel once it's closed; it sits above where the panel opens.
            Advanced mode names it like the panel's own title there. */}
        {!clipsPanelShown && (
          <Button onClick={onShowClipsPanel} title={simpleMode ? t('Show clips') : t('Show sidebar')}>
            <LuListVideo aria-hidden />
            {simpleMode ? t('Clips') : t('Segments')}
          </Button>
        )}

        {/* Advanced mode is unfinished, so its switch only shows once it's turned on in Settings. */}
        {enableAdvancedMode && <SimpleModeButton />}

        <Button variant="ghost" onClick={toggleSettings} title={t('Settings')}>
          <FiSettings aria-hidden />
          {t('Settings')}
        </Button>

        <ExportButton segmentsToExport={segmentsToExport} onClick={onExportPress} />
      </div>
    </div>
  );
}

export default memo(TopMenu);
