import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCopy, FiMinus, FiScissors, FiSquare, FiX } from 'react-icons/fi';
import type { MenuItem } from 'electron';

import styles from './AppChrome.module.css';

const remote = window.require('@electron/remote');
const { Menu } = remote;

const shouldUseCustomChrome = process.platform !== 'darwin';

function AppChrome() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    if (!shouldUseCustomChrome) return undefined;

    const currentWindow = remote.getCurrentWindow();
    const syncState = () => {
      setIsMaximized(currentWindow.isMaximized());
      setIsFocused(currentWindow.isFocused());
    };

    syncState();
    currentWindow.on('maximize', syncState);
    currentWindow.on('unmaximize', syncState);
    currentWindow.on('focus', syncState);
    currentWindow.on('blur', syncState);

    return () => {
      currentWindow.removeListener('maximize', syncState);
      currentWindow.removeListener('unmaximize', syncState);
      currentWindow.removeListener('focus', syncState);
      currentWindow.removeListener('blur', syncState);
    };
  }, []);

  const menuItems = (() => {
    if (!shouldUseCustomChrome) return [];

    const applicationMenu = Menu.getApplicationMenu();
    if (applicationMenu == null) return [];

    return applicationMenu.items.filter((item: MenuItem) => item.visible !== false && item.submenu != null && item.role !== 'appMenu');
  })();

  const openMenu = useCallback((item: MenuItem, button: HTMLButtonElement | null) => {
    if (button == null || item.submenu == null) return;
    const rect = button.getBoundingClientRect();
    item.submenu.popup({
      window: remote.getCurrentWindow(),
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
    });
  }, []);

  const handleMinimize = useCallback(() => {
    remote.getCurrentWindow().minimize();
  }, []);

  const handleToggleMaximize = useCallback(() => {
    const currentWindow = remote.getCurrentWindow();
    if (currentWindow.isMaximized()) currentWindow.unmaximize();
    else currentWindow.maximize();
  }, []);

  const handleClose = useCallback(() => {
    remote.getCurrentWindow().close();
  }, []);

  if (!shouldUseCustomChrome) return null;

  return (
    <div className={[styles['wrapper'], ...(!isFocused ? [styles['wrapperInactive']] : [])].join(' ')}>
      <div className={styles['left']}>
        <div className={styles['brand']}>
          <div className={styles['brandMark']}>
            <FiScissors />
          </div>
          <span className={styles['brandText']}>ClipPress</span>
        </div>

        <div className={styles['menuBar']}>
          {menuItems.map((item) => (
            <button
              key={item.id ?? item.label}
              type="button"
              className={styles['menuButton']}
              onClick={(event) => openMenu(item, event.currentTarget)}
              title={item.label ?? t('Menu')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles['windowControls']}>
        <button type="button" className={styles['windowControl']} onClick={handleMinimize} title={t('Minimize')}>
          <FiMinus />
        </button>
        <button type="button" className={styles['windowControl']} onClick={handleToggleMaximize} title={isMaximized ? t('Restore down') : t('Maximize')}>
          {isMaximized ? <FiCopy /> : <FiSquare />}
        </button>
        <button type="button" className={[styles['windowControl'], styles['closeControl']].join(' ')} onClick={handleClose} title={t('Close')}>
          <FiX />
        </button>
      </div>
    </div>
  );
}

export default memo(AppChrome);
