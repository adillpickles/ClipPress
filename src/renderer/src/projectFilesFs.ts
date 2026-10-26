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

/** A project file that is there, with when it was last saved (0 when that can't be told). */
export interface FoundProjectFile {
  path: string,
  mtimeMs: number,
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

  /** The ones of these project files that are there, with when each was last saved. */
  async function findProjectFiles(paths: readonly string[]) {
    const found: FoundProjectFile[] = [];
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      const mtimeMs = await getModifiedAt(path);
      if (mtimeMs != null) found.push({ path, mtimeMs });
    }
    return found;
  }

  /**
   * Reads a recording's edits from the copies of them found (`found`, best place first): the most recently saved copy
   * that `read` can read, on a tie the better place. A newer one it can't (cut short by a sync tool, say, or online only
   * and not fetched) is passed over for the next, and listed in `unreadable` with why. `read` rejecting with an error
   * `stopsReading` accepts (the user declined access, say) rejects this as well.
   */
  async function readNewestProjectCopy<T>(found: readonly FoundProjectFile[], read: (path: string) => Promise<T>, stopsReading: (err: unknown) => boolean = () => false) {
    const unreadable: { path: string, error: unknown }[] = [];
    // sort() keeps the order of a tie
    for (const { path } of [...found].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return { opened: { path, project: await read(path) }, unreadable };
      } catch (error) {
        if (stopsReading(error)) throw error;
        unreadable.push({ path, error });
      }
    }
    return { opened: undefined, unreadable };
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

  /** Keeps a project file under another name next to it (see `getReplacedBackupPath`), before it could be replaced. */
  async function keepAsBackup(path: string) {
    const backupPath = getReplacedBackupPath(path, Date.now());
    try {
      await rename(path, backupPath);
    } catch (renameErr) {
      // Locked, or the folder doesn't allow renaming: a copy keeps it just as well. And if even that fails, the file is
      // most likely locked against being written over too.
      await copyFile(path, backupPath).catch((copyErr: unknown) => console.warn('Could not keep a copy of the project before replacing it', path, renameErr, copyErr));
    }
  }

  /**
   * A copy of each of these project files that is there, under the backup name next to it (as `keepAsBackup` names it,
   * and the daily clean-up retires after 30 days), before autosave writes something else over them (Start over).
   */
  /** Resolves false when there were saved edits but not one copy of them could be kept. */
  async function keepBackupCopies(paths: readonly string[]) {
    let existing = 0;
    let kept = 0;
    for (const path of new Set(paths)) {
      // eslint-disable-next-line no-await-in-loop, no-continue
      if (await getModifiedAt(path) == null) continue;
      existing += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        await copyFile(path, getReplacedBackupPath(path, Date.now()));
        kept += 1;
      } catch (err) {
        console.warn('Could not keep a copy of the project', path, err);
      }
    }
    return existing === 0 || kept > 0;
  }

  /**
   * Before autosave writes the edits being opened (loaded from `sourcePath`) to `savePaths`: a different copy already in
   * one of those places would be replaced without a word (file times can mislead, e.g. a restored old copy), so it is
   * kept under another name next to it instead (see `keepAsBackup`). A copy of the same edits, however it was written,
   * needs none: resolves with those, which already hold what is loaded.
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
      // Edits that loaded but can't be read again here can't be compared: the copy is kept, to be safe.
      if (existing != null && loaded != null && isSameProjectEdits(existing, loaded)) {
        same.push(savePath);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await keepAsBackup(savePath);
      }
    }
    return same;
  }

  /**
   * Before autosave writes the edits opened from `openedPath` to `savePaths` (undefined: none of the copies found could
   * be read, and the recording opens without edits, which a first edit saves): nothing that wasn't opened may be
   * replaced. The copies that couldn't be read (`unreadable`) are kept as backups wherever they are, so neither a save
   * nor moving old copies to the Recycle Bin takes what they hold, and so is a different copy where a save goes (see
   * `keepCopiesAboutToBeReplaced`). Resolves with the copies there that already hold the edits opened.
   */
  async function keepCopiesNotOpened({ savePaths, openedPath, unreadable }: {
    savePaths: readonly string[],
    openedPath: string | undefined,
    unreadable: readonly string[],
  }) {
    for (const path of unreadable) {
      // eslint-disable-next-line no-await-in-loop
      await keepAsBackup(path);
    }
    if (openedPath == null) return [];
    return keepCopiesAboutToBeReplaced(savePaths.filter((savePath) => !unreadable.includes(savePath)), openedPath);
  }

  return { getModifiedAt, getRecordingPresence, findProjectFiles, readNewestProjectCopy, filterNotNewerThan, keepBackupCopies, keepCopiesAboutToBeReplaced, keepCopiesNotOpened };
}
