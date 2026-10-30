import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { getProjectCopiesToRetire, getProjectLookupPaths, getProjectSavePath, getProjectSavePaths, getRelocatedProjectCopies, getReplacedBackupPath, getReplacedBackupTime, getSidecarProjectPath, getStoredProjectFileName, getStoredProjectPath, isReplacedBackupName, isReplacedBackupOf } from './projectStore';
import type { ProjectStoreEnv } from './projectStore';

const win = path.win32;
const env: ProjectStoreEnv = {
  join: win.join,
  dirname: win.dirname,
  parseName: (p) => win.parse(p).name,
  dataDir: String.raw`C:\Users\Me\AppData\Roaming\ClipPress`,
  caseInsensitive: true,
};
const media = String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16.mp4`;

describe('project store', () => {
  it('names a project after its recording, with a hash of the full path', () => {
    const name = getStoredProjectFileName(media, true);
    expect(name).toMatch(/^Valorant 2026\.10\.19 - 21\.51\.16-[\da-f]{16}\.llc$/);
    expect(getStoredProjectPath(media, env)).toBe(`C:\\Users\\Me\\AppData\\Roaming\\ClipPress\\Projects\\${name}`);
  });

  it('keeps the same project however the path is written on Windows, and apart for other folders', () => {
    const name = getStoredProjectFileName(media, true);
    // Same file on a case-insensitive file system (the hash is identical)
    expect(getStoredProjectFileName('d:/clips/VALORANT 2026.10.19 - 21.51.16.mp4', true).toLowerCase()).toBe(name.toLowerCase());
    expect(getStoredProjectFileName(String.raw`D:\Other\Valorant 2026.10.19 - 21.51.16.mp4`, true)).not.toBe(name);
    // The same file written with "." / ".." / doubled separators
    const hashOf = (p: string) => getStoredProjectFileName(p, true).slice(-20);
    expect(hashOf(String.raw`D:\Clips\.\Valorant 2026.10.19 - 21.51.16.mp4`)).toBe(hashOf(media));
    expect(hashOf(String.raw`D:\Clips\Sub\..\Valorant 2026.10.19 - 21.51.16.mp4`)).toBe(hashOf(media));
    expect(hashOf(String.raw`D:\Clips\\Valorant 2026.10.19 - 21.51.16.mp4`)).toBe(hashOf(media));
    expect(hashOf(String.raw`D:\..\Clips\Valorant 2026.10.19 - 21.51.16.mp4`)).toBe(hashOf(media));
    // ".." stays within a network share
    expect(hashOf(String.raw`\\srv\share\..\other\a.mp4`)).toBe(hashOf(String.raw`\\srv\share\other\a.mp4`));
    expect(hashOf(String.raw`\\srv\share\..\other\a.mp4`)).not.toBe(hashOf(String.raw`\\srv\other\a.mp4`));
    // A network share stays a network share
    expect(hashOf(String.raw`\\server\share\a.mp4`)).not.toBe(hashOf(String.raw`\server\share\a.mp4`));
    // Case matters where the file system says so
    expect(getStoredProjectFileName('/clips/a.mp4', false)).not.toBe(getStoredProjectFileName('/clips/A.mp4', false));
  });

  it('turns characters Windows forbids into underscores and keeps names short', () => {
    expect(getStoredProjectFileName('/x/what?:*|"<>.mkv', false)).toMatch(/^what_______-[\da-f]{16}\.llc$/);
    expect(getStoredProjectFileName(`/x/${'a'.repeat(200)}.mp4`, false).length).toBeLessThan(90);
  });

  it('finds projects saved next to the recording by older versions', () => {
    expect(getSidecarProjectPath(media, undefined, env)).toBe(String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`);
    expect(getSidecarProjectPath(media, String.raw`E:\Exports`, env)).toBe(String.raw`E:\Exports\Valorant 2026.10.19 - 21.51.16-proj.llc`);
  });

  it('saves where the setting says and looks there first, then everywhere else once', () => {
    const stored = getStoredProjectPath(media, env);
    const beside = String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`;
    const exportFolder = String.raw`E:\Exports\Valorant 2026.10.19 - 21.51.16-proj.llc`;
    expect(getProjectSavePath(media, 'app', undefined, env)).toBe(stored);
    expect(getProjectSavePath(media, 'recording', String.raw`E:\Exports`, env)).toBe(beside);
    expect(getProjectSavePath(media, 'exportFolder', String.raw`E:\Exports`, env)).toBe(exportFolder);
    expect(getProjectLookupPaths(media, 'app', String.raw`E:\Exports`, env)).toEqual([stored, exportFolder, beside]);
    expect(getProjectLookupPaths(media, 'recording', undefined, env)).toEqual([beside, stored]);
    // Without an export folder, "export folder" falls back to next to the recording
    expect(getProjectLookupPaths(media, 'exportFolder', undefined, env)).toEqual([beside, stored]);
  });

  describe('"Both" (#90)', () => {
    const stored = getStoredProjectPath(media, env);
    const beside = String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`;
    const exportFolder = String.raw`E:\Exports\Valorant 2026.10.19 - 21.51.16-proj.llc`;

    it('saves in ClipPress\'s folder first, and a copy next to the recording', () => {
      expect(getProjectSavePath(media, 'both', String.raw`E:\Exports`, env)).toBe(stored);
      expect(getProjectSavePaths(media, 'both', String.raw`E:\Exports`, env)).toEqual([stored, beside]);
      // The other settings save in one place
      expect(getProjectSavePaths(media, 'app', String.raw`E:\Exports`, env)).toEqual([stored]);
      expect(getProjectSavePaths(media, 'recording', undefined, env)).toEqual([beside]);
      expect(getProjectSavePaths(media, 'exportFolder', String.raw`E:\Exports`, env)).toEqual([exportFolder]);
    });

    it('looks in both places and the export folder, ClipPress\'s folder first', () => {
      expect(getProjectLookupPaths(media, 'both', String.raw`E:\Exports`, env)).toEqual([stored, exportFolder, beside]);
    });

    it('never retires the copy next to the recording, only one where no setting saves now', () => {
      const found = [stored, exportFolder, beside];
      expect(getProjectCopiesToRetire(found, 'both', getProjectSavePaths(media, 'both', undefined, env), true)).toEqual([exportFolder]);
      expect(getProjectCopiesToRetire(found, 'app', getProjectSavePaths(media, 'app', undefined, env), true)).toEqual([exportFolder, beside]);
      // Saving next to the recording or in the export folder retires nothing, as before.
      expect(getProjectCopiesToRetire(found, 'recording', [beside], true)).toEqual([]);
      expect(getProjectCopiesToRetire(found, 'exportFolder', [exportFolder], true)).toEqual([]);
      // However the same file is written
      expect(getProjectCopiesToRetire([beside.toUpperCase()], 'both', [stored, beside], true)).toEqual([]);
    });
  });

  describe('a recording found in a new place (#16)', () => {
    const moved = String.raw`E:\Archive\Valorant 2026.10.19 - 21.51.16.mp4`;

    it('gives the edits the new place\'s project, and leaves the old place\'s copies to retire', () => {
      const oldStored = getStoredProjectPath(media, env);
      const newStored = getStoredProjectPath(moved, env);
      expect(newStored).not.toBe(oldStored);
      expect(getProjectSavePath(moved, 'app', undefined, env)).toBe(newStored);
      expect(getRelocatedProjectCopies(media, moved, undefined, env)).toEqual([oldStored, String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`]);
    });

    it('does not retire a copy the recording at its new place reads too', () => {
      // Only the case of the name changed: the same file on Windows, the same project.
      expect(getRelocatedProjectCopies(media, media.toLowerCase(), undefined, env)).toEqual([]);
      // Renamed in the same folder: the old name's copies go, the folder stays.
      const renamed = String.raw`D:\Clips\Ace.mp4`;
      expect(getRelocatedProjectCopies(media, renamed, undefined, env)).toEqual([getStoredProjectPath(media, env), String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`]);
    });

    it('retires the copy kept in the export folder under the old name too', () => {
      const exports = String.raw`E:\Exports`;
      const oldInExports = String.raw`E:\Exports\Valorant 2026.10.19 - 21.51.16-proj.llc`;
      const renamed = String.raw`D:\Clips\Ace.mp4`;
      expect(getRelocatedProjectCopies(media, renamed, exports, env)).toEqual([getStoredProjectPath(media, env), oldInExports, String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`]);
      // Moved, not renamed: the export folder's copy is the one the recording reads at its new place as well.
      expect(getRelocatedProjectCopies(media, moved, exports, env)).toEqual([getStoredProjectPath(media, env), String.raw`D:\Clips\Valorant 2026.10.19 - 21.51.16-proj.llc`]);
      // Exporting next to the recordings: one copy, listed once.
      expect(getRelocatedProjectCopies(media, String.raw`E:\Archive\Ace.mp4`, String.raw`d:\clips`, env)).toEqual([getStoredProjectPath(media, env), String.raw`d:\clips\Valorant 2026.10.19 - 21.51.16-proj.llc`]);
    });
  });

  describe('backups kept when a project is replaced', () => {
    const time = Date.parse('2026-10-24T09:08:07.006Z');

    it('are named after the project with the time, which can be read back', () => {
      const backup = getReplacedBackupPath(String.raw`C:\Data\Projects\clip-0123456789abcdef.llc`, time);
      expect(backup).toBe(String.raw`C:\Data\Projects\clip-0123456789abcdef.replaced-2026-10-24T09-08-07-006Z.llc`);
      expect(getReplacedBackupTime(win.basename(backup))).toBe(time);
      expect(getReplacedBackupTime('clip-0123456789abcdef.llc')).toBeUndefined();
      expect(getReplacedBackupTime('clip.replaced-yesterday.llc')).toBeUndefined();
    });

    it('are told apart from projects, and matched to their own project only', () => {
      const backupName = win.basename(getReplacedBackupPath('clip-proj.llc', time));
      expect(isReplacedBackupName(backupName)).toBe(true);
      expect(isReplacedBackupName('clip-proj.llc')).toBe(false);
      expect(isReplacedBackupOf('clip-proj.llc', backupName, true)).toBe(true);
      expect(isReplacedBackupOf('CLIP-proj.llc', backupName, true)).toBe(true);
      expect(isReplacedBackupOf('CLIP-proj.llc', backupName, false)).toBe(false);
      expect(isReplacedBackupOf('clip 2-proj.llc', backupName, true)).toBe(false);
      expect(isReplacedBackupOf('clip-proj.llc', 'clip-proj.llc', true)).toBe(false);
    });
  });
});
