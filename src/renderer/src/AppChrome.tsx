import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCopy, FiMinus, FiSquare, FiX } from 'react-icons/fi';

import ClipPressMark from './components/ClipPressMark';
import { openMenu } from './components/Menu';
import type { MenuEntry } from './components/Menu';
import mainApi from './mainApi';
import type { AppMenuItem } from '../../main';
import type { KeyBinding } from '../../common/types';
import styles from './AppChrome.module.css';

const remote = window.require('@electron/remote');

const shouldUseCustomChrome = process.platform !== 'darwin';

/** The menu bar's items as the app's menu shows them: an item running an app action shows that action's real keys. */
const toMenuEntries = (items: AppMenuItem[], keyBindingByAction: Record<string, KeyBinding>): MenuEntry[] => items.map((item) => ({
  label: item.label,
  type: item.type as MenuEntry['type'],
  checked: item.checked,
  enabled: item.enabled,
  visible: item.visible,
  ...(item.id != null && keyBindingByAction[item.id] != null ? { keys: keyBindingByAction[item.id]!.keys } : { accelerator: item.accelerator }),
  submenu: item.submenu != null ? toMenuEntries(item.submenu, keyBindingByAction) : undefined,
  click: item.submenu == null ? () => { mainApi.clickMenuItem(item.path); } : undefined,
}));

interface BarMenuContext {
  buttons: Map<number, HTMLButtonElement>,
  keyBindings: { current: Record<string, KeyBinding> },
  request: { current: number },
  setOpenIndex: (update: (current: number | undefined) => number | undefined) => void,
}

/** The app's own menu under a menu bar button, from the menu bar's current items (read in one call when it opens). */
async function showBarMenu(context: BarMenuContext, index: number, keyboard: boolean) {
  const { buttons, keyBindings, request, setOpenIndex } = context;
  const button = buttons.get(index);
  if (button == null) return;
  request.current += 1;
  const thisRequest = request.current;
  const items = await mainApi.getMenuBarMenu(index);
  if (thisRequest !== request.current) return;
  const indexes = [...buttons.keys()].sort((a, b) => a - b);
  const buttonAt = (x: number, y: number) => indexes.find((i) => {
    const r = buttons.get(i)?.getBoundingClientRect();
    return r != null && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  });
  setOpenIndex(() => index);
  openMenu({
    items: toMenuEntries(items, keyBindings.current),
    at: button,
    label: button.textContent ?? undefined,
    keyboard,
    onClose: () => setOpenIndex((current) => (current === index ? undefined : current)),
    // Left and Right go to the menus either side, as in a system menu bar.
    onNavigate: (direction) => {
      const next = indexes[(indexes.indexOf(index) + direction + indexes.length) % indexes.length];
      if (next != null) showBarMenu(context, next, true);
    },
    // While one is open, pointing at another button opens that one; pressing this one closes it.
    onOutsidePointer: ({ x, y }) => {
      const over = buttonAt(x, y);
      if (over == null || over === index) return false;
      showBarMenu(context, over, false);
      return true;
    },
  });
}

function AppChrome({ keyBindingByAction }: { keyBindingByAction: Record<string, KeyBinding> }) {
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

  const buttonsRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const keyBindingsRef = useRef(keyBindingByAction);
  useEffect(() => {
    keyBindingsRef.current = keyBindingByAction;
  }, [keyBindingByAction]);
  // Which menu was asked for last: a slow answer for one the pointer has moved on from is dropped.
  const requestRef = useRef(0);
  const openBarMenu = useCallback((index: number, keyboard: boolean) => {
    showBarMenu({ buttons: buttonsRef.current, keyBindings: keyBindingsRef, request: requestRef, setOpenIndex }, index, keyboard);
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
              ref={(el) => {
                if (el != null) buttonsRef.current.set(item.index, el);
                else buttonsRef.current.delete(item.index);
              }}
              className={[styles['menuButton'], ...(openIndex === item.index ? [styles['menuButtonOpen']] : [])].join(' ')}
              // Pressed (not clicked), like a system menu bar; detail 0 is Enter or Space, which opens it highlighted.
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                openBarMenu(item.index, false);
              }}
              onClick={(event) => {
                if (event.detail === 0) openBarMenu(item.index, true);
              }}
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
