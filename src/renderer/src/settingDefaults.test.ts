import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import dropdownDefaults from './settingDefaults';

describe('dropdownDefaults', () => {
  it('match the defaults in configStore.ts', () => {
    const source = readFileSync(join(__dirname, '../../main/configStore.ts'), 'utf8');
    const block = source.slice(source.indexOf('const defaults: Config = {'));
    // The language's default is i18nCommon's fallbackLng.
    const fallbackLng = readFileSync(join(__dirname, '../../main/i18nCommon.ts'), 'utf8').match(/export const fallbackLng = ('[^']+');/)?.[1];
    Object.entries(dropdownDefaults).forEach(([key, value]) => {
      const found = block.match(new RegExp(`\n  ${key}: ([^,\n]+),`))?.[1];
      const literal = found === 'fallbackLng' ? fallbackLng : found;
      expect(literal, key).toBe(typeof value === 'string' ? `'${value}'` : String(value));
    });
  });
});
