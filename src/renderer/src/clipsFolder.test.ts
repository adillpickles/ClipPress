import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type * as ClipsFolderModule from './clipsFolder';

// The module reads folders through `window.require` (Node's own modules here) and asks the main process for NVIDIA's
// setting (not reached by these tests).
let clipsFolder: typeof ClipsFolderModule;
let dir: string;
beforeAll(async () => {
  vi.stubGlobal('window', { require: createRequire(import.meta.url), electron: {} });
  clipsFolder = await import('./clipsFolder');
  dir = await mkdtemp(join(tmpdir(), 'clippress-clips-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the recorders\' settings', () => {
  test('reads NVIDIA\'s save folder from the registry\'s UTF-16 bytes', () => {
    // Each character as two little-endian bytes, as `reg query` prints REG_BINARY.
    const hex = Array.from('D:\\Clips\0', (c) => `${c.codePointAt(0)!.toString(16).padStart(2, '0').toUpperCase()}00`).join('');
    expect(clipsFolder.parseNvidiaSaveFolder(`\r\nHKEY_CURRENT_USER\\...\\NVSPCAPS\r\n    DefaultPathW    REG_BINARY    ${hex}\r\n`)).toBe(String.raw`D:\Clips`);
    expect(clipsFolder.parseNvidiaSaveFolder('')).toBeUndefined();
    expect(clipsFolder.parseNvidiaSaveFolder('    DefaultPathW    REG_BINARY    0000\r\n')).toBeUndefined();
  });

  test('reads where OBS records, in simple and advanced output', () => {
    const bom = '\uFEFF';
    expect(clipsFolder.getObsRecordingFolder(`${bom}[Output]\r\nMode=Simple\r\n\r\n[SimpleOutput]\r\nFilePath=D:\\\\Videos\\\\OBS\r\n`)).toBe(String.raw`D:\Videos\OBS`);
    expect(clipsFolder.getObsRecordingFolder('[Output]\nMode=Advanced\n[AdvOut]\nRecType=Standard\nRecFilePath=E:\\\\Rec\n')).toBe(String.raw`E:\Rec`);
    expect(clipsFolder.getObsRecordingFolder('[Output]\nMode=Advanced\n[AdvOut]\nRecType=FFmpeg\nRecFilePath=E:\\\\Rec\nFFFilePath=F:\\\\Out\n')).toBe(String.raw`F:\Out`);
    // Never changed: OBS records into Videos.
    expect(clipsFolder.getObsRecordingFolder('[Output]\nMode=Simple\n')).toBeUndefined();
    expect(clipsFolder.parseIni('; a comment\n[Basic]\nProfileDir=Untitled\n')).toEqual({ Basic: { ProfileDir: 'Untitled' } });
  });
});

describe('listNewestClips', () => {
  test('lists the newest videos two folders deep, leaving out ClipPress\'s exports', async () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 31, 12, minutes));
    const files: [string, number][] = [
      ['Valorant/Valorant 2026.10.31 - 12.01.mp4', 1],
      ['Valorant/Valorant 2026.10.31 - 12.05.mp4', 5],
      ['Valorant/19.8MB Quality Valorant 2026.10.31 - 12.05.mp4', 6],
      ['Desktop/Desktop 2026.10.31 - 12.03.mkv', 3],
      ['Desktop/notes.txt', 7],
      ['loose.mov', 2],
      ['a/b/c/too deep.mp4', 8],
    ];
    for (const [name, minutes] of files) {
      const path = join(dir, name);
      // eslint-disable-next-line no-await-in-loop
      await mkdir(join(path, '..'), { recursive: true });
      // eslint-disable-next-line no-await-in-loop
      await writeFile(path, 'x');
      // eslint-disable-next-line no-await-in-loop
      await utimes(path, at(minutes), at(minutes));
    }
    const exported = join(dir, 'Valorant', 'Valorant 2026.10.31 - 12.05-cut.mp4');
    await writeFile(exported, 'x');
    const clips = await clipsFolder.listNewestClips(dir, { limit: 3, exports: [{ source: 'x', outputs: [exported], exportedAt: 1 }], caseInsensitive: true });
    expect(clips.map((clip) => clip.name)).toEqual(['Valorant 2026.10.31 - 12.05.mp4', 'Desktop 2026.10.31 - 12.03.mkv', 'loose.mov']);
    expect(await clipsFolder.listNewestClips(join(dir, 'missing'), { limit: 3, exports: [], caseInsensitive: true })).toEqual([]);
  });

  test('knows ClipPress\'s own export names', () => {
    expect(clipsFolder.isClipPressExportName('19.8MB Quality Valorant.mp4')).toBe(true);
    expect(clipsFolder.isClipPressExportName('1.7MB Original clip.mp4')).toBe(true);
    expect(clipsFolder.isClipPressExportName('Valorant clippress-export.mp4')).toBe(true);
    expect(clipsFolder.isClipPressExportName('Valorant 2026.10.31 - 12.05.mp4')).toBe(false);
  });
});
