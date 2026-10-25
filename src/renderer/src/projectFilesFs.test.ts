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

  it('come from the newest copy', async () => {
    const t = Date.parse('2026-10-01T12:00:00.000Z');
    await write('a.llc', project([1]));
    await write('b.llc', project([1]));
    await setTime('a.llc', t);
    await setTime('b.llc', t + 1000);
    const at = (name: string) => path.join(dir, name);
    expect(await files().findNewestProjectFile([at('a.llc'), at('b.llc'), at('missing.llc')])).toBe(at('b.llc'));
    expect(await files().findNewestProjectFile([at('missing.llc')])).toBeUndefined();
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

  it('is left alone when it is the copy being opened, isn\'t there, or the edits being opened can\'t be read', async () => {
    await write('source.llc', project([5]));
    expect(await files().keepCopiesAboutToBeReplaced([at('source.llc'), at('missing.llc')], at('source.llc'))).toEqual([]);
    await write('copy.llc', project([1]));
    await write('broken.llc', '{ not json');
    expect(await files().keepCopiesAboutToBeReplaced([at('copy.llc')], at('broken.llc'))).toEqual([]);
    expect(await backups()).toEqual([]);
    expect(await readProject(at('copy.llc'))).toEqual(project([1]));
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
