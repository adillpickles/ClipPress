import { describe, expect, it } from 'vitest';

import { cleanupAfterMs, cleanUpProjects, decideGoneRecording, isCleanupDue, isOldBackup, parseCleanupState } from './projectCleanup';
import type { ProjectCleanupIo, RecordingPresence } from './projectCleanup';
import { getReplacedBackupPath } from './projectStore';

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
    expect(isOldBackup(backup(29 * day), undefined, now)).toBe(false);
    expect(isOldBackup(backup(cleanupAfterMs), undefined, now)).toBe(true);
    // The file's own time is when the replaced copy was last saved, not when it was replaced: the name wins.
    expect(isOldBackup(backup(2 * day), now - 400 * day, now)).toBe(false);
  });

  it('go by their file time when the name has no time ClipPress wrote', () => {
    expect(isOldBackup('clip.replaced-old.llc', now - 31 * day, now)).toBe(true);
    expect(isOldBackup('clip.replaced-old.llc', now - 3 * day, now)).toBe(false);
    expect(isOldBackup('clip.replaced-old.llc', undefined, now)).toBe(false);
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

  it('stops when cancelled, keeping what it knew of the files not reached', async () => {
    const io = fakeIo(files, presence);
    io.cancel();
    const state = { missingSince: { 'gone-1111111111111111.llc': now - 10 * day } };
    const result = await cleanUpProjects(io.io, { state, now });
    expect(io.trashed).toEqual([]);
    expect(result.state.missingSince).toEqual(state.missingSince);
  });
});
