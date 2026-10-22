import { memo, useCallback, useMemo, useState } from 'react';
import { FiEdit2, FiFolder, FiList, FiSettings } from 'react-icons/fi';
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
}) {
  const { t } = useTranslation();
  const { simpleMode } = useUserSettings();
  const fallbackFileName = filePath ? window.require('path').basename(filePath) : undefined;
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
        <Button onClick={onOpenFiles} title={t('Open another clip')}>
          <FiFolder aria-hidden />
          {t('Open')}
        </Button>

        {fileName != null && (
          <div className={styles['fileChip']}>
            {isRenaming ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className={styles['fileNameInput']}
                value={draftName}
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
                title={`${fileName}\n${t('Click to rename what the exported clip is called')}`}
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
      </div>

      <div className={styles['actions']}>
        {!simpleMode && (
          <Button onClick={() => setStreamsSelectorShown(true)} title={t('Choose which tracks to keep')}>
            <FiList aria-hidden />
            {t('Tracks kept')} ({numStreamsToCopy}/{numStreamsTotal})
          </Button>
        )}

        <SimpleModeButton />

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
