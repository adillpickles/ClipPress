import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCopy, FiMinus, FiSquare, FiX } from 'react-icons/fi';

import ClipPressMark from './components/ClipPressMark';
import mainApi from './mainApi';
import styles from './AppChrome.module.css';

const remote = window.require('@electron/remote');
const { Menu } = remote;

const shouldUseCustomChrome = process.platform !== 'darwin';

function AppChrome() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(() => document.hasFocus());
  // The menu buttons, fetched in one call now and whenever the main process rebuilds the menu (language or
  // interface mode changed). Reading remote menu items here instead costs a synchronous call per property.
  const [menuItems, setMenuItems] = useState<{ index: number, key: string, label: string }[]>([]);
  // The menu that is popped up, so its button stays pressed like a native menu bar's while the pointer is in the menu.
  const [openIndex, setOpenIndex] = useState<number>();

  useEffect(() => {
    if (!shouldUseCustomChrome) return undefined;
    const { ipcRenderer } = window.require('electron');
    let latest = 0;
    const refresh = () => {
      latest += 1;
      const request = latest;
      mainApi.getMenuBarItems()
        .then((items) => { if (request === latest) setMenuItems(items); })
        .catch((err: unknown) => console.error('Failed to read the menu', err));
    };
    ipcRenderer.on('menuUpdated', refresh);
    refresh();
    return () => { ipcRenderer.removeListener('menuUpdated', refresh); };
  }, []);

  useEffect(() => {
    if (!shouldUseCustomChrome) return undefined;

    // Focus from the page's own events: asking the main process (each a synchronous call) on every focus change
    // made switching back to the app stall.
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    const currentWindow = remote.getCurrentWindow();
    const syncMaximized = () => setIsMaximized(currentWindow.isMaximized());
    syncMaximized();
    currentWindow.on('maximize', syncMaximized);
    currentWindow.on('unmaximize', syncMaximized);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      currentWindow.removeListener('maximize', syncMaximized);
      currentWindow.removeListener('unmaximize', syncMaximized);
    };
  }, []);

  const openMenu = useCallback((index: number, button: HTMLButtonElement | null) => {
    const submenu = Menu.getApplicationMenu()?.items[index]?.submenu;
    if (button == null || submenu == null) return;
    const rect = button.getBoundingClientRect();
    setOpenIndex(index);
    submenu.popup({
      window: remote.getCurrentWindow(),
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
      // Only clear our own menu: another one may have opened before this close arrived.
      callback: () => setOpenIndex((current) => (current === index ? undefined : current)),
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
    <div className={[styles['wrapper'], ...(!isFocused ? [styles['wrapperInactive']] : []), ...(isMaximized ? [styles['wrapperMaximized']] : [])].join(' ')}>
      <div className={styles['left']}>
        <div className={styles['brand']}>
          <div className={styles['brandMark']}>
            <ClipPressMark />
          </div>
          <span className={styles['brandText']}>ClipPress</span>
        </div>

        <div className={styles['menuBar']}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={[styles['menuButton'], ...(openIndex === item.index ? [styles['menuButtonOpen']] : [])].join(' ')}
              onClick={(event) => openMenu(item.index, event.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={openIndex === item.index}
              aria-label={item.label ? undefined : t('Menu')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Each button fills the bar's full height (and reaches the right edge when maximised), so throwing the
          pointer into the top or the corner hits it, as on a native title bar; the rounded pill inside is the look. */}
      <div className={styles['windowControls']}>
        <button type="button" className={styles['windowControl']} onClick={handleMinimize} title={t('Minimize')}>
          <span className={styles['windowControlPill']}><FiMinus /></span>
        </button>
        <button type="button" className={styles['windowControl']} onClick={handleToggleMaximize} title={isMaximized ? t('Restore down') : t('Maximize')}>
          <span className={styles['windowControlPill']}>{isMaximized ? <FiCopy /> : <FiSquare />}</span>
        </button>
        <button type="button" className={[styles['windowControl'], styles['closeControl']].join(' ')} onClick={handleClose} title={t('Close')}>
          <span className={styles['windowControlPill']}><FiX /></span>
        </button>
      </div>
    </div>
  );
}

export default memo(AppChrome);
