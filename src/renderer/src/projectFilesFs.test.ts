import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import createProjectFilesFs from './projectFilesFs';
import type { ProjectFilesFs } from './projectFilesFs';
import type { LlcProject } from './types';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'clippress-project-files-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const readProject = async (projectPath: string) => {
  try {
    return JSON.parse(await readFile(projectPath, 'utf8')) as LlcProject;
  } catch {
    return undefined;
  }
};
const files = (overrides: Partial<ProjectFilesFs> = {}) => createProjectFilesFs({ lstat, stat, rename, copyFile, dirname: path.dirname, isAbsolute: path.isAbsolute, readProject, ...overrides });

const project = (starts: number[], extra: Partial<LlcProject> = {}): LlcProject => ({
  version: 3,
  mediaFileName: 'clip.mp4',
  mediaFilePath: path.join(dir, 'clip.mp4'),
  cutSegments: starts.map((start) => ({ start, end: start + 2, name: '' })),
  ...extra,
});
const write = (name: string, data: unknown) => writeFile(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
const setTime = (name: string, time: number) => utimes(path.join(dir, name), time / 1000, time / 1000);

describe('whether a recording is there', () => {
  it('is present when the file is there', async () => {
    await write('clip.mp4', 'video');
    expect(await files().getRecordingPresence(path.join(dir, 'clip.mp4'))).toBe('present');
  });

  it('is gone only when its folder is there and the file is not', async () => {
    expect(await files().getRecordingPresence(path.join(dir, 'clip.mp4'))).toBe('gone');
  });

  it('can\'t be told when its folder is missing too (a drive that isn\'t connected, a folder moved away)', async () => {
    expect(await files().getRecordingPresence(path.join(dir, 'no such folder', 'clip.mp4'))).toBe('unknown');
    // Where a file is in the place of the folder, the folder isn't there either.
    await write('not a folder', 'x');
    expect(await files().getRecordingPresence(path.join(dir, 'not a folder', 'clip.mp4'))).toBe('unknown');
  });

  it('can\'t be told from a path that isn\'t a full one', async () => {
    expect(await files().getRecordingPresence('clip.mp4')).toBe('unknown');
  });

  it('can\'t be told when the file can\'t be checked for another reason than not being there', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    const checks = files({ lstat: async () => { throw denied; } });
    expect(await checks.getRecordingPresence(path.join(dir, 'clip.mp4'))).toBe('unknown');
  });
});

describe('the copies left at a recording\'s old place', () => {
  it('are those there and not newer than the edits that were opened', async () => {
    const t = Date.parse('2026-10-01T12:00:00.000Z');
    await write('opened.llc', project([1]));
    await write('older.llc', project([1]));
    await write('same time.llc', project([1]));
    await write('newer.llc', project([5]));
    await setTime('opened.llc', t);
    await setTime('older.llc', t - 60_000);
    await setTime('same time.llc', t);
    await setTime('newer.llc', t + 60_000);
    const at = (name: string) => path.join(dir, name);
    expect(await files().filterNotNewerThan(['older.llc', 'same time.llc', 'newer.llc', 'missing.llc', 'opened.llc'].map((name) => at(name)), at('opened.llc')))
      .toEqual(['older.llc', 'same time.llc', 'opened.llc'].map((name) => at(name)));
  });

  it('are none when the edits opened are no longer there', async () => {
    await write('older.llc', project([1]));
    expect(await files().filterNotNewerThan([path.join(dir, 'older.llc')], path.join(dir, 'opened.llc'))).toEqual([]);
  });
});

describe('the copy of the edits opened', () => {
  const t = Date.parse('2026-10-01T12:00:00.000Z');
  const at = (name: string) => path.join(dir, name);
  const read = async (projectPath: string) => {
    const opened = await readProject(projectPath);
    if (opened == null) throw new Error(`Can't read ${projectPath}`);
    return opened;
  };

  it('is the newest one, and on a tie the one in the better place', async () => {
    await write('a.llc', project([1]));
    await write('b.llc', project([2]));
    await write('c.llc', project([3]));
    await setTime('a.llc', t);
    await setTime('b.llc', t + 1000);
    await setTime('c.llc', t + 1000);
    const found = await files().findProjectFiles([at('a.llc'), at('b.llc'), at('missing.llc'), at('c.llc')]);
    expect(found.map(({ path: copy }) => copy)).toEqual([at('a.llc'), at('b.llc'), at('c.llc')]);
    expect(await files().readNewestProjectCopy(found, read)).toEqual({ opened: { path: at('b.llc'), project: project([2]) }, unreadable: [] });
    expect(await files().readNewestProjectCopy(await files().findProjectFiles([at('missing.llc')]), read)).toEqual({ opened: undefined, unreadable: [] });
  });

  it('passes over a newer one that can\'t be read, for the next newest', async () => {
    await write('good.llc', project([1, 10]));
    await write('cut short.llc', '{ "version": 3, "cutSeg');
    await write('older.llc', project([4]));
    await setTime('older.llc', t - 1000);
    await setTime('good.llc', t);
    await setTime('cut short.llc', t + 1000);
    const { opened, unreadable } = await files().readNewestProjectCopy(await files().findProjectFiles([at('good.llc'), at('cut short.llc'), at('older.llc')]), read);
    expect(opened).toEqual({ path: at('good.llc'), project: project([1, 10]) });
    expect(unreadable.map(({ path: copy }) => copy)).toEqual([at('cut short.llc')]);
    expect(unreadable[0]!.error).toBeInstanceOf(Error);
  });

  it('is none when no copy can be read', async () => {
    await write('a.llc', '');
    await write('b.llc', 'not json');
    const { opened, unreadable } = await files().readNewestProjectCopy(await files().findProjectFiles([at('a.llc'), at('b.llc')]), read);
    expect(opened).toBeUndefined();
    expect(unreadable).toHaveLength(2);
  });

  it('stops at an error that stops it all, such as access declined', async () => {
    await write('a.llc', project([1]));
    const declined = new Error('declined');
    const reading = files().readNewestProjectCopy([{ path: at('a.llc'), mtimeMs: t }], async () => { throw declined; }, (err) => err === declined);
    await expect(reading).rejects.toBe(declined);
  });
});

describe('a copy about to be replaced by the edits being opened', () => {
  const at = (name: string) => path.join(dir, name);
  const backups = async () => (await readdir(dir)).filter((name) => name.includes('.replaced-')).sort();

  it('is kept as a backup next to it when it holds other edits', async () => {
    await mkdir(at('Projects'));
    await write('clip-proj.llc', project([5, 20]));
    await write(path.join('Projects', 'clip-0123456789abcdef.llc'), project([1]));
    const same = await files().keepCopiesAboutToBeReplaced([at(path.join('Projects', 'clip-0123456789abcdef.llc'))], at('clip-proj.llc'));
    expect(same).toEqual([]);
    const kept = (await readdir(at('Projects'))).sort();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/^clip-0123456789abcdef\.replaced-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.llc$/);
    expect(await readProject(at(path.join('Projects', kept[0]!)))).toEqual(project([1]));
    // The edits being opened are left as they are.
    expect(await readProject(at('clip-proj.llc'))).toEqual(project([5, 20]));
  });

  it('needs no backup when it holds the same edits, however it was written', async () => {
    await write('source.llc', project([5, 20], { mediaDuration: 90 }));
    // Written by an older version: no length noted, segments with their defaults spelt out.
    await write('copy.llc', { ...project([5, 20]), cutSegments: [{ start: 5, end: 7, name: '', selected: true }, { start: 20, end: 22, name: '', selected: true }] });
    expect(await files().keepCopiesAboutToBeReplaced([at('copy.llc')], at('source.llc'))).toEqual([at('copy.llc')]);
    expect(await backups()).toEqual([]);
  });

  it('is left alone when it is the copy being opened, or isn\'t there', async () => {
    await write('source.llc', project([5]));
    expect(await files().keepCopiesAboutToBeReplaced([at('source.llc'), at('missing.llc')], at('source.llc'))).toEqual([]);
    expect(await backups()).toEqual([]);
  });

  it('is kept when the edits opened can\'t be read again to compare', async () => {
    await write('copy.llc', project([1]));
    await write('broken.llc', '{ not json');
    expect(await files().keepCopiesAboutToBeReplaced([at('copy.llc')], at('broken.llc'))).toEqual([]);
    const [backup] = await backups();
    expect(await readProject(at(backup!))).toEqual(project([1]));
  });

  it('is copied instead when it can\'t be renamed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await write('source.llc', project([5]));
      await write('copy.llc', project([1]));
      const locked = files({ rename: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } });
      expect(await locked.keepCopiesAboutToBeReplaced([at('copy.llc')], at('source.llc'))).toEqual([]);
      const [backup] = await backups();
      expect(backup).toBeDefined();
      expect(await readProject(at(backup!))).toEqual(project([1]));
      expect(await readProject(at('copy.llc'))).toEqual(project([1]));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('opening a recording whose newest copy of its edits can\'t be read', () => {
  const t = Date.parse('2026-10-01T12:00:00.000Z');
  const at = (name: string) => path.join(dir, name);
  // As the app keeps them: in ClipPress's folder, and next to the recording.
  const stored = path.join('Projects', 'clip-0123456789abcdef.llc');
  const sidecar = 'clip-proj.llc';
  const cutShort = '{ "version": 3, "mediaFileName": "clip.mp4", "cutSegments": [{ "start": 1, ';
  const read = async (projectPath: string) => {
    const opened = await readProject(projectPath);
    if (opened == null) throw new Error(`Can't read ${projectPath}`);
    return opened;
  };
  /** What the app does on open, with autosave on: finds the copies, opens one and keeps aside what it didn't open. */
  async function open(savePaths: string[]) {
    const fs = files();
    const { opened, unreadable } = await fs.readNewestProjectCopy(await fs.findProjectFiles([at(stored), at(sidecar)]), read);
    const sameCopyPaths = await fs.keepCopiesNotOpened({ savePaths: savePaths.map((name) => at(name)), openedPath: opened?.path, unreadable: unreadable.map(({ path: copy }) => copy) });
    return { opened, sameCopyPaths };
  }
  const backupsIn = async (folder: string) => (await readdir(at(folder))).filter((name) => name.includes('.replaced-'));
  const contents = (name: string) => readFile(at(name), 'utf8');

  beforeEach(async () => {
    await mkdir(at('Projects'));
  });

  it('opens the older copy, and keeps the one cut short as a backup ("In ClipPress")', async () => {
    await write(stored, project([1, 10, 20]));
    await write(sidecar, cutShort);
    await setTime(stored, t);
    await setTime(sidecar, t + 60_000);
    const { opened, sameCopyPaths } = await open([stored]);
    expect(opened).toEqual({ path: at(stored), project: project([1, 10, 20]) });
    expect(sameCopyPaths).toEqual([]);
    // The copy opened is where autosave writes, as it was; the other was never opened, so it is kept as it was.
    expect(await readProject(at(stored))).toEqual(project([1, 10, 20]));
    const [backup] = await backupsIn('.');
    expect(backup).toMatch(/^clip-proj\.replaced-.*\.llc$/);
    expect(await contents(backup!)).toBe(cutShort);
    expect(await readdir(dir)).not.toContain(sidecar);
  });

  it('opens either copy in "Both" when the other can\'t be read, and keeps that one before it is saved over', async () => {
    await write(stored, project([1, 10, 20]));
    await write(sidecar, cutShort);
    await setTime(stored, t);
    await setTime(sidecar, t + 60_000);
    expect((await open([stored, sidecar])).opened?.path).toBe(at(stored));
    expect(await contents((await backupsIn('.'))[0]!)).toBe(cutShort);

    // The other way round: the copy in ClipPress's folder is the one cut short.
    await rm(at('Projects'), { recursive: true });
    await mkdir(at('Projects'));
    await write(stored, cutShort);
    await write(sidecar, project([5, 30]));
    await setTime(sidecar, t);
    await setTime(stored, t + 60_000);
    const { opened, sameCopyPaths } = await open([stored, sidecar]);
    expect(opened).toEqual({ path: at(sidecar), project: project([5, 30]) });
    expect(sameCopyPaths).toEqual([]);
    const [backup] = await backupsIn('Projects');
    expect(await contents(path.join('Projects', backup!))).toBe(cutShort);
    expect(await readProject(at(sidecar))).toEqual(project([5, 30]));
  });

  it('opens without edits when no copy can be read, and keeps every copy a first edit would save over', async () => {
    await write(stored, cutShort);
    await write(sidecar, '');
    const { opened, sameCopyPaths } = await open([stored, sidecar]);
    expect(opened).toBeUndefined();
    expect(sameCopyPaths).toEqual([]);
    expect(await backupsIn('Projects')).toHaveLength(1);
    expect(await backupsIn('.')).toHaveLength(1);
    expect(await readdir(at('Projects'))).not.toContain(path.basename(stored));
    expect(await readdir(dir)).not.toContain(sidecar);
  });

  it('still keeps a different readable copy where a save goes', async () => {
    // "Both": the copy next to the recording is newest and opens; the older one in ClipPress's folder holds other edits.
    await write(stored, project([1]));
    await write(sidecar, project([5, 30]));
    await setTime(stored, t);
    await setTime(sidecar, t + 60_000);
    const { opened } = await open([stored, sidecar]);
    expect(opened?.path).toBe(at(sidecar));
    const [backup] = await backupsIn('Projects');
    expect(await readProject(at(path.join('Projects', backup!)))).toEqual(project([1]));
  });
});
