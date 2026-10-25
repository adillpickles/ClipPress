/**
 * Opening edits whose recording isn't where they say (#16): where it was, and whether a recording found somewhere else
 * is clearly not the one the edits were made on.
 */

import { isDurationValid } from './segments';
import { getSidecarProjectPath, isSameProjectPath } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';
import type { LlcProject } from './types';

type PathEnv = Pick<ProjectStoreEnv, 'join' | 'dirname'>;

/**
 * Where to look for a project's recording, in order: next to the project file under the name it noted, then at the
 * full path it noted (a project in ClipPress's folder isn't next to its recording).
 */
export function getProjectMediaCandidates(project: Pick<LlcProject, 'mediaFileName' | 'mediaFilePath'>, projectPath: string, env: PathEnv) {
  return [
    ...(project.mediaFileName ? [env.join(env.dirname(projectPath), project.mediaFileName)] : []),
    ...(project.mediaFilePath ? [project.mediaFilePath] : []),
  ];
}

/**
 * Where the recording was, to tell the user, to start looking there and to find the edits it left: the full path noted,
 * or else next to the project. But the recording's own project file next to it ("<name>-proj.llc", not the export
 * folder's) was last next to it: the full path it notes is out of date when the two were moved together and opened
 * from there without a change.
 */
export function getProjectMediaOldPath(project: Pick<LlcProject, 'mediaFileName' | 'mediaFilePath'>, projectPath: string, customOutDir: string | undefined, env: Pick<ProjectStoreEnv, 'join' | 'dirname' | 'parseName' | 'caseInsensitive'>) {
  const besideProject = project.mediaFileName ? env.join(env.dirname(projectPath), project.mediaFileName) : undefined;
  if (project.mediaFilePath == null) return besideProject;
  const isOwnProjectFile = besideProject != null
    && isSameProjectPath(getSidecarProjectPath(besideProject, undefined, env), projectPath, env.caseInsensitive)
    && (customOutDir == null || !isSameProjectPath(env.dirname(projectPath), customOutDir, env.caseInsensitive));
  return isOwnProjectFile ? besideProject : project.mediaFilePath;
}

/**
 * A folder short enough for one line, keeping what tells it apart: its drive (or share) and its last folders, as
 * "D:\…\Videos\Valorant".
 */
export function shortenFolderPath(folder: string, maxLength = 52) {
  if (folder.length <= maxLength) return folder;
  const separator = folder.includes('\\') ? '\\' : '/';
  const parts = folder.split(/[/\\]/);
  const unc = folder.startsWith('\\\\') || folder.startsWith('//');
  // The drive, the root, or a network path's server and share
  const head = parts.slice(0, unc ? 4 : 1).join(separator);
  const tail: string[] = [];
  for (let i = parts.length - 1; i >= (unc ? 4 : 1); i -= 1) {
    const next = [parts[i]!, ...tail].join(separator);
    if (tail.length > 0 && head.length + next.length + 3 > maxLength) break;
    tail.unshift(parts[i]!);
  }
  return [head, '…', ...tail].join(separator);
}

/** The recording's length as the project knows it: noted when saved, or the end of the untouched whole recording. */
export function getProjectMediaDuration(project: LlcProject) {
  if (isDurationValid(project.mediaDuration)) return project.mediaDuration;
  const [first, ...rest] = project.cutSegments;
  if (first != null && rest.length === 0 && first.initial === true && first.start === 0 && isDurationValid(first.end)) return first.end;
  return undefined;
}

/** Where the last clip or text ends. */
export function getProjectEditsEnd(project: LlcProject) {
  const ends = [...project.cutSegments.map(({ end }) => end), ...(project.overlayClips ?? []).map(({ end }) => end)].filter((end) => isDurationValid(end));
  return ends.length > 0 ? Math.max(...ends) : undefined;
}

export type DurationMismatch =
  /** The recording the edits were made on was `expected` seconds long. */
  | { kind: 'length', expected: number }
  /** The project doesn't know that length, but its edits run until `expected`. */
  | { kind: 'editsEnd', expected: number };

/** More than a second, or 1% of a long recording: a remux or a frame more or less isn't another recording. */
const tolerance = (seconds: number) => Math.max(1, seconds * 0.01);

/**
 * Whether a recording `duration` seconds long is clearly not the one the edits were made on: its length differs, or,
 * when the project doesn't know that length, the edits run past its end. Undefined when it fits, or can't be told.
 */
export function getDurationMismatch(project: LlcProject, duration: number | undefined): DurationMismatch | undefined {
  if (!isDurationValid(duration)) return undefined;
  const expected = getProjectMediaDuration(project);
  if (expected != null) return Math.abs(expected - duration) > tolerance(expected) ? { kind: 'length', expected } : undefined;
  const editsEnd = getProjectEditsEnd(project);
  return editsEnd != null && editsEnd - duration > tolerance(editsEnd) ? { kind: 'editsEnd', expected: editsEnd } : undefined;
}
