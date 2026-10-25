/**
 * Every copy of one recording's edits, to move them to the Recycle Bin with it (#91): the setting "Recycle edits with
 * the original". Only files that certainly are this recording's.
 */

import { getProjectLookupPaths, isReplacedBackupOf, isSameProjectPath } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';

/** What a project file says about its recording. */
export interface ProjectMediaRef {
  mediaFilePath?: string | undefined,
  mediaFileName?: string | undefined,
}

const fileNameOf = (path: string) => path.replaceAll('\\', '/').split('/').pop() ?? path;

/**
 * Whether the project file at `projectPath` holds the edits of the recording at `mediaPath`: it says so. One that names
 * another recording, or can't be read, doesn't; nor does an older one that doesn't say where its recording is, unless
 * it is next to it.
 */
export function isProjectOf(mediaPath: string, projectPath: string, project: ProjectMediaRef | undefined, env: ProjectStoreEnv) {
  if (project == null) return false;
  if (project.mediaFilePath != null) return isSameProjectPath(project.mediaFilePath, mediaPath, env.caseInsensitive);
  const fold = (name: string) => (env.caseInsensitive ? name.toLowerCase() : name);
  return isSameProjectPath(env.dirname(projectPath), env.dirname(mediaPath), env.caseInsensitive)
    && (project.mediaFileName == null || fold(project.mediaFileName) === fold(fileNameOf(mediaPath)));
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
