import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { keptByResetAllSettings } from './resetAllSettings.js';

const configStore = readFileSync(join(process.cwd(), 'src/main/configStore.ts'), 'utf8');
const userSettings = readFileSync(join(process.cwd(), 'src/renderer/src/hooks/useUserSettingsRoot.ts'), 'utf8');

const defaultsBlock = configStore.slice(configStore.indexOf('const defaults: Config = {'), configStore.indexOf('\n};\n'));
const settings = [...defaultsBlock.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]!);

const tableStart = userSettings.indexOf('const setters: {');
const table = userSettings.slice(tableStart, userSettings.indexOf('\n    };\n', tableStart));
const reset = [...table.matchAll(/^ {6}(\w+): set\w+,$/gm)].map((match) => match[1]!);

describe('Reset all settings', () => {
  it('resets every setting that is not kept on purpose', () => {
    const kept: readonly string[] = keptByResetAllSettings;
    expect(settings.length).toBeGreaterThan(100);
    expect(settings.filter((key) => !kept.includes(key) && !reset.includes(key))).toEqual([]);
    expect(reset.filter((key) => kept.includes(key))).toEqual([]);
    expect(reset.filter((key) => !settings.includes(key))).toEqual([]);
  });

  it('brings back the clips folder offer and the mouse and keyboard values', () => {
    expect(reset).toEqual(expect.arrayContaining([
      'clipsFolder', 'clipsFolderOfferDismissed', 'wheelSensitivity', 'invertTimelineScroll', 'keyboardNormalSeekSpeed',
      'keyboardSeekSpeed2', 'keyboardSeekSpeed3', 'keyboardSeekAccFactor', 'mouseWheelZoomModifierKey',
      'mouseWheelFrameSeekModifierKey', 'mouseWheelKeyframeSeekModifierKey', 'segmentMouseModifierKey', 'extraMouseModifierKeys',
    ]));
  });

  it('leaves history, the window and the theme alone', () => {
    expect(keptByResetAllSettings).toEqual(expect.arrayContaining(['recentFiles', 'shelfOrder', 'windowBounds', 'darkMode']));
  });
});
