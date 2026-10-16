// eslint-disable-next-line import/no-extraneous-dependencies
import electron from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, win32 } from 'node:path';

/** Written into `resources` by the Windows installer (script/installer.nsh), never by other packages. */
export const installedMarkerFileName = 'clippress-installed';

export interface InstallationFacts {
  isPackaged: boolean,
  platform: NodeJS.Platform,
  windowsStore: boolean,
  /** `PORTABLE_EXECUTABLE_DIR`, set by the portable EXE's launcher. */
  portableExecutableDir: string | undefined,
  exePath: string,
  resourcesPath: string,
  exists: (path: string) => boolean,
}

/**
 * The folder ClipPress was installed into by the Windows installer, or undefined for every other
 * copy: the portable EXE, an unpacked build, development, the Store, and other platforms.
 *
 * That folder belongs to the installer. Each update and each reinstall deletes it completely,
 * including files that the installer did not put there, so no user data may live in it.
 */
export function findInstallationDir({ isPackaged, platform, windowsStore, portableExecutableDir, exePath, resourcesPath, exists }: InstallationFacts) {
  if (!isPackaged || platform !== 'win32' || windowsStore || portableExecutableDir != null) return undefined;
  if (!exists(join(resourcesPath, installedMarkerFileName))) return undefined;
  return dirname(exePath);
}

let installationDir: { dir: string | undefined } | undefined;

export function getInstallationDir() {
  installationDir ??= {
    dir: findInstallationDir({
      isPackaged: electron.app.isPackaged,
      platform: process.platform,
      windowsStore: !!process.windowsStore,
      portableExecutableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
      exePath: electron.app.getPath('exe'),
      resourcesPath: process.resourcesPath,
      exists: existsSync,
    }),
  };
  return installationDir.dir;
}

/** Whether the Windows path `path` is `dir` or inside it (case-insensitive, as Windows paths are). */
export function isWindowsPathInside(path: string, dir: string) {
  const rel = win32.relative(dir, path);
  return rel === '' || (rel.split(win32.sep)[0] !== '..' && !win32.isAbsolute(rel));
}
