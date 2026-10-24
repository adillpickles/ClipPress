import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { findProjectCopies, isProjectOf } from './projectCopies';
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

  it('are found without an export folder, or when a folder can\'t be listed', async () => {
    const copies = await findProjectCopies(media, { customOutDir: undefined, env, list: async () => [], read: async (p) => (p === stored ? { mediaFilePath: media } : undefined) });
    expect(copies).toEqual([stored]);
  });
});
