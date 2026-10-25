/**
 * Every copy of one recording's edits, to move them to the Recycle Bin with it (#91): the setting "Recycle edits with
 * the original"; those in older places once it opened and they are saved in ClipPress's folder; and those it left
 * behind when it was found somewhere else (#16). Only files that certainly are this recording's.
 */

import { getProjectLookupPaths, getRelocatedProjectCopies, getSidecarProjectPath, isReplacedBackupOf, isSameProjectPath } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';

/** What a project file says about its recording. */
export interface ProjectMediaRef {
  mediaFilePath?: string | undefined,
  mediaFileName?: string | undefined,
}

const fileNameOf = (path: string) => path.replaceAll('\\', '/').split('/').pop() ?? path;

/** Whether a project file names a recording other than the one at `mediaPath`: by its path, or (an older one) its name. */
function namesOtherRecording(mediaPath: string, project: ProjectMediaRef, env: ProjectStoreEnv) {
  if (project.mediaFilePath != null) return !isSameProjectPath(project.mediaFilePath, mediaPath, env.caseInsensitive);
  const fold = (name: string) => (env.caseInsensitive ? name.toLowerCase() : name);
  return project.mediaFileName != null && fold(project.mediaFileName) !== fold(fileNameOf(mediaPath));
}

/**
 * Whether the project file at `projectPath` holds the edits of the recording at `mediaPath`: it says so. One that names
 * another recording, or can't be read, doesn't; nor does an older one that doesn't say where its recording is, unless
 * it is next to it.
 */
export function isProjectOf(mediaPath: string, projectPath: string, project: ProjectMediaRef | undefined, env: ProjectStoreEnv) {
  if (project == null || namesOtherRecording(mediaPath, project, env)) return false;
  return project.mediaFilePath != null || isSameProjectPath(env.dirname(projectPath), env.dirname(mediaPath), env.caseInsensitive);
}

/**
 * The ones of these project files that hold the edits of the recording at `mediaPath` (see `isProjectOf`). One in the
 * export folder is named after its recording only, so it may be another recording's with the same name.
 */
export async function filterProjectsOf(mediaPath: string, paths: readonly string[], { env, read }: {
  env: ProjectStoreEnv,
  read: (projectPath: string) => Promise<ProjectMediaRef | undefined>,
}) {
  const kept: string[] = [];
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    if (isProjectOf(mediaPath, path, await read(path), env)) kept.push(path);
  }
  return kept;
}

/**
 * The ones of the copies of its edits found when a recording opened (`paths`, see `getProjectCopiesToRetire`) that are
 * its own, to move to the Recycle Bin once the edits are saved in ClipPress's folder: the one next to it, named after
 * it, whatever it notes (its folder may have moved); the one opened, unless it names another recording, as its edits
 * are saved for this one now; and any other that says it is this recording's (see `isProjectOf`). One in the export
 * folder is named after its recording only, so it may be another recording's with the same name: that one stays, as
 * does one that can't be told.
 */
export async function filterOwnProjectCopies(mediaPath: string, paths: readonly string[], { openedPath, env, read }: {
  /** The copy the edits were opened from. */
  openedPath: string,
  env: ProjectStoreEnv,
  /** What a project file says about its recording: undefined when it isn't there or can't be read. */
  read: (projectPath: string) => Promise<ProjectMediaRef | undefined>,
}) {
  const isSame = (a: string, b: string) => isSameProjectPath(a, b, env.caseInsensitive);
  const beside = getSidecarProjectPath(mediaPath, undefined, env);
  const own: string[] = [];
  for (const path of paths) {
    if (isSame(path, beside)) {
      own.push(path);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const project = await read(path);
      if (isProjectOf(mediaPath, path, project, env) || (isSame(path, openedPath) && project != null && !namesOtherRecording(mediaPath, project, env))) own.push(path);
    }
  }
  return own;
}

/**
 * Every copy of a recording's edits: in ClipPress's folder, in the export folder and next to the recording, with the
 * backups kept when one of them was replaced. Only the ones that are this recording's (see `isProjectOf`).
 */
export async function findProjectCopies(mediaPath: string, { customOutDir, env, list, read }: {
  customOutDir: string | undefined,
  env: ProjectStoreEnv,
  /** The file names in a folder: none when it can't be read. */
  list: (folder: string) => Promise<string[]>,
  /** What a project file says about its recording: undefined when it isn't there or can't be read. */
  read: (projectPath: string) => Promise<ProjectMediaRef | undefined>,
}) {
  const places = getProjectLookupPaths(mediaPath, 'app', customOutDir, env);
  const candidates = [...places];
  const folders = places.map((place) => env.dirname(place)).filter((folder, index, all) => all.indexOf(folder) === index);
  for (const folder of folders) {
    // eslint-disable-next-line no-await-in-loop
    const names = await list(folder);
    for (const place of places.filter((p) => env.dirname(p) === folder)) {
      const placeName = fileNameOf(place);
      candidates.push(...names.filter((name) => isReplacedBackupOf(placeName, name, env.caseInsensitive)).map((name) => env.join(folder, name)));
    }
  }

  return filterProjectsOf(mediaPath, candidates, { env, read });
}

/**
 * The copies of a recording's edits left at its old places once it is found somewhere else (#16), to move to the
 * Recycle Bin once the edits are saved for the new place: at each place it was (see `getRelocatedProjectCopies`), the
 * ones not saved later than the edits opened (from `openedPath`) that are its own (see `isProjectOf`). The file opened is
 * one, whatever recording it notes: one moved along with its recording still notes where they were before.
 */
export async function findRelocatedProjectCopies({ oldMediaPaths, newMediaPath, openedPath }: {
  /** Where the recording was, and isn't now. */
  oldMediaPaths: readonly string[],
  newMediaPath: string,
  openedPath: string,
}, { customOutDir, env, read, notNewerThan }: {
  customOutDir: string | undefined,
  env: ProjectStoreEnv,
  /** What a project file says about its recording: undefined when it isn't there or can't be read. */
  read: (projectPath: string) => Promise<ProjectMediaRef | undefined>,
  /** The ones of `paths` there and not saved later than `reference`. */
  notNewerThan: (paths: readonly string[], reference: string) => Promise<string[]>,
}) {
  const isSame = (a: string, b: string) => isSameProjectPath(a, b, env.caseInsensitive);
  const copies: string[] = [];
  for (const oldMediaPath of oldMediaPaths) {
    // eslint-disable-next-line no-await-in-loop
    const candidates = await notNewerThan(getRelocatedProjectCopies(oldMediaPath, newMediaPath, customOutDir, env), openedPath);
    const opened = candidates.filter((path) => isSame(path, openedPath));
    // eslint-disable-next-line no-await-in-loop
    const own = await filterProjectsOf(oldMediaPath, candidates.filter((path) => !isSame(path, openedPath)), { env, read });
    copies.push(...[...opened, ...own].filter((path) => !copies.some((copy) => isSame(copy, path))));
  }
  return copies;
}
