import { access, constants, copyFile, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, win32 } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getConfigFileState } from './configFileRecovery.js';

const configFileName = 'config.json';
/** A copy of the installation folder's settings file, in the app-data folder, while it is imported. */
const importingPrefix = `${configFileName}.importing-`;
/** The same copy once the import has finished (and the name the original gets in the installation folder). */
const importedPrefix = `${configFileName}.imported-`;

export interface InstallFolderConfigImport {
  /** The copy of the imported file kept with the settings, under the name it now has in the installation folder. */
  keptCopyPath: string,
  /** Whether its settings are now the app's settings. Not when the file could not be read. */
  adopted: boolean,
  /** Where the settings it replaced were kept, if there were any. */
  replacedSettingsBackupPath: string | undefined,
  /** Other settings files (backups) that were copied out of the installation folder. */
  copiedFiles: string[],
  /** Whether this finished an import that an earlier start began but could not finish. */
  resumed: boolean,
}

function isErrorCode(err: unknown, code: string) {
  return err instanceof Error && 'code' in err && err.code === code;
}

const toStamp = (date: Date) => date.toISOString().replaceAll(/[:.]/gu, '-');

/** Retries a step that Windows can fail for a moment, such as while a virus scanner reads the file. */
async function retryBusy<T>(step: () => Promise<T>, delayMs: number): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await step();
    } catch (err) {
      if (attempt >= 3 || !['EBUSY', 'EPERM', 'EACCES'].some((code) => isErrorCode(err, code))) throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(delayMs * attempt);
  }
}

async function ignoringMissing<T>(step: () => Promise<T>) {
  try {
    return await step();
  } catch (err) {
    if (isErrorCode(err, 'ENOENT')) return undefined;
    throw err;
  }
}

async function copyIfAbsent(from: string, to: string) {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    return true;
  } catch (err) {
    if (isErrorCode(err, 'EEXIST')) return false;
    throw err;
  }
}

/** Replaces `path` so that a crash leaves either the old or the new content, never a mix. */
async function writeFileReplacing(path: string, content: string, encoding: BufferEncoding = 'utf8') {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, content, encoding);
    await rename(tmpPath, path);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}

/**
 * The name of an unfinished import's copy in `configDir`, if an earlier start left one. Two at once
 * mean that two instances started together, or that the installer copied the file again
 * (`config.json.importing-<time>-installer`) before a start could finish: only the newest is used,
 * as the latest state of the file. Both the app and the installer name copies by the UTC time, so
 * that the names sort by when they were made.
 */
async function findUnfinishedImport(configDir: string) {
  const names = (await ignoringMissing(() => readdir(configDir)) ?? []).filter((name) => name.startsWith(importingPrefix)).sort();
  for (const older of names.slice(0, -1)) {
    // eslint-disable-next-line no-await-in-loop
    await ignoringMissing(() => rename(join(configDir, older), join(configDir, `${importedPrefix}${older.slice(importingPrefix.length)}`)));
  }
  return names.at(-1);
}

/**
 * Moves settings out of the installation folder of an installed copy, into `configDir`.
 *
 * A `config.json` next to the executable makes ClipPress keep its settings in that file, which is
 * how the portable download can keep settings beside itself. In an installed copy, though, the
 * installer owns that folder and deletes it on every update and reinstall, settings included. So
 * installed copies keep their settings in the app-data folder, and import a `config.json` found next
 * to the executable instead of using it in place. That file held the settings in use, so it replaces
 * the app-data settings (which are kept as a backup).
 *
 * Nothing is deleted. First the file is copied into `configDir` as `config.json.importing-<time>`;
 * from then on, an import that fails or is interrupted (a locked file, a crash) is finished from
 * that copy on a later start, rather than lost or repeated. Then the original is renamed (so it is
 * not imported again), other settings files there (backups the app made next to it) are copied,
 * and the settings are replaced. Last, the copy is renamed to `config.json.imported-<time>`, which
 * marks the import as finished. Throws if a step fails; until then, the current settings stay.
 */
export async function importInstallFolderConfig({ installDir, configDir, now, retryDelayMs = 100 }: {
  installDir: string,
  configDir: string,
  now: Date,
  /** How long to wait before retrying a step that the file being in use made fail. */
  retryDelayMs?: number,
}): Promise<InstallFolderConfigImport | undefined> {
  const retry = <T>(step: () => Promise<T>) => retryBusy(step, retryDelayMs);
  const sourcePath = join(installDir, configFileName);

  let copyName = await findUnfinishedImport(configDir);
  const resumed = copyName != null;
  if (copyName == null) {
    if (await ignoringMissing(() => retry(() => readFile(sourcePath))) === undefined) return undefined;
    await mkdir(configDir, { recursive: true });
    const name = `${importingPrefix}${toStamp(now)}`;
    // First a copy that survives the installation folder being deleted.
    await retry(() => copyFile(sourcePath, join(configDir, name), constants.COPYFILE_EXCL));
    copyName = name;
  }
  const copyPath = join(configDir, copyName);
  const keptName = `${importedPrefix}${copyName.slice(importingPrefix.length)}`;
  const content = await retry(() => readFile(copyPath, 'utf8'));

  // Stop the original from being imported again. Unless an earlier attempt did, or it is a newer
  // file (put there after that attempt), which a later start imports in turn.
  const source = await ignoringMissing(() => retry(() => readFile(sourcePath, 'utf8')));
  if (source === content) await ignoringMissing(() => retry(() => rename(sourcePath, join(installDir, keptName))));

  const copiedFiles: string[] = [];
  const otherSettingsFiles = (await ignoringMissing(() => readdir(installDir)) ?? []).filter((name) => name.startsWith(`${configFileName}.`) && name !== keptName);
  for (const name of otherSettingsFiles) {
    // eslint-disable-next-line no-await-in-loop
    if (await retry(() => copyIfAbsent(join(installDir, name), join(configDir, name)))) copiedFiles.push(name);
  }

  // An unreadable file is kept, but the current settings stay in use.
  const adopted = getConfigFileState(content) === 'ok';
  let replacedSettingsBackupPath: string | undefined;
  if (adopted) {
    const destinationPath = join(configDir, configFileName);
    const current = await ignoringMissing(() => retry(() => readFile(destinationPath, 'utf8')));
    // Already in use when an earlier attempt got this far.
    if (current !== content) {
      if (current !== undefined) {
        // Exclusive: settings are never replaced without a backup of their own.
        const backupPath = `${destinationPath}.before-import-${toStamp(now)}`;
        await retry(() => copyFile(destinationPath, backupPath, constants.COPYFILE_EXCL));
        replacedSettingsBackupPath = backupPath;
      }
      await retry(() => writeFileReplacing(destinationPath, content));
    }
  }

  // Finished. Another instance finishing the same import at once has renamed it already.
  await ignoringMissing(() => retry(() => rename(copyPath, join(configDir, keptName))));
  return { keptCopyPath: join(configDir, keptName), adopted, replacedSettingsBackupPath, copiedFiles, resumed };
}

/**
 * In the installation folder, lists the settings folders that ClipPress has used from inside the
 * installation folder (`--config-dir` folders there), one per line. The installer
 * (script/installer.nsh) installs nothing while one of them has a `config.json`, because
 * installing deletes the installation folder.
 */
export const settingsFoldersNoteFileName = 'clippress-settings-folders.txt';

const sameWindowsPath = (a: string, b: string) => win32.resolve(a).toLowerCase() === win32.resolve(b).toLowerCase();

/**
 * Tells the installer about `settingsDir`, a settings folder in use inside the installation folder
 * (or undefined: none is), on top of those it was told about before that still have settings
 * there (`stillHasSettings`). The installer cannot know by itself where `--config-dir` points, nor
 * where it pointed at another start: without this, running it by hand would delete those settings.
 */
export async function noteSettingsFoldersForInstaller({ installDir, settingsDir, stillHasSettings }: {
  installDir: string,
  settingsDir: string | undefined,
  /** Whether a folder noted before still has settings inside the installation folder. Should say yes when it cannot tell. */
  stillHasSettings: (dir: string) => Promise<boolean>,
}) {
  const notePath = join(installDir, settingsFoldersNoteFileName);
  const noted = (await ignoringMissing(() => readFile(notePath, 'utf16le')) ?? '').split(/\r?\n/u).filter((line) => line !== '');
  const folders: string[] = [];
  for (const dir of noted) {
    // eslint-disable-next-line no-await-in-loop
    if (!folders.some((other) => sameWindowsPath(other, dir)) && await stillHasSettings(dir)) folders.push(dir);
  }
  if (settingsDir != null && !folders.some((other) => sameWindowsPath(other, settingsDir))) folders.push(resolve(settingsDir));
  // UTF-16LE without a BOM, a line each, as the installer reads it (FileReadUTF16LE).
  await (folders.length > 0 ? writeFileReplacing(notePath, folders.map((dir) => `${dir}\r\n`).join(''), 'utf16le') : rm(notePath, { force: true }));
  return folders;
}

export type InstallFolderSettingsOutcome =
  | { settingsLeft: false, imported: InstallFolderConfigImport | undefined }
  | { settingsLeft: true, imported?: InstallFolderConfigImport | undefined, error?: unknown };

/**
 * Imports settings from the installation folder (importInstallFolderConfig), and says whether
 * settings are still left there. Then installing an update would delete them, and with them,
 * possibly the only copy of the user's settings: the import may have failed before it could make
 * a copy, and until it finishes, the settings in use are not the user's either. Never throws.
 */
export async function moveSettingsOutOfInstallFolder(options: Parameters<typeof importInstallFolderConfig>[0]): Promise<InstallFolderSettingsOutcome> {
  let imported: InstallFolderConfigImport | undefined;
  try {
    imported = await importInstallFolderConfig(options);
  } catch (error) {
    return { settingsLeft: true, error };
  }
  // A newer file put there after an earlier, unfinished import is imported at a later start.
  try {
    await access(join(options.installDir, configFileName));
    return { settingsLeft: true, imported };
  } catch (err) {
    // Unless it is certainly gone, it may still be there.
    if (isErrorCode(err, 'ENOENT')) return { settingsLeft: false, imported };
    return { settingsLeft: true, imported, error: err };
  }
}
