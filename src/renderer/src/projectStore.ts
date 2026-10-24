/**
 * Where a recording's edits (its .llc project) are kept.
 *
 * By default they live in ClipPress's own folder (`<settings folder>/Projects`), not next to the recording, so
 * recording folders don't fill up with project files. Each recording gets one file there, named after the
 * recording plus a short hash of its full path, so two recordings with the same name in different folders
 * don't share edits. Projects saved next to recordings (older versions, or the setting) still load. "Both" keeps a
 * copy in each place, and loading takes the newest.
 */

import type { ProjectFileLocation } from '../../common/types';

export const projectSuffix = 'proj.llc';
const projectsFolderName = 'Projects';

/** FNV-1a, twice with different seeds: a stable 64-bit name for a path. Not for security. */
/* eslint-disable no-bitwise */
function hash64(text: string) {
  let a = 0x811C_9DC5;
  let b = 0x0100_0193 ^ 0x5BD1_E995;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.codePointAt(i)!;
    a = Math.imul(a ^ c, 0x0100_0193) >>> 0;
    b = Math.imul(b ^ c, 0x0100_0193 + 0x2_0000) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
/* eslint-enable no-bitwise */

/**
 * The same recording, whichever way its absolute path was written: slashes, "." and "..", doubled separators, and
 * case on Windows and macOS.
 */
export function normaliseMediaPath(mediaPath: string, caseInsensitive: boolean) {
  const slashes = mediaPath.replaceAll('\\', '/');
  const isUnc = slashes.startsWith('//');
  // What ".." can't go above: the drive or root, or a network path's server and share
  const rootParts = isUnc ? 3 : 1;
  const parts: string[] = [];
  slashes.split('/').forEach((part, index) => {
    if (part === '.' || (part === '' && index > 0)) return;
    if (part === '..') {
      if (parts.length > rootParts) parts.pop();
      return;
    }
    parts.push(part);
  });
  const normalised = `${isUnc ? '/' : ''}${parts.join('/')}`;
  return caseInsensitive ? normalised.toLowerCase() : normalised;
}

/** "<recording name>-<hash>.llc": readable when browsing the folder, unique per recording. */
export function getStoredProjectFileName(mediaPath: string, caseInsensitive: boolean) {
  const base = mediaPath.replaceAll('\\', '/').split('/').pop() ?? 'recording';
  const name = base.replace(/\.[^.]*$/, '')
    // Characters Windows doesn't allow in names, and control characters
    // eslint-disable-next-line no-control-regex
    .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .slice(0, 60)
    .trim() || 'recording';
  return `${name}-${hash64(normaliseMediaPath(mediaPath, caseInsensitive))}.llc`;
}

export interface ProjectStoreEnv {
  join: (...parts: string[]) => string,
  dirname: (path: string) => string,
  /** The file name without its extension, as `path.parse(path).name`. */
  parseName: (path: string) => string,
  dataDir: string,
  caseInsensitive: boolean,
}

export function getProjectsDir(env: ProjectStoreEnv) {
  return env.join(env.dataDir, projectsFolderName);
}

export function getStoredProjectPath(mediaPath: string, env: ProjectStoreEnv) {
  return env.join(getProjectsDir(env), getStoredProjectFileName(mediaPath, env.caseInsensitive));
}

/** Older and opt-in places: next to the recording ("<name>-proj.llc"), or in the export folder. */
export function getSidecarProjectPath(mediaPath: string, folder: string | undefined, env: ProjectStoreEnv) {
  return env.join(folder ?? env.dirname(mediaPath), `${env.parseName(mediaPath)}-${projectSuffix}`);
}

/** Where autosave writes for this setting: the main place, ClipPress's folder for "Both". */
export function getProjectSavePath(mediaPath: string, location: ProjectFileLocation, customOutDir: string | undefined, env: ProjectStoreEnv) {
  if (location === 'app' || location === 'both') return getStoredProjectPath(mediaPath, env);
  return getSidecarProjectPath(mediaPath, location === 'exportFolder' ? customOutDir : undefined, env);
}

/** Every place autosave writes for this setting, the main one first: "Both" also keeps a copy next to the recording. */
export function getProjectSavePaths(mediaPath: string, location: ProjectFileLocation, customOutDir: string | undefined, env: ProjectStoreEnv) {
  const main = getProjectSavePath(mediaPath, location, customOutDir, env);
  return location === 'both' ? [main, getSidecarProjectPath(mediaPath, undefined, env)] : [main];
}

/** The same project file, however its path is written. */
export function isSameProjectPath(a: string, b: string, caseInsensitive: boolean) {
  return normaliseMediaPath(a, caseInsensitive) === normaliseMediaPath(b, caseInsensitive);
}

/**
 * Copies of a recording's edits found where the setting doesn't save, to move to the Recycle Bin once the project is
 * saved where it does. Only while ClipPress's folder keeps the edits ("In ClipPress" or "Both"), and never a place the
 * setting writes to: "Both" keeps the copy next to the recording.
 */
export function getProjectCopiesToRetire(found: readonly string[], location: ProjectFileLocation, savePaths: readonly string[], caseInsensitive: boolean) {
  if (location !== 'app' && location !== 'both') return [];
  return found.filter((path) => !savePaths.some((savePath) => isSameProjectPath(savePath, path, caseInsensitive)));
}

/** Where a different copy that is about to be replaced is kept, next to it: "<name>.replaced-<time>.llc". */
export function getReplacedBackupPath(projectPath: string, time: number) {
  const stamp = new Date(time).toISOString().replaceAll(/[:.]/g, '-');
  return projectPath.replace(/\.llc$/i, `.replaced-${stamp}.llc`);
}

/**
 * Where to look for a recording's edits, best first: where the setting saves now, then the other places, so
 * edits saved before the setting changed (or by an older version) are still found.
 */
export function getProjectLookupPaths(mediaPath: string, location: ProjectFileLocation, customOutDir: string | undefined, env: ProjectStoreEnv) {
  const paths = [
    getProjectSavePath(mediaPath, location, customOutDir, env),
    getStoredProjectPath(mediaPath, env),
    ...(customOutDir != null ? [getSidecarProjectPath(mediaPath, customOutDir, env)] : []),
    getSidecarProjectPath(mediaPath, undefined, env),
  ];
  return paths.filter((path, index) => paths.indexOf(path) === index);
}

/** The real environment: Node's path module and ClipPress's settings folder (the portable one, if any). */
let renderEnv: ProjectStoreEnv | undefined;
export function getProjectStoreEnv(): ProjectStoreEnv {
  if (renderEnv == null) {
    const path = window.require('path');
    const { mkdirSync } = window.require('fs');
    const remote = window.require('@electron/remote');
    const { configStore, isWindows, isMac } = remote.require('./index.js');
    renderEnv = {
      join: path.join,
      dirname: path.dirname,
      parseName: (p: string) => path.parse(p).name,
      dataDir: configStore.getDataDir(),
      caseInsensitive: isWindows || isMac,
    };
    // Made once, up front: saving checks the folder's real path synchronously.
    try {
      mkdirSync(getProjectsDir(renderEnv), { recursive: true });
    } catch (err) {
      console.error('Could not create the projects folder', err);
    }
  }
  return renderEnv;
}
