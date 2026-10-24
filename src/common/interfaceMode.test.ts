import { expect, test } from 'vitest';

import getEffectiveSimpleMode from './interfaceMode.js';

test('without advanced mode turned on, the new editor runs whatever mode was saved', () => {
  expect(getEffectiveSimpleMode({ enableAdvancedMode: false, simpleMode: true })).toBe(true);
  expect(getEffectiveSimpleMode({ enableAdvancedMode: false, simpleMode: false })).toBe(true);
});

test('with advanced mode turned on, the saved mode comes back', () => {
  expect(getEffectiveSimpleMode({ enableAdvancedMode: true, simpleMode: true })).toBe(true);
  expect(getEffectiveSimpleMode({ enableAdvancedMode: true, simpleMode: false })).toBe(false);
});
