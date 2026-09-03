import { posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isUnsafeOutputFileName } from './outputPathSafety';

describe('isUnsafeOutputFileName on posix', () => {
  const outputDir = '/home/user/out';
  const check = (fileName: string) => isUnsafeOutputFileName({ fileName, outputDir, path: posix });

  it('allows plain and nested names', () => {
    expect(check('clip.mp4')).toBe(false);
    expect(check('My Video - 01.mkv')).toBe(false);
    expect(check('season 1/ep 1.mp4')).toBe(false);
    expect(check('a/b/c/deep.mp4')).toBe(false);
    // dots that are not a parent segment
    expect(check('..hidden.mp4')).toBe(false);
    expect(check('a..b/c.mp4')).toBe(false);
    // a backslash is a legal character in a posix file name
    expect(check(String.raw`back\slash.mp4`)).toBe(false);
  });

  it('rejects parent traversal', () => {
    expect(check('../escaped.mp4')).toBe(true);
    expect(check('../../../../etc/cron.d/evil')).toBe(true);
    expect(check('sub/../../escaped.mp4')).toBe(true);
    expect(check('..')).toBe(true);
  });

  it('rejects absolute paths', () => {
    expect(check('/etc/cron.d/evil')).toBe(true);
    expect(check('/home/user/out/clip.mp4')).toBe(true);
  });

  it('rejects a name that resolves to the output directory itself', () => {
    expect(check('.')).toBe(true);
    expect(check('sub/..')).toBe(true);
  });

  it('does not treat a sibling directory with a shared prefix as contained', () => {
    expect(check('../outside/x.mp4')).toBe(true);
  });
});

describe('isUnsafeOutputFileName on windows', () => {
  const outputDir = String.raw`D:\Videos\out`;
  const check = (fileName: string) => isUnsafeOutputFileName({ fileName, outputDir, path: win32 });

  it('allows plain and nested names with either separator', () => {
    expect(check('clip.mp4')).toBe(false);
    expect(check(String.raw`season 1\ep 1.mp4`)).toBe(false);
    expect(check('season 1/ep 1.mp4')).toBe(false);
    expect(check('..hidden.mp4')).toBe(false);
  });

  it('rejects parent traversal written with either separator', () => {
    expect(check(String.raw`..\escaped.mp4`)).toBe(true);
    expect(check('../escaped.mp4')).toBe(true);
    expect(check(String.raw`sub\..\..\escaped.mp4`)).toBe(true);
    expect(check(String.raw`..\..\Windows\System32\evil.exe`)).toBe(true);
  });

  it('rejects absolute, drive and UNC forms', () => {
    expect(check(String.raw`C:\Windows\System32\evil.exe`)).toBe(true);
    expect(check('C:/Windows/System32/evil.exe')).toBe(true);
    // drive-relative: resolves against that drive's current directory
    expect(check('C:evil.exe')).toBe(true);
    expect(check(String.raw`\\server\share\evil.exe`)).toBe(true);
    expect(check(String.raw`\evil.exe`)).toBe(true);
    expect(check('/evil.exe')).toBe(true);
  });

  it('compares case insensitively', () => {
    expect(isUnsafeOutputFileName({ fileName: 'clip.mp4', outputDir: String.raw`D:\VIDEOS\Out`, path: win32 })).toBe(false);
  });

  it('allows nested names when the output directory is a drive root', () => {
    expect(isUnsafeOutputFileName({ fileName: String.raw`sub\clip.mp4`, outputDir: 'D:\\', path: win32 })).toBe(false);
    expect(isUnsafeOutputFileName({ fileName: String.raw`..\clip.mp4`, outputDir: 'D:\\', path: win32 })).toBe(true);
  });

  it('allows nested names when the output directory has a trailing separator', () => {
    expect(isUnsafeOutputFileName({ fileName: String.raw`sub\clip.mp4`, outputDir: 'D:\\Videos\\out\\', path: win32 })).toBe(false);
  });
});
