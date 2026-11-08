import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import Button from './Button';
import RevertButton from './RevertButton';
import { DirectoryAccessDeclinedError } from '../../errors';
import styles from './OutDirButtons.module.css';

/**
 * Where exports are saved: Change opens the folder picker straight away, and the arrow (shown once a folder is picked)
 * goes back to next to the recording. The same pair in Settings and on the simple export sheet.
 */
export default function OutDirButtons({ size, children }: { size?: 'sm' | undefined, children: React.ReactNode }) {
  const { t } = useTranslation();
  const { customOutDir, setCustomOutDir, changeOutDir, ensureWritableOutDirWithFilePath } = useUserSettings();

  // Back to next to the recording, once that folder can be written to.
  const saveNextToRecording = useCallback(async () => {
    try {
      await ensureWritableOutDirWithFilePath({ outDir: undefined });
      setCustomOutDir(undefined);
    } catch (err) {
      if (err instanceof DirectoryAccessDeclinedError) return;
      throw err;
    }
  }, [ensureWritableOutDirWithFilePath, setCustomOutDir]);

  return (
    <div className={styles['buttons']}>
      {customOutDir != null && <RevertButton title={t('Save next to the recording')} onClick={saveNextToRecording} />}
      <Button size={size} onClick={changeOutDir}>{children}</Button>
    </div>
  );
}
