// File-system glue for the project files: copies, backups and the clean-up (kept apart so projectCleanup.ts and
// projectCopies.ts stay pure and testable, and projectFilesFs.ts can be tested on a real folder).
import JSON5 from 'json5';

import { cleanUpBackupsBeside, cleanUpProjects, getFoldersBesideRecordings, isCleanupDue, parseCleanupState } from './projectCleanup';
import type { ProjectCleanupState } from './projectCleanup';
import { findProjectCopies } from './projectCopies';
import type { ProjectMediaRef } from './projectCopies';
import createProjectFilesFs from './projectFilesFs';
import { getProjectsDir, getProjectStoreEnv } from './projectStore';
import { loadLlcProject } from './edlStore';
import { createWriteFileAtomically } from './util/atomicWrite';
import { trashFile } from './util';
import mainApi from './mainApi';

const { copyFile, lstat, readdir, readFile, rename, stat, unlink, writeFile } = window.require('fs/promises');
const { basename, dirname, isAbsolute, join } = window.require('path');

const writeFileAtomically = createWriteFileAtomically({ writeFile, rename, unlink, dirname, basename, join });

const projectFiles = createProjectFilesFs({
  lstat,
  stat,
  rename,
  copyFile,
  dirname,
  isAbsolute,
  readProject: (path) => loadLlcProject(path).catch(() => undefined),
});
export const { findNewestProjectFile, filterNotNewerThan, keepCopiesAboutToBeReplaced } = projectFiles;
const { getModifiedAt, getRecordingPresence } = projectFiles;

/** In ClipPress's settings folder, next to the projects folder. */
const cleanupStateFileName = 'project-cleanup.json';

async function listFolder(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch {
    return [];
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

async function readCleanupState(path: string): Promise<ProjectCleanupState> {
  try {
    return parseCleanupState(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return parseCleanupState(undefined);
  }
}

/**
 * The background clean-up of ClipPress's projects folder (see projectCleanup.ts), and of old backups beside the
 * recordings it knows of, if it is due: at most once a day. `trash` moves a file to the Recycle Bin; `whenIdle` resolves
 * when the app is idle.
 */
export async function runProjectCleanup({ trash, whenIdle, isCancelled, recentMediaPaths, customOutDir }: {
  trash: (path: string) => Promise<void>,
  whenIdle: () => Promise<void>,
  isCancelled: () => boolean,
  /** The recordings opened lately: "Next to the recording" may have kept backups beside them. */
  recentMediaPaths: readonly string[],
  customOutDir: string | undefined,
}) {
  const env = getProjectStoreEnv();
  const statePath = join(env.dataDir, cleanupStateFileName);
  const now = Date.now();
  const state = await readCleanupState(statePath);
  if (!isCleanupDue(state, now)) return;
  // Noted first, so a run that is cut short doesn't run again at every start that day.
  await writeFileAtomically(statePath, JSON.stringify({ ...state, lastRunAt: now }, null, 2));

  const folder = getProjectsDir(env);
  // The recordings with edits in ClipPress's folder: "Both" also keeps a copy beside each, with its backups.
  const mediaPaths: string[] = [];
  const result = await cleanUpProjects({
    list: () => listFolder(folder),
    modifiedAt: (fileName) => getModifiedAt(join(folder, fileName)),
    readMediaPath: async (fileName) => {
      const mediaPath = (await readProjectMediaRef(join(folder, fileName)))?.mediaFilePath;
      if (mediaPath != null) mediaPaths.push(mediaPath);
      return mediaPath;
    },
    presence: getRecordingPresence,
    trash: (fileName) => trash(join(folder, fileName)),
    whenIdle,
    isCancelled,
  }, { state, now });
  await writeFileAtomically(statePath, JSON.stringify(result.state, null, 2));

  const besideFolders = getFoldersBesideRecordings({
    mediaPaths: [...mediaPaths, ...recentMediaPaths],
    otherFolders: customOutDir != null ? [customOutDir] : [],
    projectsDir: folder,
  }, { dirname, isAbsolute, caseInsensitive: env.caseInsensitive });
  const beside = await cleanUpBackupsBeside(besideFolders, {
    list: listFolder,
    trash: (besideFolder, fileName) => trash(join(besideFolder, fileName)),
    whenIdle,
    isCancelled,
  }, now);

  const trashed = [
    ...result.trashed.map(({ fileName, reason }) => ({ path: join(folder, fileName), reason })),
    ...beside.trashed.map(({ folder: besideFolder, fileName }) => ({ path: join(besideFolder, fileName), reason: 'oldBackup' as const })),
  ];
  const failed = [
    ...result.failed.map(({ fileName, error }) => ({ path: join(folder, fileName), error })),
    ...beside.failed.map(({ folder: besideFolder, fileName, error }) => ({ path: join(besideFolder, fileName), error })),
  ];
  for (const { path, reason } of trashed) {
    logProjectFiles('info', `Project clean-up: moved to the Recycle Bin (${reason === 'oldBackup' ? 'a backup over 30 days old' : 'its recording has been gone for 30 days'}): ${path}`);
  }
  for (const { path, error } of failed) {
    logProjectFiles('warn', `Project clean-up: left ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const waiting = Object.keys(result.state.missingSince).length;
  logProjectFiles('info', `Project clean-up: done; ${trashed.length} moved to the Recycle Bin, ${waiting} kept for now with their recording not found`);
}
