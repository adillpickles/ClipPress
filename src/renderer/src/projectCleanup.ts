/**
 * Tidies ClipPress's projects folder in the background (#91). Only ever into the Recycle Bin, and only when sure:
 * - a backup kept when a project was replaced (".replaced-<time>.llc") goes once it is 30 days old, as does one kept
 *   beside a recording or in the export folder ("Next to the recording", "Both");
 * - a recording's edits go once the recording has been gone for 30 days: its folder is there (so its drive is
 *   connected) but the file isn't, at every daily check for 30 days, and the project hasn't changed in 30 days either.
 *   A recording that can't be checked (a drive or share that isn't connected, no access) keeps its edits.
 */

import { getReplacedBackupTime, isReplacedBackupName, normaliseMediaPath, projectSuffix } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';

const dayMs = 24 * 60 * 60 * 1000;
export const cleanupAfterMs = 30 * dayMs;
export const cleanupIntervalMs = dayMs;

export interface ProjectCleanupState {
  /** When the clean-up last ran, in milliseconds since the epoch. */
  lastRunAt?: number | undefined,
  /** By project file name: when its recording was first found gone. */
  missingSince: Record<string, number>,
}

/** Whatever was stored, as a state: anything unreadable is a first run. */
export function parseCleanupState(stored: unknown): ProjectCleanupState {
  if (stored == null || typeof stored !== 'object') return { missingSince: {} };
  const { lastRunAt, missingSince } = stored as Partial<Record<keyof ProjectCleanupState, unknown>>;
  const since = missingSince != null && typeof missingSince === 'object'
    ? Object.fromEntries(Object.entries(missingSince).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
    : {};
  return { ...(typeof lastRunAt === 'number' && Number.isFinite(lastRunAt) ? { lastRunAt } : {}), missingSince: since };
}

/** At most once a day; also when the clock went back since the last run. */
export function isCleanupDue({ lastRunAt }: ProjectCleanupState, now: number) {
  return lastRunAt == null || now - lastRunAt >= cleanupIntervalMs || lastRunAt > now;
}

export const isProjectFileName = (fileName: string) => !fileName.startsWith('.') && /\.llc$/i.test(fileName);

/** A backup kept when a project was replaced is old enough to go: by the time in its name, or else its file's. */
export function isOldBackup(fileName: string, modifiedAt: number | undefined, now: number) {
  const madeAt = getReplacedBackupTime(fileName) ?? modifiedAt;
  return madeAt != null && now - madeAt >= cleanupAfterMs;
}

/** A backup of a project kept next to a recording (or in the export folder): "<recording>-proj.replaced-<time>.llc". */
function isBesideBackupName(fileName: string) {
  const at = fileName.toLowerCase().lastIndexOf('.replaced-');
  return at > 0 && `${fileName.slice(0, at)}.llc`.toLowerCase().endsWith(`-${projectSuffix}`);
}

/**
 * Such a backup beside a recording is old enough to go. Outside ClipPress's own folder, only by the time ClipPress
 * wrote in its name: a file that doesn't say that is left alone.
 */
export function isOldBackupBeside(fileName: string, now: number) {
  const madeAt = getReplacedBackupTime(fileName);
  return madeAt != null && isBesideBackupName(fileName) && now - madeAt >= cleanupAfterMs;
}

/**
 * The folders to look for backups beside recordings in, each once: those of the recordings ClipPress knows of (with
 * edits in its folder, or opened lately) and `otherFolders` (the export folder). Not its own projects folder, which
 * `cleanUpProjects` tidies, nor a path that isn't a full one.
 */
export function getFoldersBesideRecordings({ mediaPaths, otherFolders, projectsDir }: {
  mediaPaths: readonly string[],
  otherFolders: readonly string[],
  projectsDir: string,
}, env: Pick<ProjectStoreEnv, 'dirname' | 'caseInsensitive'> & { isAbsolute: (path: string) => boolean }) {
  const seen = new Set([normaliseMediaPath(projectsDir, env.caseInsensitive)]);
  return [...mediaPaths.filter((p) => env.isAbsolute(p)).map((p) => env.dirname(p)), ...otherFolders.filter((p) => env.isAbsolute(p))].filter((folder) => {
    const key = normaliseMediaPath(folder, env.caseInsensitive);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface BackupsBesideIo {
  /** The file names in a folder: none when it can't be read. */
  list: (folder: string) => Promise<string[]>,
  /** Moves a file in a folder to the Recycle Bin. Rejects when it couldn't. */
  trash: (folder: string, fileName: string) => Promise<void>,
  /** Resolves once the app is idle (see `ProjectCleanupIo.whenIdle`). Waited for before each folder and each file. */
  whenIdle: () => Promise<void>,
  isCancelled?: () => boolean,
}

/** Moves the old backups beside recordings in `folders` to the Recycle Bin. Never throws for a single file. */
export async function cleanUpBackupsBeside(folders: readonly string[], io: BackupsBesideIo, now: number) {
  const trashed: { folder: string, fileName: string }[] = [];
  const failed: { folder: string, fileName: string, error: unknown }[] = [];
  for (const folder of folders) {
    if (io.isCancelled?.()) break;
    // eslint-disable-next-line no-await-in-loop
    await io.whenIdle();
    if (io.isCancelled?.()) break;
    // eslint-disable-next-line no-await-in-loop
    const old = (await io.list(folder)).filter((fileName) => isOldBackupBeside(fileName, now));
    for (const fileName of old) {
      // eslint-disable-next-line no-await-in-loop
      await io.whenIdle();
      if (io.isCancelled?.()) break;
      try {
        // eslint-disable-next-line no-await-in-loop
        await io.trash(folder, fileName);
        trashed.push({ folder, fileName });
      } catch (error) {
        failed.push({ folder, fileName, error });
      }
    }
  }
  return { trashed, failed };
}

/** Whether a project's recording is there: 'gone' only when its folder is there but the file isn't. */
export type RecordingPresence = 'present' | 'gone' | 'unknown';

/**
 * What to do with the edits of a recording that may be gone: move them to the Recycle Bin, and when it was first found
 * gone (kept until it is found again; a check that can't tell changes nothing).
 */
export function decideGoneRecording({ presence, missingSince, modifiedAt, now }: {
  presence: RecordingPresence,
  missingSince: number | undefined,
  /** When the project file last changed; undefined when that can't be read. */
  modifiedAt: number | undefined,
  now: number,
}): { trash: boolean, missingSince: number | undefined } {
  if (presence === 'present') return { trash: false, missingSince: undefined };
  if (presence === 'unknown') return { trash: false, missingSince };
  // A time in the future (the clock went back) starts again from now.
  const since = missingSince != null && missingSince <= now ? missingSince : now;
  const trash = now - since >= cleanupAfterMs && modifiedAt != null && modifiedAt <= now && now - modifiedAt >= cleanupAfterMs;
  return { trash, missingSince: since };
}

export interface ProjectCleanupIo {
  /** The file names in the projects folder. */
  list: () => Promise<string[]>,
  /** When a file in it last changed; undefined when that can't be read. */
  modifiedAt: (fileName: string) => Promise<number | undefined>,
  /** The full path of the recording a project is for; undefined when it doesn't say, or can't be read. */
  readMediaPath: (fileName: string) => Promise<string | undefined>,
  presence: (mediaPath: string) => Promise<RecordingPresence>,
  /** Moves a file in the projects folder to the Recycle Bin. Rejects when it couldn't. */
  trash: (fileName: string) => Promise<void>,
  /** Resolves once the app is idle, so the clean-up never competes with opening a clip. Waited for before each file. */
  whenIdle: () => Promise<void>,
  /** Stops the run early (the window is closing). */
  isCancelled?: () => boolean,
}

export interface ProjectCleanupResult {
  state: ProjectCleanupState,
  trashed: { fileName: string, reason: 'oldBackup' | 'recordingGone' }[],
  failed: { fileName: string, error: unknown }[],
}

/** One run over the projects folder. Never throws for a single file: what fails is left as it is, and reported. */
export async function cleanUpProjects(io: ProjectCleanupIo, { state, now }: { state: ProjectCleanupState, now: number }): Promise<ProjectCleanupResult> {
  const fileNames = await io.list();
  // Only for files still there; one not reached (a cancelled run) keeps what was known of it.
  const missingSince = new Map(fileNames.flatMap((fileName) => {
    const since = state.missingSince[fileName];
    return since != null ? [[fileName, since] as const] : [];
  }));
  const trashed: ProjectCleanupResult['trashed'] = [];
  const failed: ProjectCleanupResult['failed'] = [];

  for (const fileName of fileNames) {
    if (io.isCancelled?.()) break;
    // eslint-disable-next-line no-await-in-loop
    await io.whenIdle();
    if (io.isCancelled?.()) break;
    try {
      if (isReplacedBackupName(fileName)) {
        // eslint-disable-next-line no-await-in-loop
        const modifiedAt = getReplacedBackupTime(fileName) == null ? await io.modifiedAt(fileName) : undefined;
        if (isOldBackup(fileName, modifiedAt, now)) {
          // eslint-disable-next-line no-await-in-loop
          await io.trash(fileName);
          trashed.push({ fileName, reason: 'oldBackup' });
        }
      } else if (isProjectFileName(fileName)) {
        // eslint-disable-next-line no-await-in-loop
        const mediaPath = await io.readMediaPath(fileName);
        // eslint-disable-next-line no-continue
        if (mediaPath == null) continue;
        // eslint-disable-next-line no-await-in-loop
        const presence = await io.presence(mediaPath);
        // eslint-disable-next-line no-await-in-loop
        const modifiedAt = presence === 'gone' ? await io.modifiedAt(fileName) : undefined;
        const decision = decideGoneRecording({ presence, missingSince: missingSince.get(fileName), modifiedAt, now });
        if (decision.missingSince != null) missingSince.set(fileName, decision.missingSince);
        else missingSince.delete(fileName);
        if (decision.trash) {
          // eslint-disable-next-line no-await-in-loop
          await io.trash(fileName);
          missingSince.delete(fileName);
          trashed.push({ fileName, reason: 'recordingGone' });
        }
      }
    } catch (error) {
      failed.push({ fileName, error });
    }
  }

  return { state: { lastRunAt: now, missingSince: Object.fromEntries(missingSince) }, trashed, failed };
}
