import orderBy from 'lodash/orderBy';
import uniq from 'lodash/uniq';

import { allModifiers, altModifiers, controlModifiers, metaModifiers, shiftModifiers } from './util';

/**
 * Pressed keys as a key binding, modifiers first in a fixed order; empty when it isn't one: only modifiers, or more
 * than one other key. (Shared by Settings' shortcuts and the shortcuts dialog, which loads only when it's opened.)
 */
export function fixKeys(keys: string[]) {
  const uniqed = uniq(keys);
  const nonModifierKeys = uniqed.filter((key) => !allModifiers.has(key));
  if (nonModifierKeys.length !== 1) return [];
  return orderBy(uniqed, [(key) => !shiftModifiers.has(key), (key) => !controlModifiers.has(key), (key) => !altModifiers.has(key), (key) => !metaModifiers.has(key), (key) => key]);
}

/** Left and right modifier keys do the same (useKeyboard), so a binding's keys compare with both as the left one. */
export const normalizeBindingKeys = (keys: string) => keys.split('+').map((key) => key.replace(/^(Control|Shift|Alt|Meta)Right$/, '$1Left')).sort().join('+');
