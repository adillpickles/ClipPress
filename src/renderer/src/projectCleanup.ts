/**
 * Tidies ClipPress's projects folder in the background (#91). Only ever into the Recycle Bin, and only when sure:
 * - a backup kept when a project was replaced (".replaced-<time>.llc") goes once it is 30 days old;
 * - a recording's edits go once the recording has been gone for 30 days: its folder is there (so its drive is
 *   connected) but the file isn't, at every daily check for 30 days, and the project hasn't changed in 30 days either.
 *   A recording that can't be checked (a drive or share that isn't connected, no access) keeps its edits.
 */

import { getReplacedBackupTime, isReplacedBackupName } from './projectStore';

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
