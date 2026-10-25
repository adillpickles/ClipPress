// The file-system steps behind moving a recording's edits around (#16, #90, #91): given the file system, so they can
// be tested on a real folder. projectFilesIo.ts gives them Node's.
import { isSameProjectEdits } from './llcProject';
import type { RecordingPresence } from './projectCleanup';
import { getReplacedBackupPath } from './projectStore';
import type { LlcProject } from './types';

export interface ProjectFilesFs {
  lstat: (path: string) => Promise<{ isFile: () => boolean, mtimeMs: number }>,
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>,
  rename: (oldPath: string, newPath: string) => Promise<void>,
  copyFile: (source: string, target: string) => Promise<void>,
  dirname: (path: string) => string,
  isAbsolute: (path: string) => boolean,
  /** A project file's edits; undefined when it isn't there or can't be read. */
  readProject: (path: string) => Promise<LlcProject | undefined>,
}

const errorCode = (err: unknown) => (err instanceof Error && 'code' in err ? err.code : undefined);

export default function createProjectFilesFs({ lstat, stat, rename, copyFile, dirname, isAbsolute, readProject }: ProjectFilesFs) {
  /** When a file last changed; undefined when it isn't there (or isn't a file). */
  async function getModifiedAt(path: string): Promise<number | undefined> {
    try {
      const stats = await lstat(path);
      return stats.isFile() ? stats.mtimeMs : undefined;
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

  /** The most recently saved of these project files; undefined when none is there. */
  async function findNewestProjectFile(paths: readonly string[]) {
    let newest: { path: string, mtimeMs: number } | undefined;
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      const mtimeMs = await getModifiedAt(path);
      if (mtimeMs != null && (newest == null || mtimeMs > newest.mtimeMs)) newest = { path, mtimeMs };
    }
    return newest?.path;
  }

  /** The ones of `paths` that are there and not newer than `reference`: superseded by the edits loaded from it. */
  async function filterNotNewerThan(paths: readonly string[], reference: string) {
    const referenceTime = await getModifiedAt(reference);
    const kept: string[] = [];
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      const mtimeMs = path === reference ? referenceTime : await getModifiedAt(path);
      if (mtimeMs != null && referenceTime != null && mtimeMs <= referenceTime) kept.push(path);
    }
    return kept;
  }

  /**
   * Before autosave writes the edits being opened (loaded from `sourcePath`) to `savePaths`: a different copy already in
   * one of those places would be replaced without a word (file times can mislead, e.g. a restored old copy), so it is
   * kept under another name next to it instead (see `getReplacedBackupPath`). A copy of the same edits, however it was
   * written, needs none: resolves with those, which already hold what is loaded.
   */
  async function keepCopiesAboutToBeReplaced(savePaths: readonly string[], sourcePath: string) {
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

  return { getModifiedAt, getRecordingPresence, findNewestProjectFile, filterNotNewerThan, keepCopiesAboutToBeReplaced };
}
