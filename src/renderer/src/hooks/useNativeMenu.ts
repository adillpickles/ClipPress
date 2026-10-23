import type { Menu as MenuType, MenuItemConstructorOptions, MenuItem } from 'electron';
import { useCallback, useEffect, useRef } from 'react';

// TODO pull out?
const remote = window.require('@electron/remote');
// eslint-disable-next-line prefer-destructuring
const Menu: typeof MenuType = remote.Menu;

// https://github.com/transflow/use-electron-context-menu
// https://www.electronjs.org/docs/latest/api/menu-item
/**
 * A native menu, built from the latest template when it opens. Building it is a synchronous call to the main
 * process (@electron/remote), so it isn't rebuilt each time the template changes (every edit, every move of a
 * trim drag), only on right-click.
 */
export default function useNativeMenu(
  template: (MenuItemConstructorOptions | MenuItem)[],
  options: { x?: number, y?: number, onContext?: (e: MouseEvent) => void, onClose?: () => void } = {},
) {
  const latestRef = useRef({ template, options });
  useEffect(() => {
    latestRef.current = { template, options };
  });
  const menuRef = useRef<MenuType>();

  const openMenu = useCallback((e: MouseEvent) => {
    const { template: currentTemplate, options: { x, y, onContext, onClose } } = latestRef.current;
    const menu = Menu.buildFromTemplate(currentTemplate);
    menuRef.current = menu;
    // @ts-expect-error todo type this
    menu.popup({
      window: remote.getCurrentWindow(),
      x,
      y,
      callback: onClose,
    });

    if (onContext) onContext(e);
  }, []);

  const closeMenu = useCallback(() => menuRef.current?.closePopup(), []);

  return { openMenu, closeMenu };
}
