import { memo, useCallback, useMemo, useState } from 'react';
import { IoIosSettings } from 'react-icons/io';
import { FaFolderOpen, FaList } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Button from './components/Button';

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
  onExportPress,
  segmentsToExport,
  areWeCutting,
}: {
  filePath: string | undefined,
  currentClipName: string | undefined,
  onCurrentClipNameChange: (name: string) => void,
  numStreamsToCopy: number,
  numStreamsTotal: number,
  setStreamsSelectorShown: (v: boolean) => void,
  toggleSettings: () => void,
  onOpenFiles: () => void,
  onExportPress: () => void,
  segmentsToExport: SegmentToExport[],
  areWeCutting: boolean,
}) {
  const { t } = useTranslation();
  const { simpleMode } = useUserSettings();
  const fallbackFileName = filePath ? window.require('path').basename(filePath) : undefined;
  const fileName = currentClipName ?? fallbackFileName;
  const [renameDraft, setRenameDraft] = useState<{ sourceName: string, value: string }>();
  const isRenaming = fileName != null && renameDraft?.sourceName === fileName;
  const draftName = useMemo(() => (isRenaming ? renameDraft.value : (fileName ?? '')), [fileName, isRenaming, renameDraft]);

  const commitRename = useCallback(() => {
    if (fallbackFileName == null) return;
    onCurrentClipNameChange(draftName.trim() === '' ? fallbackFileName : draftName.trim());
    setRenameDraft(undefined);
  }, [draftName, fallbackFileName, onCurrentClipNameChange]);

  if (filePath == null) return null;

  return (
    <div className={`no-user-select ${styles['wrapper']}`}>
      <div className={styles['primary']}>
        <div className={styles['brandBlock']}>
          <div className={styles['brandTitle']}>ClipPress</div>
        </div>

        <Button onClick={onOpenFiles} className={styles['secondaryAction']}>
          <span className={styles['secondaryActionLabel']}>
            <FaFolderOpen style={{ fontSize: '.85em' }} />
            {t('Open another clip')}
          </span>
        </Button>

        {fileName != null && (
          <div className={styles['fileChip']}>
            <div className={styles['fileLabel']}>{t('Current clip')}</div>
            {isRenaming ? (
              <input
                className={styles['fileNameInput']}
                value={draftName}
                title={fileName}
                onChange={(e) => setRenameDraft(fileName != null ? { sourceName: fileName, value: e.target.value } : undefined)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setRenameDraft(undefined);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={styles['fileNameButton']}
                title={fileName}
                onClick={() => {
                  if (fileName == null) return;
                  setRenameDraft({ sourceName: fileName, value: fileName });
                }}
              >
                <span className={styles['fileName']}>{fileName}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles['actions']}>
        {!simpleMode && (
          <Button onClick={() => setStreamsSelectorShown(true)} className={styles['secondaryAction']}>
            <span className={styles['secondaryActionLabel']}>
              <FaList style={{ fontSize: '.82em' }} />
              {t('Tracks kept')} ({numStreamsToCopy}/{numStreamsTotal})
            </span>
          </Button>
        )}

        <SimpleModeButton />

        <Button onClick={toggleSettings} className={styles['settingsAction']}>
          <span className={styles['secondaryActionLabel']}>
            <IoIosSettings style={{ fontSize: '1.1em' }} />
            {t('Settings')}
          </span>
        </Button>

        <ExportButton segmentsToExport={segmentsToExport} areWeCutting={areWeCutting} onClick={onExportPress} />
      </div>
    </div>
  );
}

export default memo(TopMenu);
