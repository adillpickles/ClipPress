// File-system glue for the project files: copies, backups and the clean-up (kept apart so projectCleanup.ts and
// projectCopies.ts stay pure and testable).
import JSON5 from 'json5';

import { cleanUpProjects, isCleanupDue, parseCleanupState } from './projectCleanup';
import type { ProjectCleanupState, RecordingPresence } from './projectCleanup';
import { findProjectCopies } from './projectCopies';
import type { ProjectMediaRef } from './projectCopies';
import { getProjectsDir, getProjectStoreEnv, getReplacedBackupPath } from './projectStore';
import { loadLlcProject } from './edlStore';
import { isSameProjectEdits } from './llcProject';
import type { LlcProject } from './types';
import { createWriteFileAtomically } from './util/atomicWrite';
import { trashFile } from './util';
import mainApi from './mainApi';

const { copyFile, lstat, readdir, readFile, rename, stat, unlink, writeFile } = window.require('fs/promises');
const { basename, dirname, isAbsolute, join } = window.require('path');

const writeFileAtomically = createWriteFileAtomically({ writeFile, rename, unlink, dirname, basename, join });

const errorCode = (err: unknown) => (err instanceof Error && 'code' in err ? err.code : undefined);

/** In ClipPress's settings folder, next to the projects folder. */
const cleanupStateFileName = 'project-cleanup.json';

async function listFolder(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
}

async function getModifiedAt(path: string): Promise<number | undefined> {
  try {
    const stats = await lstat(path);
    return stats.isFile() ? stats.mtimeMs : undefined;
  } catch {
    return undefined;
  }
}

/** What a project file says about its recording; undefined when it isn't there or can't be read. */
async function readProjectMediaRef(projectPath: string): Promise<ProjectMediaRef | undefined> {
  try {
    const json: unknown = JSON5.parse(await readFile(projectPath, 'utf8'));
    if (json == null || typeof json !== 'object') return undefined;
    const { mediaFilePath, mediaFileName } = json as Record<string, unknown>;
    return {
      ...(typeof mediaFilePath === 'string' ? { mediaFilePath } : {}),
      ...(typeof mediaFileName === 'string' ? { mediaFileName } : {}),
    };
  } catch {
    return undefined;
  }
}

/** 'gone' only when the recording's folder is there (so its drive is connected) and the file certainly isn't. */
async function getRecordingPresence(mediaPath: string): Promise<RecordingPresence> {
  if (!isAbsolute(mediaPath)) return 'unknown';
  try {
    await lstat(mediaPath);
    return 'present';
  } catch (err) {
    if (errorCode(err) !== 'ENOENT') return 'unknown';
  }
  try {
    return (await stat(dirname(mediaPath))).isDirectory() ? 'gone' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Into the file log, where what ClipPress moved to the Recycle Bin by itself can be looked up later. */
export function logProjectFiles(level: 'info' | 'warn', message: string) {
  if (level === 'warn') console.warn(message); else console.log(message);
  mainApi.log(level, message).catch(() => undefined);
}

/**
 * "Recycle edits with the original": moves every copy of a recording's edits (see `findProjectCopies`) to the Recycle
 * Bin, after the recording itself went there. `deleteProjectFile` deletes between autosave's saves. Resolves with how
 * many went; one that can't is logged and left.
 */
export async function recycleRecordingProjectCopies(mediaPath: string, customOutDir: string | undefined, deleteProjectFile: (path: string, remove: () => Promise<void>) => Promise<void>) {
  const copies = await findProjectCopies(mediaPath, { customOutDir, env: getProjectStoreEnv(), list: listFolder, read: readProjectMediaRef });
  let recycled = 0;
  for (const copy of copies) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await deleteProjectFile(copy, () => trashFile(copy));
      recycled += 1;
      logProjectFiles('info', `Moved edits to the Recycle Bin with their recording ${mediaPath}: ${copy}`);
    } catch (err) {
      logProjectFiles('warn', `Could not move edits to the Recycle Bin with their recording: ${copy}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return recycled;
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

const readProject = (path: string): Promise<LlcProject | undefined> => loadLlcProject(path).catch(() => undefined);

/**
 * Before autosave writes the edits being opened (loaded from `sourcePath`) to `savePaths`: a different copy already in
 * one of those places would be replaced without a word (file times can mislead, e.g. a restored old copy), so it is
 * kept under another name next to it instead (see `getReplacedBackupPath`). A copy of the same edits, however it was
 * written, needs none: resolves with those, which already hold what is loaded.
 */
export async function keepCopiesAboutToBeReplaced(savePaths: readonly string[], sourcePath: string) {
  const same: string[] = [];
  let incoming: Promise<LlcProject | undefined> | undefined;
  for (const savePath of savePaths) {
    // eslint-disable-next-line no-await-in-loop, no-continue
    if (savePath === sourcePath || await getModifiedAt(savePath) == null) continue;
    incoming ??= readProject(sourcePath);
    // eslint-disable-next-line no-await-in-loop
    const [existing, loaded] = await Promise.all([readProject(savePath), incoming]);
    // Edits that can't be read won't load, so nothing will be written over the copy.
    if (loaded == null) return [];
    if (existing != null && isSameProjectEdits(existing, loaded)) {
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

async function readCleanupState(path: string): Promise<ProjectCleanupState> {
  try {
    return parseCleanupState(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return parseCleanupState(undefined);
  }
}

/**
 * The background clean-up of ClipPress's projects folder (see projectCleanup.ts), if it is due: at most once a day.
 * `trash` moves a file to the Recycle Bin; `whenIdle` resolves when the app is idle.
 */
export async function runProjectCleanup({ trash, whenIdle, isCancelled }: {
  trash: (path: string) => Promise<void>,
  whenIdle: () => Promise<void>,
  isCancelled: () => boolean,
}) {
  const env = getProjectStoreEnv();
  const statePath = join(env.dataDir, cleanupStateFileName);
  const now = Date.now();
  const state = await readCleanupState(statePath);
  if (!isCleanupDue(state, now)) return;
  // Noted first, so a run that is cut short doesn't run again at every start that day.
  await writeFileAtomically(statePath, JSON.stringify({ ...state, lastRunAt: now }, null, 2));

  const folder = getProjectsDir(env);
  const result = await cleanUpProjects({
    list: () => listFolder(folder),
    modifiedAt: (fileName) => getModifiedAt(join(folder, fileName)),
    readMediaPath: async (fileName) => (await readProjectMediaRef(join(folder, fileName)))?.mediaFilePath,
    presence: getRecordingPresence,
    trash: (fileName) => trash(join(folder, fileName)),
    whenIdle,
    isCancelled,
  }, { state, now });
  await writeFileAtomically(statePath, JSON.stringify(result.state, null, 2));

  for (const { fileName, reason } of result.trashed) {
    logProjectFiles('info', `Project clean-up: moved to the Recycle Bin (${reason === 'oldBackup' ? 'a backup over 30 days old' : 'its recording has been gone for 30 days'}): ${join(folder, fileName)}`);
  }
  for (const { fileName, error } of result.failed) {
    logProjectFiles('warn', `Project clean-up: left ${join(folder, fileName)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const waiting = Object.keys(result.state.missingSince).length;
  logProjectFiles('info', `Project clean-up: done; ${result.trashed.length} moved to the Recycle Bin, ${waiting} kept for now with their recording not found`);
}
