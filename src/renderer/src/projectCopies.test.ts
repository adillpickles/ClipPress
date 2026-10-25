import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { filterProjectsOf, findProjectCopies, isProjectOf } from './projectCopies';
import type { ProjectMediaRef } from './projectCopies';
import { getReplacedBackupPath, getStoredProjectPath } from './projectStore';
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
