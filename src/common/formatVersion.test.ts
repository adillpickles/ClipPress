import i18n from 'i18next';
import { beforeAll, expect, test } from 'vitest';

import formatVersion from './formatVersion.js';

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: {} });
});

test('beta releases read as "Beta N"', () => {
  expect(formatVersion('0.1.0-beta.6')).toBe('Beta 6');
  expect(formatVersion('0.2.0-beta.12')).toBe('Beta 12');
});

test('other versions keep their number', () => {
  expect(formatVersion('1.2.0')).toBe('v1.2.0');
  expect(formatVersion('1.0.0-rc.1')).toBe('v1.0.0-rc.1');
});
