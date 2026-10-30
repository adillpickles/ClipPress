import { describe, expect, it, vi } from 'vitest';

import { fixKeys, getHiddenTwinKeys, normalizeBindingKeys } from './shortcutKeys';

// util.ts needs Electron's window; only its modifier key sets are used here.
vi.mock('./util', () => {
  const shiftModifiers = new Set(['ShiftLeft', 'ShiftRight']);
  const controlModifiers = new Set(['ControlLeft', 'ControlRight']);
  const altModifiers = new Set(['AltLeft', 'AltRight']);
  const metaModifiers = new Set(['MetaLeft', 'MetaRight']);
  return { isMac: false, shiftModifiers, controlModifiers, altModifiers, metaModifiers, allModifiers: new Set([...shiftModifiers, ...controlModifiers, ...altModifiers, ...metaModifiers]) };
});

describe('fixKeys', () => {
  it('puts modifiers first, in a fixed order', () => {
    expect(fixKeys(['KeyD', 'ControlLeft'])).toEqual(['ControlLeft', 'KeyD']);
    expect(fixKeys(['KeyR', 'AltLeft', 'ShiftLeft'])).toEqual(['ShiftLeft', 'AltLeft', 'KeyR']);
  });

  it('is not a binding with only modifiers or two other keys', () => {
    expect(fixKeys(['ControlLeft'])).toEqual([]);
    expect(fixKeys(['KeyA', 'KeyB'])).toEqual([]);
  });
});

describe('normalizeBindingKeys', () => {
  it('compares left and right modifiers as one', () => {
    expect(normalizeBindingKeys('ControlRight+KeyR')).toBe(normalizeBindingKeys('ControlLeft+KeyR'));
    expect(normalizeBindingKeys('ControlLeft+ControlRight+KeyR')).toBe(normalizeBindingKeys('ControlLeft+KeyR'));
  });

  it('keeps different combinations apart', () => {
    expect(normalizeBindingKeys('ShiftLeft+KeyR')).not.toBe(normalizeBindingKeys('ControlLeft+KeyR'));
  });
});

describe('getHiddenTwinKeys', () => {
  it('is the Windows-key twin of a Ctrl shortcut, which goes with it', () => {
    expect(getHiddenTwinKeys('ControlLeft+KeyD')).toBe('MetaLeft+KeyD');
    expect(getHiddenTwinKeys('ControlLeft+ShiftLeft+KeyZ')).toBe('MetaLeft+ShiftLeft+KeyZ');
  });

  it('is nothing for a shortcut without Ctrl', () => {
    expect(getHiddenTwinKeys('AltLeft+KeyJ')).toBeUndefined();
    expect(getHiddenTwinKeys('')).toBeUndefined();
  });
});
