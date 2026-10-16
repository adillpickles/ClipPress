import { describe, expect, it } from 'vitest';

import { findInstallationDir, isWindowsPathInside } from './installation';
import type { InstallationFacts } from './installation';

const installed: InstallationFacts = {
  isPackaged: true,
  platform: 'win32',
  windowsStore: false,
  portableExecutableDir: undefined,
  exePath: '/programs/clippress/ClipPress.exe',
  resourcesPath: '/programs/clippress/resources',
  exists: (path) => path.replaceAll('\\', '/') === '/programs/clippress/resources/clippress-installed',
};

describe('findInstallationDir', () => {
  it('finds the folder of a copy installed by the installer', () => {
    expect(findInstallationDir(installed)).toBe('/programs/clippress');
  });

  it.each([
    ['the portable EXE', { portableExecutableDir: '/downloads' }],
    ['an unpacked build (no installer marker)', { exists: () => false }],
    ['development', { isPackaged: false }],
    ['a Store build', { windowsStore: true }],
    ['other platforms', { platform: 'linux' as const }],
  ])('finds none for %s', (_name, facts: Partial<InstallationFacts>) => {
    expect(findInstallationDir({ ...installed, ...facts })).toBeUndefined();
  });
});

describe('isWindowsPathInside', () => {
  const dir = String.raw`C:\Users\A\AppData\Local\Programs\clippress`;

  it.each([
    [dir, true],
    [`${dir}\\config`, true],
    [String.raw`c:\users\a\appdata\local\programs\CLIPPRESS\x`, true],
    [String.raw`C:\Users\A\AppData\Local\Programs\clippress-data`, false],
    [String.raw`C:\Users\A\AppData\Roaming\ClipPress`, false],
    [`${dir}\\..\\other`, false],
    [String.raw`D:\clippress`, false],
  ])('%s: %s', (path, inside) => {
    expect(isWindowsPathInside(path, dir)).toBe(inside);
  });
});
