import i18n from 'i18next';
import { beforeAll, describe, expect, test } from 'vitest';

import getUpdateMessage from './updateMessage';
import type { UpdateStatus } from '../../../common/updates';

const idle: UpdateStatus = { supported: true, phase: 'idle', installOnQuit: false, manual: false };

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: {} });
});

describe('update message', () => {
  test('idle never promises a check that will not run', () => {
    expect(getUpdateMessage(idle, i18n.t)).toBe('Not checked yet.');
    expect(getUpdateMessage(idle, i18n.t, false)).toBe('Automatic checks are off.');
    expect(getUpdateMessage({ ...idle, reason: 'offline' }, i18n.t)).toBe('Can\'t check for updates while networking is off.');
    expect(getUpdateMessage({ ...idle, supported: false, reason: 'development' }, i18n.t)).toBe('Updates are off in development builds.');
    expect(getUpdateMessage({ ...idle, supported: false, reason: 'multiple-instances' }, i18n.t, false)).toBe('Updates are off while several windows are allowed.');
  });

  test('names a release the way What\'s new does', () => {
    expect(getUpdateMessage({ ...idle, phase: 'available', version: '0.1.0-beta.6' }, i18n.t)).toBe('ClipPress Beta 6 is available.');
    expect(getUpdateMessage({ ...idle, phase: 'ready', version: '1.0.0', installOnQuit: false }, i18n.t)).toBe('ClipPress v1.0.0 is downloaded. Installation is paused.');
  });
});
