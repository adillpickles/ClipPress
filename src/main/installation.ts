// eslint-disable-next-line import/no-extraneous-dependencies
import electron from 'electron';
import { existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
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

/**
 * Whether the Windows path `path` is `dir` or inside it, as written (case-insensitive, as Windows
 * paths are). Another name of the same folder is not recognised: see isWindowsFolderInside.
 */
export function isWindowsPathInside(path: string, dir: string) {
  const rel = win32.relative(dir, path);
  return rel === '' || (rel.split(win32.sep)[0] !== '..' && !win32.isAbsolute(rel));
}

export interface FolderFs {
  /** The canonical path of an existing file or folder (`fs.promises.realpath`, which resolves like `realpath.native`). */
  realpath: (path: string) => Promise<string>,
  /** The volume and file ID of an existing file or folder (`fs.promises.stat` with `bigint`). */
  identity: (path: string) => Promise<{ dev: bigint, ino: bigint }>,
}

const nodeFolderFs: FolderFs = {
  realpath: async (path) => realpath(path),
  identity: async (path) => stat(path, { bigint: true }),
};

const isMissing = (err: unknown) => err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR');

/**
 * Whether the Windows folder `path` is the folder `dir` or inside it, however either is written:
 * in another case, through a junction or symbolic link, by a short (8.3) name, as an
 * extended-length (`\\?\`) or device (`\\.\`) path, through a `subst` or mapped drive, or through
 * the administrative share of a local drive (`\\localhost\C$`). Each of these reaches the same
 * folder, so whatever is in it is deleted with `dir`.
 *
 * `path` need not exist yet: it is where it would be created, in the nearest folder that exists.
 * Rejects when it cannot tell, for example because a folder cannot be read: the caller should
 * then treat `path` as inside.
 */
export async function isWindowsFolderInside(path: string, dir: string, fs: FolderFs = nodeFolderFs) {
  const realDir = await fs.realpath(dir);
  const dirId = await fs.identity(dir);

  let existing = win32.resolve(path);
  const rest: string[] = [];
  let realExisting: string;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      realExisting = await fs.realpath(existing);
      break;
    } catch (err) {
      const parent = win32.dirname(existing);
      if (!isMissing(err) || parent === existing) throw err;
      rest.unshift(win32.basename(existing));
      existing = parent;
    }
  }
  if (isWindowsPathInside(win32.join(realExisting, ...rest), realDir)) return true;

  // A network path to a local folder resolves to itself, not to the local path: compare what the
  // folders are, from the nearest one that exists up (the rest does not exist, so it is not `dir`).
  if (dirId.ino === 0n) return false;
  for (let folder = realExisting; ; folder = win32.dirname(folder)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { dev, ino } = await fs.identity(folder);
      if (dev === dirId.dev && ino === dirId.ino) return true;
    } catch {
      // Not one that can be compared.
    }
    if (win32.dirname(folder) === folder) return false;
  }
}
