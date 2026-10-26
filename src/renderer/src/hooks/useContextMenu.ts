import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

import { closeMenu, openMenu } from '../components/Menu';
import type { ContextMenuTemplate } from '../types';


/**
 * Right-clicking the element opens the app's menu (Menu.tsx) with the latest template. Nothing opens for an empty one.
 */
export default function useContextMenu(
  ref: RefObject<HTMLElement>,
  template: ContextMenuTemplate,
) {
  const templateRef = useRef(template);
  useEffect(() => {
    templateRef.current = template;
  });

  useEffect(() => {
    const el = ref.current;
    if (el == null) return undefined;
    const onContextMenu = (e: MouseEvent) => {
      const items = templateRef.current;
      if (items.length === 0) return;
      e.preventDefault();
      openMenu({ items, at: { x: e.clientX, y: e.clientY } });
    };
    el.addEventListener('contextmenu', onContextMenu);
    return () => el.removeEventListener('contextmenu', onContextMenu);
  }, [ref]);

  return { closeMenu };
}
