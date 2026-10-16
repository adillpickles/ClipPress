import { constants, copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getConfigFileState } from './configFileRecovery.js';

const configFileName = 'config.json';

export interface InstallFolderConfigImport {
  /** The copy of the imported file kept with the settings, under the name it now has in the installation folder. */
  keptCopyPath: string,
  /** Whether its settings are now the app's settings. Not when the file could not be read. */
  adopted: boolean,
  /** Where the settings it replaced were kept, if there were any. */
  replacedSettingsBackupPath: string | undefined,
  /** Other settings files (backups) that were copied out of the installation folder. */
  copiedFiles: string[],
}

function isErrorCode(err: unknown, code: string) {
  return err instanceof Error && 'code' in err && err.code === code;
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
async function writeFileReplacing(path: string, content: string) {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, content);
    await rename(tmpPath, path);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
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
 * Nothing is deleted: the imported file is renamed (so it is imported only once), a copy of it is
 * kept in `configDir` under the same name, and other settings files there (backups the app made
 * next to it) are copied too. Throws if the file cannot be renamed, before changing any settings.
 */
export async function importInstallFolderConfig({ installDir, configDir, now }: {
  installDir: string,
  configDir: string,
  now: Date,
}): Promise<InstallFolderConfigImport | undefined> {
  const sourcePath = join(installDir, configFileName);
  let content: string;
  try {
    content = await readFile(sourcePath, 'utf8');
  } catch (err) {
    if (isErrorCode(err, 'ENOENT')) return undefined;
    throw err;
  }

  await mkdir(configDir, { recursive: true });

  const stamp = now.toISOString().replaceAll(/[:.]/gu, '-');
  const keptName = `${configFileName}.imported-${stamp}`;
  const keptCopyPath = join(configDir, keptName);
  // First a copy that cannot be lost, then the rename that stops a second import.
  await copyFile(sourcePath, keptCopyPath, constants.COPYFILE_EXCL);
  await rename(sourcePath, join(installDir, keptName));

  const copiedFiles: string[] = [];
  const otherSettingsFiles = (await readdir(installDir)).filter((name) => name.startsWith(`${configFileName}.`) && name !== keptName);
  for (const name of otherSettingsFiles) {
    // eslint-disable-next-line no-await-in-loop
    if (await copyIfAbsent(join(installDir, name), join(configDir, name))) copiedFiles.push(name);
  }

  // An unreadable file is kept (copied above), but the current settings stay in use.
  if (getConfigFileState(content) !== 'ok') return { keptCopyPath, adopted: false, replacedSettingsBackupPath: undefined, copiedFiles };

  const destinationPath = join(configDir, configFileName);
  let replacedSettingsBackupPath: string | undefined = `${destinationPath}.before-import-${stamp}`;
  try {
    // Exclusive: settings are never replaced without a backup of their own.
    await copyFile(destinationPath, replacedSettingsBackupPath, constants.COPYFILE_EXCL);
  } catch (err) {
    if (!isErrorCode(err, 'ENOENT')) throw err;
    replacedSettingsBackupPath = undefined;
  }
  await writeFileReplacing(destinationPath, content);
  return { keptCopyPath, adopted: true, replacedSettingsBackupPath, copiedFiles };
}
