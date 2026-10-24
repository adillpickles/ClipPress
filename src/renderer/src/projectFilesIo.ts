// File-system glue for the project files: copies and backups.
import JSON5 from 'json5';
import isEqual from 'lodash/isEqual';

import { getReplacedBackupPath } from './projectStore';
import mainApi from './mainApi';

const { copyFile, lstat, readFile, rename } = window.require('fs/promises');

async function getModifiedAt(path: string): Promise<number | undefined> {
  try {
    const stats = await lstat(path);
    return stats.isFile() ? stats.mtimeMs : undefined;
  } catch {
    return undefined;
  }
}

/** Into the file log, where what ClipPress moved to the Recycle Bin by itself can be looked up later. */
export function logProjectFiles(level: 'info' | 'warn', message: string) {
  if (level === 'warn') console.warn(message); else console.log(message);
  mainApi.log(level, message).catch(() => undefined);
}

/** The most recently saved of these project files; undefined when none is there. */
export async function findNewestProjectFile(paths: readonly string[]) {
  let newest: { path: string, mtimeMs: number } | undefined;
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    const mtimeMs = await getModifiedAt(path);
    if (mtimeMs != null && (newest == null || mtimeMs > newest.mtimeMs)) newest = { path, mtimeMs };
  }
  return newest?.path;
}

/** The ones of `paths` that are there and not newer than `reference`: superseded by the edits loaded from it. */
export async function filterNotNewerThan(paths: readonly string[], reference: string) {
  const referenceTime = await getModifiedAt(reference);
  const kept: string[] = [];
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    const mtimeMs = path === reference ? referenceTime : await getModifiedAt(path);
    if (mtimeMs != null && referenceTime != null && mtimeMs <= referenceTime) kept.push(path);
  }
  return kept;
}

async function readJson5(path: string): Promise<unknown> {
  return JSON5.parse(await readFile(path, 'utf8'));
}

/**
 * Before autosave writes the edits being opened (loaded from `sourcePath`) to `savePaths`: a different copy already in
 * one of those places would be replaced without a word (file times can mislead, e.g. a restored old copy), so it is
 * kept under another name next to it instead (see `getReplacedBackupPath`). A copy of the same edits needs none:
 * resolves with those, which already hold what is loaded.
 */
export async function keepCopiesAboutToBeReplaced(savePaths: readonly string[], sourcePath: string) {
  const same: string[] = [];
  let incoming: Promise<unknown> | undefined;
  for (const savePath of savePaths) {
    // eslint-disable-next-line no-await-in-loop, no-continue
    if (savePath === sourcePath || await getModifiedAt(savePath) == null) continue;
    incoming ??= readJson5(sourcePath).catch(() => undefined);
    // eslint-disable-next-line no-await-in-loop
    const [existing, loaded] = await Promise.all([readJson5(savePath).catch(() => undefined), incoming]);
    // Edits that can't be read won't load, so nothing will be written over the copy.
    if (loaded === undefined) return [];
    if (existing !== undefined && isEqual(existing, loaded)) {
      same.push(savePath);
      // eslint-disable-next-line no-continue
      continue;
    }
    const backupPath = getReplacedBackupPath(savePath, Date.now());
    try {
      // eslint-disable-next-line no-await-in-loop
      await rename(savePath, backupPath);
    } catch (renameErr) {
      // Locked, or the folder doesn't allow renaming: a copy keeps it just as well. And if even that fails, the newer
      // edits still load (a file that can't be read can't be written over either).
      // eslint-disable-next-line no-await-in-loop
      await copyFile(savePath, backupPath).catch((copyErr: unknown) => console.warn('Could not keep a copy of the project before replacing it', savePath, renameErr, copyErr));
    }
  }
  return same;
}
