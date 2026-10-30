import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { cleanupAfterMs, cleanUpBackupsBeside, cleanUpProjects, decideGoneRecording, getFoldersBesideRecordings, isCleanupDue, isOldBackup, isOldBackupBeside, parseCleanupState } from './projectCleanup';
import type { BackupsBesideIo, ProjectCleanupIo, RecordingPresence } from './projectCleanup';
import { getReplacedBackupPath, getStoredProjectFileName } from './projectStore';

const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-24T12:00:00.000Z');

describe('when the clean-up runs', () => {
  it('runs on the first start, then at most once a day, and again if the clock went back', () => {
    expect(isCleanupDue({ missingSince: {} }, now)).toBe(true);
    expect(isCleanupDue({ lastRunAt: now - day + 60_000, missingSince: {} }, now)).toBe(false);
    expect(isCleanupDue({ lastRunAt: now - day, missingSince: {} }, now)).toBe(true);
    expect(isCleanupDue({ lastRunAt: now + day, missingSince: {} }, now)).toBe(true);
  });

  it('reads anything unexpected as a first run', () => {
    expect(parseCleanupState(undefined)).toEqual({ missingSince: {} });
    expect(parseCleanupState('x')).toEqual({ missingSince: {} });
    expect(parseCleanupState({ lastRunAt: 'yesterday', missingSince: { 'a.llc': 5, 'b.llc': 'x', 'c.llc': Number.NaN } })).toEqual({ missingSince: { 'a.llc': 5 } });
    expect(parseCleanupState({ lastRunAt: 7, missingSince: [] })).toEqual({ lastRunAt: 7, missingSince: {} });
  });
});

describe('backups kept when a project was replaced', () => {
  const backup = (ageMs: number) => getReplacedBackupPath('clip-0123456789abcdef.llc', now - ageMs);

  it('go once they are 30 days old, by the time in their name', () => {
    expect(isOldBackup(backup(29 * day), now)).toBe(false);
    expect(isOldBackup(backup(cleanupAfterMs), now)).toBe(true);
  });

  it('are only names with the time ClipPress wrote', () => {
    expect(isOldBackup('clip.replaced-old.llc', now)).toBe(false);
    expect(isOldBackup('match.replaced-final-0123456789abcdef.llc', now)).toBe(false);
  });
});

describe('edits of a recording that is gone', () => {
  const old = now - 45 * day;

  it('go only after the recording has been gone for 30 days and the project unchanged for 30 days', () => {
    // First found gone today: the count starts.
    expect(decideGoneRecording({ presence: 'gone', missingSince: undefined, modifiedAt: old, now })).toEqual({ trash: false, missingSince: now });
    expect(decideGoneRecording({ presence: 'gone', missingSince: now - 29 * day, modifiedAt: old, now }).trash).toBe(false);
    expect(decideGoneRecording({ presence: 'gone', missingSince: now - 30 * day, modifiedAt: old, now })).toEqual({ trash: true, missingSince: now - 30 * day });
    // Changed lately: kept.
    expect(decideGoneRecording({ presence: 'gone', missingSince: now - 40 * day, modifiedAt: now - 10 * day, now }).trash).toBe(false);
    // Its time can't be read, or lies in the future: kept.
    expect(decideGoneRecording({ presence: 'gone', missingSince: now - 40 * day, modifiedAt: undefined, now }).trash).toBe(false);
    expect(decideGoneRecording({ presence: 'gone', missingSince: now - 40 * day, modifiedAt: now + 40 * day, now }).trash).toBe(false);
  });

  it('are kept, with the count unchanged, while the drive or folder is not there', () => {
    expect(decideGoneRecording({ presence: 'unknown', missingSince: now - 40 * day, modifiedAt: old, now })).toEqual({ trash: false, missingSince: now - 40 * day });
    expect(decideGoneRecording({ presence: 'unknown', missingSince: undefined, modifiedAt: old, now })).toEqual({ trash: false, missingSince: undefined });
  });

  it('start counting again once the recording is back', () => {
    expect(decideGoneRecording({ presence: 'present', missingSince: now - 40 * day, modifiedAt: old, now })).toEqual({ trash: false, missingSince: undefined });
  });

  it('start counting again when the time noted lies in the future', () => {
    expect(decideGoneRecording({ presence: 'gone', missingSince: now + 5 * day, modifiedAt: old, now })).toEqual({ trash: false, missingSince: now });
  });
});

describe('a clean-up run', () => {
  interface FakeFile { modifiedAt?: number, mediaPath?: string, unreadable?: boolean }

  function fakeIo(files: Record<string, FakeFile>, presence: Record<string, RecordingPresence>, { failTrash = [] as string[] } = {}) {
    const trashed: string[] = [];
    const idleWaits: string[] = [];
    let cancelled = false;
    const io: ProjectCleanupIo = {
      list: async () => Object.keys(files),
      modifiedAt: async (fileName) => files[fileName]?.modifiedAt,
      readMediaPath: async (fileName) => {
        if (files[fileName]?.unreadable) throw new Error('not JSON');
        return files[fileName]?.mediaPath;
      },
      presence: async (mediaPath) => presence[mediaPath] ?? 'present',
      trash: async (fileName) => {
        if (failTrash.includes(fileName)) throw new Error('in use');
        trashed.push(fileName);
      },
      whenIdle: async () => { idleWaits.push('idle'); },
      isCancelled: () => cancelled,
    };
    return { io, trashed, idleWaits, cancel: () => { cancelled = true; } };
  }

  const old = now - 60 * day;
  const files: Record<string, FakeFile> = {
    'gone-1111111111111111.llc': { modifiedAt: old, mediaPath: 'D:/Clips/gone.mp4' },
    'driveOff-2222222222222222.llc': { modifiedAt: old, mediaPath: 'E:/Clips/driveOff.mp4' },
    'here-3333333333333333.llc': { modifiedAt: old, mediaPath: 'D:/Clips/here.mp4' },
    'noPath-4444444444444444.llc': { modifiedAt: old },
    'broken-5555555555555555.llc': { modifiedAt: old, unreadable: true },
    [getReplacedBackupPath('here-3333333333333333.llc', now - 31 * day)]: { modifiedAt: old },
    [getReplacedBackupPath('here-3333333333333333.llc', now - 2 * day)]: { modifiedAt: old },
    '.here-3333333333333333.llc.tmp-1-abc': { modifiedAt: old },
    'notes.txt': { modifiedAt: old },
  };
  const presence: Record<string, RecordingPresence> = { 'D:/Clips/gone.mp4': 'gone', 'E:/Clips/driveOff.mp4': 'unknown' };

  it('only notes a gone recording on the first run, and moves its edits to the Recycle Bin 30 days later', async () => {
    const first = fakeIo(files, presence);
    const run1 = await cleanUpProjects(first.io, { state: { missingSince: {} }, now });
    // Only the old backup goes now; the gone recording's count starts.
    expect(first.trashed).toEqual([getReplacedBackupPath('here-3333333333333333.llc', now - 31 * day)]);
    expect(run1.state).toEqual({ lastRunAt: now, missingSince: { 'gone-1111111111111111.llc': now } });
    expect(run1.failed.map((f) => f.fileName)).toEqual(['broken-5555555555555555.llc']);

    const later = now + 30 * day;
    const second = fakeIo(files, presence);
    const run2 = await cleanUpProjects(second.io, { state: run1.state, now: later });
    expect(second.trashed).toContain('gone-1111111111111111.llc');
    expect(second.trashed).not.toContain('driveOff-2222222222222222.llc');
    expect(second.trashed).not.toContain('here-3333333333333333.llc');
    expect(second.trashed).not.toContain('noPath-4444444444444444.llc');
    expect(second.trashed).not.toContain('.here-3333333333333333.llc.tmp-1-abc');
    expect(second.trashed).not.toContain('notes.txt');
    expect(run2.state.missingSince).toEqual({});
  });

  it('keeps edits whose recording came back in between', async () => {
    const first = fakeIo(files, presence);
    const run1 = await cleanUpProjects(first.io, { state: { missingSince: {} }, now });
    const back = fakeIo(files, { ...presence, 'D:/Clips/gone.mp4': 'present' });
    const run2 = await cleanUpProjects(back.io, { state: run1.state, now: now + 10 * day });
    expect(run2.state.missingSince).toEqual({});
    const goneAgain = fakeIo(files, presence);
    await cleanUpProjects(goneAgain.io, { state: run2.state, now: now + 31 * day });
    expect(goneAgain.trashed).not.toContain('gone-1111111111111111.llc');
  });

  it('keeps the count of a file it could not move to the Recycle Bin, and carries on', async () => {
    const io = fakeIo(files, presence, { failTrash: ['gone-1111111111111111.llc'] });
    const result = await cleanUpProjects(io.io, { state: { missingSince: { 'gone-1111111111111111.llc': now - 40 * day } }, now });
    expect(result.failed.map((f) => f.fileName)).toContain('gone-1111111111111111.llc');
    expect(result.state.missingSince['gone-1111111111111111.llc']).toBe(now - 40 * day);
    expect(io.trashed).toEqual([getReplacedBackupPath('here-3333333333333333.llc', now - 31 * day)]);
  });

  it('forgets files that are no longer there, and waits for the app to be idle before each file', async () => {
    const io = fakeIo(files, presence);
    const result = await cleanUpProjects(io.io, { state: { missingSince: { 'deleted-6666666666666666.llc': now - 40 * day } }, now });
    expect(result.state.missingSince['deleted-6666666666666666.llc']).toBeUndefined();
    expect(io.idleWaits).toHaveLength(Object.keys(files).length);
  });

  it('treats the edits of a recording named like a backup as any other recording\'s', async () => {
    const mediaPath = 'D:/Clips/match.replaced-final.mp4';
    const fileName = getStoredProjectFileName(mediaPath, true);
    const unedited = { [fileName]: { modifiedAt: now - 400 * day, mediaPath } };
    const here = fakeIo(unedited, {});
    expect((await cleanUpProjects(here.io, { state: { missingSince: {} }, now })).trashed).toEqual([]);
    expect(here.trashed).toEqual([]);
    // Once the recording has been gone for 30 days, they go like any other's.
    const gone = fakeIo(unedited, { [mediaPath]: 'gone' });
    expect((await cleanUpProjects(gone.io, { state: { missingSince: { [fileName]: now - 30 * day } }, now })).trashed).toEqual([{ fileName, reason: 'recordingGone' }]);
  });

  it('stops when cancelled, keeping what it knew of the files not reached', async () => {
    const io = fakeIo(files, presence);
    io.cancel();
    const state = { missingSince: { 'gone-1111111111111111.llc': now - 10 * day } };
    const result = await cleanUpProjects(io.io, { state, now });
    expect(io.trashed).toEqual([]);
    expect(result.state.missingSince).toEqual(state.missingSince);
  });
});

// "Next to the recording" and "Both" keep backups there too, as does "In the export folder" there.
describe('backups kept beside recordings', () => {
  const backup = (name: string, ageMs: number) => getReplacedBackupPath(name, now - ageMs);

  it('go once they are 30 days old, by the time ClipPress wrote in their name', () => {
    expect(isOldBackupBeside(backup('Valorant 2026.10.19-proj.llc', 31 * day), now)).toBe(true);
    expect(isOldBackupBeside(backup('Valorant 2026.10.19-PROJ.llc', cleanupAfterMs), now)).toBe(true);
    expect(isOldBackupBeside(backup('Valorant 2026.10.19-proj.llc', 29 * day), now)).toBe(false);
  });

  it('are only ClipPress\'s own: of a project next to a recording, with the time in the name', () => {
    // Without the time ClipPress writes, its age can't be told from the name: it stays.
    expect(isOldBackupBeside('clip-proj.replaced-old.llc', now)).toBe(false);
    // The project itself, and backups that aren't of a project next to a recording.
    expect(isOldBackupBeside('clip-proj.llc', now)).toBe(false);
    expect(isOldBackupBeside(backup('clip-0123456789abcdef.llc', 40 * day), now)).toBe(false);
    expect(isOldBackupBeside(backup('clip.llc', 40 * day), now)).toBe(false);
    expect(isOldBackupBeside(`${backup('clip-proj.llc', 40 * day)}.txt`, now)).toBe(false);
  });

  it('are looked for in the folders of the recordings known, and the export folder, each once', () => {
    const win = path.win32;
    const env = { dirname: win.dirname, isAbsolute: win.isAbsolute, caseInsensitive: true };
    const projectsDir = String.raw`C:\Users\Me\AppData\Roaming\ClipPress\Projects`;
    expect(getFoldersBesideRecordings({
      mediaPaths: [String.raw`D:\Clips\a.mp4`, String.raw`d:\clips\b.mp4`, 'relative.mp4', String.raw`\\nas\share\c.mp4`, win.join(projectsDir, 'odd.mp4')],
      otherFolders: [String.raw`E:\Exports`, 'D:\\Clips\\', 'exports'],
      projectsDir,
    }, env)).toEqual([String.raw`D:\Clips`, '\\\\nas\\share\\', String.raw`E:\Exports`]);
  });

  function fakeIo(folders: Record<string, string[]>, { failTrash = [] as string[] } = {}) {
    const trashed: string[] = [];
    const idleWaits: string[] = [];
    let cancelled = false;
    const io: BackupsBesideIo = {
      list: async (folder) => folders[folder] ?? [],
      trash: async (folder, fileName) => {
        if (failTrash.includes(fileName)) throw new Error('in use');
        trashed.push(`${folder}/${fileName}`);
      },
      whenIdle: async () => { idleWaits.push('idle'); },
      isCancelled: () => cancelled,
    };
    return { io, trashed, idleWaits, cancel: () => { cancelled = true; } };
  }

  const oldOne = backup('clip-proj.llc', 40 * day);
  const newOne = backup('clip-proj.llc', 3 * day);
  const inExports = backup('other-proj.llc', 35 * day);
  const folders = {
    'D:/Clips': ['clip.mp4', 'clip-proj.llc', oldOne, newOne, 'notes.txt'],
    'E:/Exports': ['other.mp4', inExports],
  };

  it('moves only the old ones to the Recycle Bin, waiting for the app to be idle first', async () => {
    const io = fakeIo(folders);
    const result = await cleanUpBackupsBeside(['D:/Clips', 'E:/Exports', 'F:/Not connected'], io.io, now);
    expect(io.trashed).toEqual([`D:/Clips/${oldOne}`, `E:/Exports/${inExports}`]);
    expect(result).toEqual({ trashed: [{ folder: 'D:/Clips', fileName: oldOne }, { folder: 'E:/Exports', fileName: inExports }], failed: [] });
    // Before each folder, and before each file it moves.
    expect(io.idleWaits).toHaveLength(5);
  });

  it('reports one it could not move, and carries on', async () => {
    const io = fakeIo(folders, { failTrash: [oldOne] });
    const result = await cleanUpBackupsBeside(['D:/Clips', 'E:/Exports'], io.io, now);
    expect(result.failed.map((f) => f.fileName)).toEqual([oldOne]);
    expect(io.trashed).toEqual([`E:/Exports/${inExports}`]);
  });

  it('stops when cancelled', async () => {
    const io = fakeIo(folders);
    io.cancel();
    expect(await cleanUpBackupsBeside(['D:/Clips', 'E:/Exports'], io.io, now)).toEqual({ trashed: [], failed: [] });
    expect(io.trashed).toEqual([]);
  });
});
