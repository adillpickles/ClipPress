import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { filterOwnProjectCopies, filterProjectsOf, findProjectCopies, findRelocatedProjectCopies, isProjectOf } from './projectCopies';
import type { ProjectMediaRef } from './projectCopies';
import { getProjectCopiesToRetire, getProjectLookupPaths, getProjectSavePaths, getReplacedBackupPath, getStoredProjectPath } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';

const win = path.win32;
const env: ProjectStoreEnv = {
  join: win.join,
  dirname: win.dirname,
  parseName: (p) => win.parse(p).name,
  dataDir: String.raw`C:\Users\Me\AppData\Roaming\ClipPress`,
  caseInsensitive: true,
};
const media = String.raw`D:\Clips\clip.mp4`;
const stored = getStoredProjectPath(media, env);
const beside = String.raw`D:\Clips\clip-proj.llc`;
const inExports = String.raw`E:\Exports\clip-proj.llc`;
const time = Date.parse('2026-09-01T10:00:00.000Z');

describe('a recording\'s edits', () => {
  it('are the files that name the recording, or older ones next to it', () => {
    expect(isProjectOf(media, stored, { mediaFilePath: 'd:/clips/CLIP.mp4' }, env)).toBe(true);
    expect(isProjectOf(media, inExports, { mediaFilePath: String.raw`F:\Other\clip.mp4` }, env)).toBe(false);
    // Older files say only the recording's name: only next to it.
    expect(isProjectOf(media, beside, { mediaFileName: 'clip.mp4' }, env)).toBe(true);
    expect(isProjectOf(media, beside, {}, env)).toBe(true);
    expect(isProjectOf(media, beside, { mediaFileName: 'other.mp4' }, env)).toBe(false);
    expect(isProjectOf(media, inExports, { mediaFileName: 'clip.mp4' }, env)).toBe(false);
    // A file that can't be read is left alone.
    expect(isProjectOf(media, stored, undefined, env)).toBe(false);
  });

  it('are found everywhere they can be, with their backups, and only this recording\'s', async () => {
    const files: Record<string, ProjectMediaRef> = {
      [stored]: { mediaFilePath: media },
      [getReplacedBackupPath(stored, time)]: { mediaFilePath: media },
      [beside]: { mediaFileName: 'clip.mp4' },
      [getReplacedBackupPath(beside, time)]: { mediaFilePath: media },
      // Another recording called clip.mp4 that exports to the same folder
      [inExports]: { mediaFilePath: String.raw`F:\Other\clip.mp4` },
      [String.raw`D:\Clips\clip 2-proj.llc`]: { mediaFilePath: String.raw`D:\Clips\clip 2.mp4` },
    };
    const list = async (folder: string) => Object.keys(files).filter((p) => win.dirname(p) === folder).map((p) => win.basename(p));
    const read = async (p: string) => files[p];
    const copies = await findProjectCopies(media, { customOutDir: String.raw`E:\Exports`, env, list, read });
    expect(copies.sort()).toEqual([stored, getReplacedBackupPath(stored, time), beside, getReplacedBackupPath(beside, time)].sort());
  });

  // A recording found in a new place (#16): its old place's copies go to the Recycle Bin, but only its own.
  it('are told apart from another recording\'s with the same name in the export folder', async () => {
    const files: Record<string, ProjectMediaRef> = {
      [stored]: { mediaFilePath: media },
      [inExports]: { mediaFilePath: String.raw`F:\Other\clip.mp4` },
      [beside]: { mediaFileName: 'clip.mp4' },
    };
    const read = async (p: string) => files[p];
    expect(await filterProjectsOf(media, [stored, inExports, beside], { env, read })).toEqual([stored, beside]);
    files[inExports] = { mediaFilePath: media };
    expect(await filterProjectsOf(media, [stored, inExports, beside], { env, read })).toEqual([stored, inExports, beside]);
    // Not one that can't be read, nor an older one away from the recording that gives only its name.
    files[inExports] = { mediaFileName: 'clip.mp4' };
    expect(await filterProjectsOf(media, [inExports, String.raw`D:\Clips\gone-proj.llc`], { env, read })).toEqual([]);
  });

  it('are found without an export folder, or when a folder can\'t be listed', async () => {
    const copies = await findProjectCopies(media, { customOutDir: undefined, env, list: async () => [], read: async (p) => (p === stored ? { mediaFilePath: media } : undefined) });
    expect(copies).toEqual([stored]);
  });
});

// "In ClipPress": the copies found in older places when a recording opens go once its edits are saved in ClipPress's folder.
describe('the edits a recording found in older places when it opened', () => {
  const other = String.raw`F:\Other\clip.mp4`;
  const toRetire = (customOutDir: string | undefined) => getProjectCopiesToRetire(getProjectLookupPaths(media, 'app', customOutDir, env), 'app', getProjectSavePaths(media, 'app', customOutDir, env), true);

  it('are not another recording\'s with the same name in the export folder, even when it was the one opened', async () => {
    const files: Record<string, ProjectMediaRef> = { [inExports]: { mediaFilePath: other }, [beside]: { mediaFileName: 'clip.mp4' } };
    const read = async (p: string) => files[p];
    expect(toRetire(String.raw`E:\Exports`)).toEqual([inExports, beside]);
    expect(await filterOwnProjectCopies(media, toRetire(String.raw`E:\Exports`), { openedPath: stored, env, read })).toEqual([beside]);
    // This recording had none of its own, so the other's opened.
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: inExports, env, read })).toEqual([]);
    // Older ones that give another name, or can't be read, stay too.
    files[inExports] = { mediaFileName: 'other.mp4' };
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: inExports, env, read })).toEqual([]);
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: inExports, env, read: async () => undefined })).toEqual([]);
  });

  it('are its own in the export folder: one that says so, or an older one opened that gives only its name', async () => {
    const files: Record<string, ProjectMediaRef> = { [inExports]: { mediaFilePath: media } };
    const read = async (p: string) => files[p];
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: stored, env, read })).toEqual([inExports]);
    files[inExports] = { mediaFileName: 'clip.mp4' };
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: inExports, env, read })).toEqual([inExports]);
    files[inExports] = {};
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: inExports, env, read })).toEqual([inExports]);
    // Not opened, it can't be told from another recording's.
    files[inExports] = { mediaFileName: 'clip.mp4' };
    expect(await filterOwnProjectCopies(media, [inExports], { openedPath: stored, env, read })).toEqual([]);
  });

  it('include the one next to it, whatever it notes', async () => {
    // Its folder moved, or its drive has a new letter: it still notes where the recording was.
    const read = async () => ({ mediaFilePath: String.raw`G:\Clips\clip.mp4` });
    expect(toRetire(undefined)).toEqual([beside]);
    expect(await filterOwnProjectCopies(media, [beside], { openedPath: beside, env, read })).toEqual([beside]);
    expect(await filterOwnProjectCopies(media, [beside], { openedPath: stored, env, read })).toEqual([beside]);
  });
});

// A recording found in a new place (#16): what it left at its old places goes once the edits are saved for the new one.
describe('the edits a recording found somewhere else left behind', () => {
  const oldFolder = String.raw`D:\Old folder\clip.mp4`;
  const newFolder = String.raw`D:\New folder\clip.mp4`;
  const renamed = String.raw`D:\New folder\Renamed.mp4`;
  const opened = String.raw`D:\New folder\clip-proj.llc`;
  const options = (files: Record<string, ProjectMediaRef & { mtimeMs: number }>, customOutDir?: string) => ({
    customOutDir,
    env,
    read: async (p: string) => files[p],
    notNewerThan: async (paths: readonly string[], reference: string) => paths.filter((p) => files[p] != null && files[p].mtimeMs <= files[reference]!.mtimeMs),
  });

  it('are the file opened and the copies of each place it was, when moved with its project file and renamed', async () => {
    const files = {
      // Moved with the recording, and opened there without a change: it still notes the old folder.
      [opened]: { mediaFilePath: oldFolder, mtimeMs: 2 },
      [getStoredProjectPath(oldFolder, env)]: { mediaFilePath: oldFolder, mtimeMs: 1 },
      [getStoredProjectPath(newFolder, env)]: { mediaFilePath: newFolder, mtimeMs: 2 },
    };
    const copies = await findRelocatedProjectCopies({ oldMediaPaths: [newFolder, oldFolder], newMediaPath: renamed, openedPath: opened }, options(files));
    expect(copies).toEqual([opened, getStoredProjectPath(newFolder, env), getStoredProjectPath(oldFolder, env)]);
  });

  it('are not a copy saved later than the edits opened, nor another recording\'s', async () => {
    const files = {
      [opened]: { mediaFilePath: oldFolder, mtimeMs: 2 },
      [getStoredProjectPath(newFolder, env)]: { mediaFilePath: newFolder, mtimeMs: 3 },
      // Another recording called clip.mp4 that exports to the same folder
      [String.raw`E:\Exports\clip-proj.llc`]: { mediaFilePath: String.raw`F:\Other\clip.mp4`, mtimeMs: 1 },
    };
    const copies = await findRelocatedProjectCopies({ oldMediaPaths: [newFolder, oldFolder], newMediaPath: renamed, openedPath: opened }, options(files, String.raw`E:\Exports`));
    expect(copies).toEqual([opened]);
  });

  it('are not the file opened when it isn\'t at one of its places', async () => {
    const shared = String.raw`E:\Downloads\clip-proj.llc`;
    const files = {
      [shared]: { mediaFilePath: oldFolder, mtimeMs: 2 },
      [getStoredProjectPath(oldFolder, env)]: { mediaFilePath: oldFolder, mtimeMs: 1 },
    };
    const copies = await findRelocatedProjectCopies({ oldMediaPaths: [oldFolder], newMediaPath: renamed, openedPath: shared }, options(files));
    expect(copies).toEqual([getStoredProjectPath(oldFolder, env)]);
  });

  it('are listed once, though found from two places', async () => {
    // The export folder's copy goes by the name only: both old places have it.
    const exported = String.raw`E:\Exports\clip-proj.llc`;
    const files = { [exported]: { mediaFilePath: oldFolder, mtimeMs: 2 } };
    const copies = await findRelocatedProjectCopies({ oldMediaPaths: [newFolder, oldFolder], newMediaPath: renamed, openedPath: exported }, options(files, String.raw`E:\Exports`));
    expect(copies).toEqual([exported]);
  });
});
