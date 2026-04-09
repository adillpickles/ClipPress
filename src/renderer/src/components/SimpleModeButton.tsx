import type { CSSProperties } from 'react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import classes from './SimpleModeButton.module.css';


function SimpleModeButton({ style }: { style?: CSSProperties } = {}) {
  const { t } = useTranslation();
  const { simpleMode, toggleSimpleMode } = useUserSettings();

  const setMode = useCallback((wantSimpleMode: boolean) => {
    if (simpleMode === wantSimpleMode) return;
    toggleSimpleMode();
  }, [simpleMode, toggleSimpleMode]);

  return (
    <div className={classes['segmented']} style={style} aria-label={t('Interface mode')}>
      <button type="button" className={[classes['option'], ...(simpleMode ? [classes['active']] : [])].join(' ')} onClick={() => setMode(true)} title={t('Show the cleaner everyday editing view')}>
        {t('Simple')}
      </button>
      <button type="button" className={[classes['option'], ...(!simpleMode ? [classes['active']] : [])].join(' ')} onClick={() => setMode(false)} title={t('Show more technical controls and utilities')}>
        {t('Advanced')}
      </button>
    </div>
  );
}

export default memo(SimpleModeButton);
