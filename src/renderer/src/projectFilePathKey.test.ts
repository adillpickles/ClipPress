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
  const key = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath });

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

  it('works for a folder that cannot be resolved, by the path as written', () => {
    expect(key(String.raw`E:\Gone\clip-proj.llc`)).toBe(key('e:/gone/CLIP-proj.llc'));
  });

  it('keeps the key a path first got, even once its folder can be resolved', () => {
    const resolvable = { value: false };
    const keyOf = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath: () => (resolvable.value ? String.raw`D:\Real` : missing()) });
    const before = keyOf(String.raw`C:\Link\clip-proj.llc`);
    resolvable.value = true;
    expect(keyOf(String.raw`C:\Link\clip-proj.llc`)).toBe(before);
    expect(keyOf(String.raw`C:\Other\clip-proj.llc`)).toBe(String.raw`D:\REAL\CLIP-PROJ.LLC`);
  });

  it('resolves each path once', () => {
    const spy = vi.fn(realpath);
    const keyOf = createProjectFilePathKey({ path: win32, caseInsensitive: true, realpath: spy });
    keyOf(String.raw`D:\Videos\clip-proj.llc`);
    keyOf(String.raw`D:\Videos\clip-proj.llc`);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('createProjectFilePathKey elsewhere', () => {
  it('resolves linked folders but keeps names that differ in case apart', () => {
    const key = createProjectFilePathKey({ path: posix, caseInsensitive: false, realpath: (dir) => (dir === '/tmp' ? '/private/tmp' : dir) });
    expect(key('/tmp/clip-proj.llc')).toBe(key('/private/tmp/./clip-proj.llc'));
    expect(key('/videos/clip-proj.llc')).not.toBe(key('/videos/Clip-proj.llc'));
  });
});
