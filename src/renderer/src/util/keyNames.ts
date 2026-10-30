import { getMetaKeyName } from '../util';

const keyNames: Record<string, string> = {
  Escape: 'Esc',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
  KeyT: 'T',
  KeyY: 'Y',
  KeyU: 'U',
  KeyI: 'I',
  KeyO: 'O',
  KeyP: 'P',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyF: 'F',
  KeyG: 'G',
  KeyH: 'H',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  KeyZ: 'Z',
  KeyX: 'X',
  KeyC: 'C',
  KeyV: 'V',
  KeyB: 'B',
  KeyN: 'N',
  KeyM: 'M',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: '\'',
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
  F13: 'F13',
  F14: 'F14',
  F15: 'F15',
  F16: 'F16',
  F17: 'F17',
  F18: 'F18',
  F19: 'F19',
  F20: 'F20',
  F21: 'F21',
  F22: 'F22',
  F23: 'F23',
  F24: 'F24',
  NumpadParenLeft: '(',
  NumpadParenRight: ')',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowUp: '↑',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowDown: '↓',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: getMetaKeyName(),
  MetaRight: getMetaKeyName(),
};

/** A key code (`KeyI`, `ShiftLeft`…) as printed on the user's keyboard. */
export function getKeyDisplayName(code: string, keyboardLayoutMap: Map<string, string> | undefined) {
  return keyboardLayoutMap?.get(code) ?? keyNames[code] ?? code;
}

/**
 * Each action's binding for shortcut hints: the first one, but on a Mac one using Cmd and elsewhere one without the
 * Windows key, when the action has such a one (the defaults pair each Ctrl shortcut with a Cmd/Windows key twin).
 */
export function pickHintKeyBindings<T extends { keys: string, action: string }>(bindings: readonly T[], isMac: boolean) {
  const usesMeta = (binding: T) => /Meta/.test(binding.keys);
  const byAction: Record<string, T> = {};
  bindings.forEach((binding) => {
    const current = byAction[binding.action];
    if (current == null || (usesMeta(current) !== isMac && usesMeta(binding) === isMac)) byAction[binding.action] = binding;
  });
  return byAction;
}
