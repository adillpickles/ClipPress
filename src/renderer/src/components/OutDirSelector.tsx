import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import { nanoid } from 'nanoid';

import * as Dialog from './Dialog';
import useUserSettings from '../hooks/useUserSettings';
import Select from './Select';
import { DialogButton } from './Button';
import { DirectoryAccessDeclinedError } from '../../errors';

const changeMagicValue = nanoid();

export default function OutDirSelector({ children }: { children: React.ReactNode }) {
  const { customOutDir, setCustomOutDir, recentCustomOutDirs, changeOutDir, setRecentCustomOutDirs, ensureWritableOutDirWithFilePath } = useUserSettings();
  const { t } = useTranslation();

  const handleChange = useCallback<React.ChangeEventHandler<HTMLSelectElement>>(async (e) => {
    if (e.target.value === changeMagicValue) {
      changeOutDir();
    } else {
      const newOutDir = e.target.value === '' ? undefined : e.target.value;
      try {
        await ensureWritableOutDirWithFilePath({ outDir: newOutDir });
        setCustomOutDir(newOutDir);
      } catch (err) {
        if (err instanceof DirectoryAccessDeclinedError) return;
        throw err;
      }
    }
  }, [changeOutDir, ensureWritableOutDirWithFilePath, setCustomOutDir]);

  const history = useMemo(() => recentCustomOutDirs.filter((dir) => (customOutDir == null || dir !== customOutDir)), [customOutDir, recentCustomOutDirs]);

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {children}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay />

        <Dialog.Content aria-describedby={undefined}>
          <Dialog.Title>{t('Save exports to')}</Dialog.Title>

          <Select style={{ width: '100%', marginTop: '.5rem' }} value={customOutDir ?? ''} onChange={handleChange} aria-label={t('Save exports to')}>
            <option value={changeMagicValue}>{t('Choose a folder…')}</option>
            {customOutDir != null && (
              <option value={customOutDir}>{customOutDir}</option>
            )}
            <option value="">{t('Same folder as the recording')}</option>
            {history.map((dir) => (
              <option key={dir} value={dir}>{dir}</option>
            ))}
          </Select>

          <Dialog.ButtonRow>
            {history.length > 0 && <DialogButton onClick={() => setRecentCustomOutDirs([])}>{t('Clear list')}</DialogButton>}
            <Dialog.Close asChild>
              <DialogButton primary>{t('Done')}</DialogButton>
            </Dialog.Close>
          </Dialog.ButtonRow>

          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
