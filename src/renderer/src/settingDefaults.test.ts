import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import dropdownDefaults from './settingDefaults';

describe('dropdownDefaults', () => {
  it('match the defaults in configStore.ts', () => {
    const source = readFileSync(join(__dirname, '../../main/configStore.ts'), 'utf8');
    const block = source.slice(source.indexOf('const defaults: Config = {'));
    Object.entries(dropdownDefaults).forEach(([key, value]) => {
      const literal = block.match(new RegExp(`\n  ${key}: ([^,\n]+),`))?.[1];
      expect(literal, key).toBe(typeof value === 'string' ? `'${value}'` : String(value));
    });
  });
});
