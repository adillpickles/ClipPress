import { readdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import semver from 'semver';

/**
 * Left in the updater's folder for differential downloads (only what changed in the next update): electron-builder's
 * installer copies itself there, and electron-updater the update's block map. ClipPress downloads updates whole, so
 * nothing reads them.
 */
const differentialFiles = new Set(['installer.exe', 'current.blockmap']);

/** The version in an installer's name, e.g. `ClipPress-Setup-0.1.0-beta.6.exe`. */
export function getInstallerVersion(fileName: string) {
  const version = /(\d+\.\d+\.\d+(?:-[\da-z.-]+)?)\.exe$/i.exec(fileName)?.[1];
  return version != null && semver.valid(version) != null ? version : undefined;
}

/**
 * What to delete: the differential files, and the downloaded update once it's the running version or older (it was
 * installed). An update for a newer version waits to install when ClipPress closes: that stays.
 */
export function pickUpdaterLeftovers({ files, pendingFiles, runningVersion }: { files: string[], pendingFiles: string[] | undefined, runningVersion: string }) {
  const installer = pendingFiles?.find((name) => getInstallerVersion(name) != null);
  const pendingVersion = installer != null ? getInstallerVersion(installer) : undefined;
  return {
    files: files.filter((name) => differentialFiles.has(name.toLowerCase())),
    pending: pendingVersion != null && semver.lte(pendingVersion, runningVersion),
  };
}

/** electron-updater's folder: `%LOCALAPPDATA%\<updaterCacheDirName from app-update.yml>`. */
export async function getUpdaterCacheDir(resourcesPath: string, appName: string) {
  const config = await readFile(join(resourcesPath, 'app-update.yml'), 'utf8').catch(() => '');
  const dirName = /^updaterCacheDirName:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(config)?.[1]?.trim() ?? `${appName.toLowerCase()}-updater`;
  return join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), dirName);
}

/**
 * Deletes what the last update left behind (~290 MB otherwise kept for ever: the installer that ran, and its copy).
 * Run before anything new downloads.
 */
export default async function cleanUpdaterCache({ cacheDir, runningVersion }: { cacheDir: string, runningVersion: string }) {
  const files = await readdir(cacheDir).catch(() => undefined);
  if (files == null) return [];
  const pendingFiles = await readdir(join(cacheDir, 'pending')).catch(() => undefined);
  const leftovers = pickUpdaterLeftovers({ files, pendingFiles, runningVersion });
  const paths = [...leftovers.files.map((name) => join(cacheDir, name)), ...(leftovers.pending ? [join(cacheDir, 'pending')] : [])];
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
  return paths;
}

let cleaning: Promise<string[]> | undefined;

/** Once a run, a moment after the start, and before anything new downloads (autoUpdates.ts waits for it). */
export function cleanUpdaterCacheOnce({ resourcesPath, appName, runningVersion }: { resourcesPath: string, appName: string, runningVersion: string }) {
  cleaning ??= getUpdaterCacheDir(resourcesPath, appName)
    .then((cacheDir) => cleanUpdaterCache({ cacheDir, runningVersion }))
    .catch(() => []);
  return cleaning;
}
