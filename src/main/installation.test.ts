import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { findInstallationDir, isWindowsFolderInside, isWindowsPathInside } from './installation';
import type { FolderFs, InstallationFacts } from './installation';

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

// PR #56 re-audit 3 finding 1: a settings folder was compared with the installation folder as
// written, so another name of a folder inside it (a junction, `\\?\`, a short name...) let an
// update delete it.
describe('isWindowsFolderInside', () => {
  const install = String.raw`C:\Users\A\AppData\Local\Programs\clippress`;
  const missing = (path: string) => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

  /** Folders that exist, by every name that reaches them, with their canonical path and identity. */
  function fakeFs(folders: Record<string, { real: string, id?: bigint, dev?: bigint }>, overrides: Partial<FolderFs> = {}): FolderFs {
    const find = (path: string) => folders[win32.resolve(path).toUpperCase()];
    return {
      realpath: async (path) => find(path)?.real ?? Promise.reject(missing(path)),
      identity: async (path) => {
        const folder = find(path);
        if (folder == null) throw missing(path);
        return { dev: folder.dev ?? 1n, ino: folder.id ?? 0n };
      },
      ...overrides,
    };
  }
  const folders = {
    [install.toUpperCase()]: { real: install, id: 10n },
    [String.raw`C:\USERS\A\APPDATA\LOCAL\PROGRAMS\CLIPPRESS\SETTINGS`]: { real: `${install}\\settings`, id: 11n },
    [String.raw`C:\USERS\A\APPDATA\LOCAL\PROGRAMS`]: { real: String.raw`C:\Users\A\AppData\Local\Programs`, id: 9n },
    [String.raw`C:\USERS\A\APPDATA\ROAMING\CLIPPRESS`]: { real: String.raw`C:\Users\A\AppData\Roaming\ClipPress`, id: 20n },
    'C:\\': { real: 'C:\\', id: 1n },
    'D:\\': { real: 'D:\\', id: 1n, dev: 2n },
    // A junction to the installation folder, and one to a folder inside it.
    [String.raw`D:\LINK`]: { real: install, id: 10n },
    [String.raw`D:\SETTINGS-LINK`]: { real: `${install}\\settings`, id: 11n },
    // A network path to it, which realpath leaves as it is.
    [String.raw`\\LOCALHOST\C$\USERS\A\APPDATA\LOCAL\PROGRAMS\CLIPPRESS`]: { real: String.raw`\\localhost\C$\Users\A\AppData\Local\Programs\clippress`, id: 10n },
    [String.raw`\\LOCALHOST\C$\USERS\A\APPDATA\LOCAL\PROGRAMS`]: { real: String.raw`\\localhost\C$\Users\A\AppData\Local\Programs`, id: 9n },
    '\\\\LOCALHOST\\C$\\': { real: '\\\\localhost\\C$\\', id: 1n },
    // A folder outside, whose name starts like it.
    [String.raw`C:\USERS\A\APPDATA\LOCAL\PROGRAMS\CLIPPRESS-DATA`]: { real: String.raw`C:\Users\A\AppData\Local\Programs\clippress-data`, id: 12n },
  };
  const fs = fakeFs(folders);

  it.each([
    ['the folder itself', install],
    ['a folder inside it', `${install}\\settings`],
    ['a folder inside it that does not exist yet', `${install}\\settings\\new\\deeper`],
    ['a junction to it', String.raw`D:\link`],
    ['a folder to be created behind a junction to it', String.raw`D:\link\settings\new`],
    ['a junction to a folder inside it', String.raw`D:\settings-link`],
    ['the administrative share of its drive', String.raw`\\localhost\C$\Users\A\AppData\Local\Programs\clippress\new`],
  ])('takes %s to be inside', async (_name, path) => {
    expect(await isWindowsFolderInside(path, install, fs)).toBe(true);
  });

  it.each([
    ['the app-data folder', String.raw`C:\Users\A\AppData\Roaming\ClipPress`],
    ['a folder whose name starts like it', String.raw`C:\Users\A\AppData\Local\Programs\clippress-data`],
    ['a folder next to it that does not exist yet', String.raw`C:\Users\A\AppData\Local\Programs\clippress2\x`],
    ['another drive', String.raw`D:\settings`],
  ])('takes %s to be outside', async (_name, path) => {
    expect(await isWindowsFolderInside(path, install, fs)).toBe(false);
  });

  it('compares a network path by what the folder is only when the volume gives folders an ID', async () => {
    const withoutIds = fakeFs(Object.fromEntries(Object.entries(folders).map(([name, folder]) => [name, { ...folder, id: 0n }])));
    expect(await isWindowsFolderInside(String.raw`\\localhost\C$\Users\A\AppData\Local\Programs\clippress`, install, withoutIds)).toBe(false);
    expect(await isWindowsFolderInside(String.raw`D:\link`, install, withoutIds)).toBe(true);
  });

  it('rejects when it cannot tell, so that the caller can take the folder to be inside', async () => {
    const denied = fakeFs(folders, { realpath: async (path) => { throw Object.assign(new Error(`EPERM: ${path}`), { code: 'EPERM' }); } });
    await expect(isWindowsFolderInside(String.raw`D:\settings`, install, denied)).rejects.toThrow('EPERM');
    await expect(isWindowsFolderInside(String.raw`D:\settings`, String.raw`E:\gone`, fs)).rejects.toThrow('ENOENT');
  });

  it('skips a folder above that cannot be compared', async () => {
    const identity = async (path: string) => {
      if (win32.resolve(path).toUpperCase() === String.raw`\\LOCALHOST\C$\USERS\A\APPDATA\LOCAL\PROGRAMS`) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return fs.identity(path);
    };
    expect(await isWindowsFolderInside(String.raw`\\localhost\C$\Users\A\AppData\Local\Programs\clippress`, install, { ...fs, identity })).toBe(true);
    expect(await isWindowsFolderInside(String.raw`C:\Users\A\AppData\Roaming\ClipPress`, install, { ...fs, identity })).toBe(false);
  });
});

describe.runIf(process.platform === 'win32')('isWindowsFolderInside on this Windows file system', () => {
  const root = mkdtempSync(join(tmpdir(), 'clippress-folder-inside-long-name-'));
  const install = join(root, 'Programs', 'clippress');
  const settings = join(install, 'settings');
  const outside = join(root, 'Roaming', 'ClipPress');
  mkdirSync(settings, { recursive: true });
  mkdirSync(outside, { recursive: true });
  const linkToInstall = join(root, 'link-to-install');
  const linkToOutside = join(root, 'link-to-outside');
  symlinkSync(install, linkToInstall, 'junction');
  symlinkSync(outside, linkToOutside, 'junction');
  const shortRoot = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${root}').ShortPath`], { windowsHide: true }).toString().trim();
  const adminShare = `\\\\localhost\\${settings[0]}$${settings.slice(2)}`;
  afterAll(() => {
    rmSync(linkToInstall);
    rmSync(linkToOutside);
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['as written', settings],
    ['in another case', settings.toUpperCase()],
    ['as an extended-length path', `\\\\?\\${settings}`],
    ['as a device path', `\\\\.\\${settings}`],
    ['through a junction', join(linkToInstall, 'settings')],
    ['to be created through a junction', join(linkToInstall, 'new', 'deeper')],
    ['by a short name', join(shortRoot, 'Programs', 'clippress', 'settings')],
  ])('finds a folder inside %s', async (_name, path) => {
    expect(await isWindowsFolderInside(path, install)).toBe(true);
  });

  it.runIf(existsSync(adminShare))('finds a folder inside through the administrative share', async () => {
    expect(await isWindowsFolderInside(adminShare, install)).toBe(true);
  });

  it('finds the installation folder however it is written itself', async () => {
    expect(await isWindowsFolderInside(settings, linkToInstall)).toBe(true);
    expect(await isWindowsFolderInside(join(linkToInstall, 'settings'), `\\\\?\\${install}`)).toBe(true);
  });

  it.each([
    ['the app-data folder', outside],
    ['a junction to it', linkToOutside],
    ['a folder next to the installation folder, whose name starts like it', `${install}-data`],
    ['with a trailing dot (another folder to Node.js)', `${install}.\\settings`],
  ])('keeps %s outside', async (_name, path) => {
    expect(await isWindowsFolderInside(path, install)).toBe(false);
  });
});
