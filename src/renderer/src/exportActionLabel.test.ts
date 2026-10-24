import { describe, expect, it } from 'vitest';

import getExportActionLabel from './exportActionLabel';
import type { TranslateExportActionLabel } from './exportActionLabel';

// Like i18next with the English plural keys ("_one" says "clip").
const t: TranslateExportActionLabel = (key, options = {}) => {
  const text = options['count'] === 1 ? key.replace('clips', 'clip') : key;
  return text.replaceAll(/{{(\w+)}}/g, (_match, name: string) => String(options[name]));
};

const label = (clipCount: number, { willMerge = false, keepClipFiles = false, areWeCutting = true } = {}) => (
  getExportActionLabel({ clipCount, willMerge, keepClipFiles, areWeCutting, t })
);

describe('getExportActionLabel', () => {
  it('counts the clip files', () => {
    expect(label(1)).toBe('Export 1 clip');
    expect(label(5)).toBe('Export 5 clips');
  });

  it('says merged for one merged file, and both for both', () => {
    expect(label(5, { willMerge: true })).toBe('Export merged clip');
    expect(label(5, { willMerge: true, keepClipFiles: true })).toBe('Export 5 clips + merged');
  });

  it('follows what is made, not the Files choice: one clip is never merged', () => {
    // "One merged file" or "Both" with one clip selected exports that clip (willMerge is false).
    expect(label(1, { willMerge: false, keepClipFiles: true })).toBe('Export 1 clip');
  });

  it('is plain Export without cuts', () => {
    expect(label(0, { areWeCutting: false })).toBe('Export');
    expect(label(1, { areWeCutting: false })).toBe('Export');
  });
});
