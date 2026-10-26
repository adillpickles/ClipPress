import { describe, expect, it } from 'vitest';

import { findFreeFileName, numberFileName, uniqueClipFileNames } from './clipFileNames';

describe('numberFileName', () => {
  it('numbers before the extension, from 2', () => {
    expect(numberFileName('Adil.mp4', 1)).toBe('Adil.mp4');
    expect(numberFileName('Adil.mp4', 2)).toBe('Adil (2).mp4');
    expect(numberFileName('Ace.clutch.mp4', 3)).toBe('Ace.clutch (3).mp4');
  });
});

describe('uniqueClipFileNames', () => {
  it('numbers a clip name used twice, case-insensitively, and leaves other names alone', () => {
    const names = ['Adil.mp4', 'rec-00.01-00.05.mp4', 'adil.mp4', 'Adil.mp4'];
    expect(uniqueClipFileNames(names, (i) => i !== 1)).toEqual(['Adil.mp4', 'rec-00.01-00.05.mp4', 'adil (2).mp4', 'Adil (3).mp4']);
  });
});

describe('findFreeFileName', () => {
  it('takes the first name not in the folder', async () => {
    const inFolder = new Set(['Adil.mp4', 'Adil (2).mp4']);
    expect(await findFreeFileName('Adil.mp4', async (name) => inFolder.has(name))).toBe('Adil (3).mp4');
    expect(await findFreeFileName('Kill.mp4', async (name) => inFolder.has(name))).toBe('Kill.mp4');
  });
});
