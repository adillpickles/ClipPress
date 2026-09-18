import { posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  addFileNameMarker,
  isProtectedSourcePath,
  isSameFilePath,
  makeSourceSafeFileName,
  makeSourceSafeFileNames,
  normalizeComparablePath,
} from './sourcePathProtection';

describe('isSameFilePath', () => {
  it('matches the same posix path written differently', () => {
    const check = (a: string, b: string) => isSameFilePath({ a, b, path: posix });
    expect(check('/home/u/clip.mp4', '/home/u/clip.mp4')).toBe(true);
    expect(check('/home/u/./clip.mp4', '/home/u/clip.mp4')).toBe(true);
    expect(check('/home/u/sub/../clip.mp4', '/home/u/clip.mp4')).toBe(true);
  });

  it('is case sensitive on posix and case insensitive on windows', () => {
    expect(isSameFilePath({ a: '/home/u/Clip.mp4', b: '/home/u/clip.mp4', path: posix })).toBe(false);
    expect(isSameFilePath({ a: String.raw`C:\v\Clip.mp4`, b: String.raw`C:\v\clip.mp4`, path: win32 })).toBe(true);
  });

  it('treats separators interchangeably on windows', () => {
    expect(isSameFilePath({ a: 'C:/videos/clip.mp4', b: String.raw`C:\videos\clip.mp4`, path: win32 })).toBe(true);
  });

  it('does not match different files', () => {
    expect(isSameFilePath({ a: '/home/u/clip.mp4', b: '/home/u/clip2.mp4', path: posix })).toBe(false);
    expect(isSameFilePath({ a: '/home/u/clip.mp4', b: '/home/other/clip.mp4', path: posix })).toBe(false);
  });

  it('never matches when either side is missing', () => {
    expect(isSameFilePath({ a: undefined, b: '/home/u/clip.mp4', path: posix })).toBe(false);
    expect(isSameFilePath({ a: '/home/u/clip.mp4', b: undefined, path: posix })).toBe(false);
  });
});

describe('normalizeComparablePath', () => {
  it('honours an explicit caseInsensitive override', () => {
    expect(normalizeComparablePath({ filePath: '/A/B.mp4', path: posix, caseInsensitive: true })).toBe('/a/b.mp4');
  });
});

describe('isProtectedSourcePath', () => {
  const protectedPaths = [String.raw`C:\videos\source.mp4`, undefined];

  it('detects the loaded source file however the candidate is spelled', () => {
    const check = (candidate: string) => isProtectedSourcePath({ candidate, protectedPaths, path: win32 });
    expect(check(String.raw`C:\videos\source.mp4`)).toBe(true);
    expect(check('C:/videos/source.mp4')).toBe(true);
    expect(check(String.raw`C:\videos\SOURCE.MP4`)).toBe(true);
    expect(check(String.raw`C:\videos\sub\..\source.mp4`)).toBe(true);
  });

  it('allows genuinely different destinations', () => {
    const check = (candidate: string) => isProtectedSourcePath({ candidate, protectedPaths, path: win32 });
    expect(check(String.raw`C:\videos\source (clip).mp4`)).toBe(false);
    expect(check(String.raw`C:\videos\out\source.mp4`)).toBe(false);
  });

  it('tolerates undefined entries in the protected list', () => {
    expect(isProtectedSourcePath({ candidate: undefined, protectedPaths, path: win32 })).toBe(false);
  });
});

describe('addFileNameMarker', () => {
  it('inserts the marker before the extension', () => {
    expect(addFileNameMarker({ fileName: 'clip.mp4', marker: 'clip', path: posix })).toBe('clip (clip).mp4');
  });

  it('keeps a nested directory prefix intact', () => {
    expect(addFileNameMarker({ fileName: 'sub/clip.mp4', marker: 'clip', path: posix })).toBe('sub/clip (clip).mp4');
  });

  it('handles a name with no extension', () => {
    expect(addFileNameMarker({ fileName: 'clip', marker: 'clip', path: posix })).toBe('clip (clip)');
  });
});

describe('makeSourceSafeFileName', () => {
  const outputDir = String.raw`C:\videos`;
  const protectedPaths = [String.raw`C:\videos\source.mp4`];
  const make = (fileName: string, isTaken?: (name: string) => boolean) => makeSourceSafeFileName({
    fileName, outputDir, protectedPaths, path: win32, isTaken,
  });

  it('leaves a safe name untouched', () => {
    expect(make('other.mp4')).toBe('other.mp4');
  });

  it('rewrites a name that resolves to the source file', () => {
    expect(make('source.mp4')).toBe('source (clip).mp4');
  });

  it('rewrites a case-different spelling of the source file on windows', () => {
    expect(make('SOURCE.MP4')).toBe('SOURCE (clip).MP4');
  });

  it('keeps disambiguating while the marked name is also taken', () => {
    const taken = new Set(['source (clip).mp4', 'source (clip 2).mp4']);
    expect(make('source.mp4', (name) => taken.has(name))).toBe('source (clip 3).mp4');
  });

  it('rewrites a name that only collides through the reserved set', () => {
    expect(make('other.mp4', (name) => name === 'other.mp4')).toBe('other (clip).mp4');
  });
});

describe('makeSourceSafeFileNames', () => {
  const outputDir = String.raw`C:\videos`;
  const protectedPaths = [String.raw`C:\videos\source.mp4`];
  const run = (fileNames: string[]) => makeSourceSafeFileNames({ fileNames, outputDir, protectedPaths, path: win32 });

  it('reports no adjustments when every name is already safe', () => {
    const result = run(['a.mp4', 'b.mp4']);
    expect(result.fileNames).toEqual(['a.mp4', 'b.mp4']);
    expect(result.adjustments).toEqual([]);
  });

  it('rewrites the source-colliding name and reports the change', () => {
    const result = run(['source.mp4']);
    expect(result.fileNames).toEqual(['source (clip).mp4']);
    expect(result.adjustments).toEqual([{ from: 'source.mp4', to: 'source (clip).mp4' }]);
  });

  it('never produces two identical names', () => {
    const result = run(['source.mp4', 'source.mp4', 'source.mp4']);
    expect(result.fileNames).toEqual(['source (clip).mp4', 'source (clip 2).mp4', 'source (clip 3).mp4']);
    expect(new Set(result.fileNames).size).toBe(3);
  });

  it('deduplicates case-insensitively on windows', () => {
    const result = run(['dupe.mp4', 'DUPE.MP4']);
    expect(result.fileNames).toEqual(['dupe.mp4', 'DUPE (clip).MP4']);
  });

  it('allows names differing only by case on posix', () => {
    const result = makeSourceSafeFileNames({
      fileNames: ['dupe.mp4', 'DUPE.mp4'],
      outputDir: '/videos',
      protectedPaths: ['/videos/source.mp4'],
      path: posix,
    });
    expect(result.fileNames).toEqual(['dupe.mp4', 'DUPE.mp4']);
  });

  it('is the invariant behind the size-limited default template', () => {
    // '${FILENAME}${SEG_SUFFIX}${EXT}' with one unnamed segment resolves to the source
    // file name itself, which is exactly the shape that used to overwrite the original.
    const result = run(['source.mp4']);
    const outPath = win32.join(outputDir, result.fileNames[0]!);
    expect(isProtectedSourcePath({ candidate: outPath, protectedPaths, path: win32 })).toBe(false);
  });
});
