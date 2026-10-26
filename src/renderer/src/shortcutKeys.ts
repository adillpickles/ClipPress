import orderBy from 'lodash/orderBy';
import uniq from 'lodash/uniq';

import { allModifiers, altModifiers, controlModifiers, metaModifiers, shiftModifiers } from './util';

/**
 * Pressed keys as a key binding, modifiers first in Windows' order (Ctrl + Shift + Alt + Win); empty when it isn't one:
 * only modifiers, or more than one other key. (Shared by Settings' shortcuts and the shortcuts dialog.)
 */
export function fixKeys(keys: string[]) {
  const uniqed = uniq(keys);
  const nonModifierKeys = uniqed.filter((key) => !allModifiers.has(key));
  if (nonModifierKeys.length !== 1) return [];
  return orderBy(uniqed, [(key) => !controlModifiers.has(key), (key) => !shiftModifiers.has(key), (key) => !altModifiers.has(key), (key) => !metaModifiers.has(key), (key) => key]);
}

/** A key press as a binding's keys: its modifiers read from the event (as the left ones), then the key itself. */
export function getEventBindingKeys(e: { code: string, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean }) {
  const modifiers = [...(e.ctrlKey ? ['ControlLeft'] : []), ...(e.shiftKey ? ['ShiftLeft'] : []), ...(e.altKey ? ['AltLeft'] : []), ...(e.metaKey ? ['MetaLeft'] : [])];
  return fixKeys([...modifiers, e.code]).join('+');
}

/** Left and right modifier keys do the same (useKeyboard), so a binding's keys compare with both as the left one. */
export const normalizeBindingKeys = (keys: string) => uniq(keys.split('+').map((key) => key.replace(/^(Control|Shift|Alt|Meta)Right$/, '$1Left'))).sort().join('+');
