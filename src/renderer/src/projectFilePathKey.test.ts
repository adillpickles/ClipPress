import { posix, win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import createProjectFilePathKey from './projectFilePathKey';

const missing = () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };

describe('createProjectFilePathKey on Windows', () => {
  /** Folders as they are on disk, by any name that reaches them (as Windows' realpath resolves them). */
  const folders: Record<string, string> = {
    [String.raw`D:\VIDEOS`]: String.raw`D:\Videos`,
    [String.raw`D:\VIDEOS\CLIPS`]: String.raw`D:\Videos\Clips`,
    [String.raw`D:\VIDEOS\LONGFO~1`]: String.raw`D:\Videos\Long folder name`,
    [String.raw`D:\VIDEOS\LONG FOLDER NAME`]: String.raw`D:\Videos\Long folder name`,
    // A junction, a subst drive and a mapped drive to the same folder.
    [String.raw`C:\USERS\ME\VIDEOS`]: String.raw`D:\Videos`,
    [`S:${win32.sep}`]: String.raw`D:\Videos`,
    [String.raw`Z:\CLIPS`]: String.raw`\\nas\share\Clips`,
    [String.raw`\\NAS\SHARE\CLIPS`]: String.raw`\\nas\share\Clips`,
  };
  const realpath = (dir: string) => folders[dir.toUpperCase()] ?? missing();
  const keyOf = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath });
  const key = (filePath: string) => keyOf(filePath).key;

  it('gives every path to the same file the same key', () => {
    const expected = key(String.raw`D:\Videos\clip-proj.llc`);
    for (const alias of [
      String.raw`d:\videos\CLIP-proj.llc`,
      'D:/Videos/clip-proj.llc',
      String.raw`D:\Videos\Clips\..\.\clip-proj.llc`,
      String.raw`C:\Users\me\Videos\clip-proj.llc`,
      String.raw`S:\clip-proj.llc`,
    ]) expect(key(alias)).toBe(expected);
    expect(key(String.raw`D:\Videos\Long folder name\a-proj.llc`)).toBe(key(String.raw`d:\videos\LONGFO~1\A-PROJ.LLC`));
    expect(key(String.raw`Z:\Clips\a-proj.llc`)).toBe(key(String.raw`\\nas\share\clips\a-proj.llc`));
  });

  it('keeps different files apart', () => {
    expect(key(String.raw`D:\Videos\clip-proj.llc`)).not.toBe(key(String.raw`D:\Videos\Clips\clip-proj.llc`));
    expect(key(String.raw`D:\Videos\clip-proj.llc`)).not.toBe(key(String.raw`D:\Videos\clip2-proj.llc`));
    // Windows does not treat 'ß' and 'ss' as the same name.
    expect(key(String.raw`D:\Videos\straße-proj.llc`)).not.toBe(key(String.raw`D:\Videos\STRASSE-proj.llc`));
  });

  it('works for a folder that cannot be resolved, by the path as written, and says so', () => {
    expect(keyOf(String.raw`E:\Gone\clip-proj.llc`)).toEqual({ key: String.raw`E:\GONE\CLIP-PROJ.LLC`, resolved: false });
    expect(key(String.raw`E:\Gone\clip-proj.llc`)).toBe(key('e:/gone/CLIP-proj.llc'));
    expect(keyOf(String.raw`D:\Videos\clip-proj.llc`).resolved).toBe(true);
  });

  // PR #56 re-audit 3 finding 2: a key made while the folder could not be resolved was kept for good.
  it('resolves a path again once its folder can be resolved, rather than keep the key as written', () => {
    const resolvable = { value: false };
    const keyOfLink = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath: () => (resolvable.value ? String.raw`D:\Real` : missing()) });
    expect(keyOfLink(String.raw`C:\Link\clip-proj.llc`)).toEqual({ key: String.raw`C:\LINK\CLIP-PROJ.LLC`, resolved: false });
    resolvable.value = true;
    expect(keyOfLink(String.raw`C:\Link\clip-proj.llc`)).toEqual({ key: String.raw`D:\REAL\CLIP-PROJ.LLC`, resolved: true });
    // Once resolved, it stays.
    resolvable.value = false;
    expect(keyOfLink(String.raw`C:\Link\clip-proj.llc`)).toEqual({ key: String.raw`D:\REAL\CLIP-PROJ.LLC`, resolved: true });
  });

  it('tells a folder that exists but cannot be resolved apart by what it is, until it can be resolved', () => {
    // R: is a RAM drive whose folders realpath cannot resolve; L:\Link is a junction to R:\Clips.
    const ids: Record<string, bigint> = { [String.raw`R:\CLIPS`]: 7n, [String.raw`L:\LINK`]: 7n, [String.raw`R:\OTHER`]: 8n };
    const keyOfRam = createProjectFilePathKey({
      path: win32,
      caseInsensitive: true,
      realpath: missing,
      identity: (dir) => {
        const ino = ids[dir.toUpperCase()];
        if (ino == null) throw missing();
        return { dev: 3n, ino };
      },
    });
    const viaDrive = keyOfRam(String.raw`R:\Clips\clip-proj.llc`);
    expect(viaDrive.resolved).toBe(false);
    expect(keyOfRam(String.raw`L:\Link\CLIP-proj.llc`)).toEqual(viaDrive);
    expect(keyOfRam(String.raw`R:\Other\clip-proj.llc`).key).not.toBe(viaDrive.key);
    // A folder that cannot be reached at all, or a volume without IDs: as written.
    expect(keyOfRam(String.raw`Q:\Gone\clip-proj.llc`)).toEqual({ key: String.raw`Q:\GONE\CLIP-PROJ.LLC`, resolved: false });
    const withoutIds = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath: missing, identity: () => ({ dev: 3n, ino: 0n }) });
    expect(withoutIds(String.raw`R:\Clips\clip-proj.llc`).key).toBe(String.raw`R:\CLIPS\CLIP-PROJ.LLC`);
  });

  it('resolves each path once it has been resolved', () => {
    const spy = vi.fn(realpath);
    const keyOfSpied = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath: spy });
    keyOfSpied(String.raw`D:\Videos\clip-proj.llc`);
    keyOfSpied(String.raw`D:\Videos\clip-proj.llc`);
    expect(spy).toHaveBeenCalledTimes(1);
    keyOfSpied(String.raw`E:\Gone\clip-proj.llc`);
    keyOfSpied(String.raw`E:\Gone\clip-proj.llc`);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe('createProjectFilePathKey elsewhere', () => {
  it('resolves linked folders but keeps names that differ in case apart', () => {
    const keyOf = createProjectFilePathKey({ path: posix, caseInsensitive: false, realpath: (dir) => (dir === '/tmp' ? '/private/tmp' : dir) });
    const key = (filePath: string) => keyOf(filePath).key;
    expect(key('/tmp/clip-proj.llc')).toBe(key('/private/tmp/./clip-proj.llc'));
    expect(key('/videos/clip-proj.llc')).not.toBe(key('/videos/Clip-proj.llc'));
  });
});
