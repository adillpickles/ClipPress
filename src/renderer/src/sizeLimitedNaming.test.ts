import { describe, expect, it } from 'vitest';

import {
  buildSizeLimitedAutoFileNames,
  findAvailableSizeLimitedAutoFileName,
  getSizeLimitedMergedSuffixLabel,
  getSizeLimitedSeparateSuffixLabel,
  sizeLimitedFinalSizePlaceholder,
} from './sizeLimitedNaming';

describe('buildSizeLimitedAutoFileNames', () => {
  it('uses the final-size placeholder in previews', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'simple',
      preset: 'quality',
      safeOutputFileName: true,
      items: [{ sizeLabel: sizeLimitedFinalSizePlaceholder }],
    })).toEqual([`${sizeLimitedFinalSizePlaceholder} Quality Overwatch 2.mp4`]);
  });

  it('formats simple-mode names with the selected preset', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'simple',
      preset: 'max_quality',
      safeOutputFileName: true,
      items: [{ sizeLabel: 9.5 * 1024 * 1024 }],
    })).toEqual(['9.5MB Max Quality Overwatch 2.mp4']);
  });

  it('formats advanced-mode names with the advanced label', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'advanced',
      preset: 'quality',
      safeOutputFileName: true,
      items: [{ sizeLabel: 9.3 * 1024 * 1024 }],
    })).toEqual(['9.3MB Advanced Overwatch 2.mp4']);
  });

  it('prefers labels, falls back to seg numbers, and only labels merged outputs when needed', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'simple',
      preset: 'quality',
      safeOutputFileName: true,
      items: [
        { sizeLabel: 9.3 * 1024 * 1024, suffixLabel: getSizeLimitedSeparateSuffixLabel({ segmentName: 'Intro', index: 0, totalSegments: 2, safeOutputFileName: true }) },
        { sizeLabel: 9.3 * 1024 * 1024, suffixLabel: getSizeLimitedSeparateSuffixLabel({ segmentName: '', index: 1, totalSegments: 2, safeOutputFileName: true }) },
        { sizeLabel: 9.3 * 1024 * 1024, suffixLabel: getSizeLimitedMergedSuffixLabel({ hasSeparateOutputs: true }) },
      ],
    })).toEqual([
      '9.3MB Quality Overwatch 2 Intro.mp4',
      '9.3MB Quality Overwatch 2 seg2.mp4',
      '9.3MB Quality Overwatch 2 merged.mp4',
    ]);

    expect(getSizeLimitedMergedSuffixLabel({ hasSeparateOutputs: false })).toBe('');
  });

  it('keeps the recording name\'s " - " and hyphens in clip names', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Valorant 2026.10.19 - 21.51.16',
      controlMode: 'simple',
      preset: 'quality',
      safeOutputFileName: true,
      items: [{
        sizeLabel: 7.9 * 1024 * 1024,
        suffixLabel: getSizeLimitedSeparateSuffixLabel({ segmentName: 'Re-take', index: 0, totalSegments: 2, safeOutputFileName: true }),
      }],
    })).toEqual(['7.9MB Quality Valorant 2026.10.19 - 21.51.16 Re-take.mp4']);
  });

  it('replaces characters Windows does not allow in file names', () => {
    expect(getSizeLimitedSeparateSuffixLabel({ segmentName: 'R1: clutch?', index: 0, totalSegments: 1, safeOutputFileName: true })).toBe('R1_ clutch_');
    expect(getSizeLimitedSeparateSuffixLabel({ segmentName: String.raw`a<b>c"d/e\f|g*h`, index: 0, totalSegments: 1, safeOutputFileName: true })).toBe('a_b_c_d_e_f_g_h');
    // Characters the old range let through by mistake.
    expect(getSizeLimitedSeparateSuffixLabel({ segmentName: 'x;y=z@[1]^', index: 0, totalSegments: 1, safeOutputFileName: true })).toBe('x_y_z__1__');
    // Underscores and dots are kept as they are.
    expect(getSizeLimitedSeparateSuffixLabel({ segmentName: 'v1.2_final', index: 0, totalSegments: 1, safeOutputFileName: true })).toBe('v1.2_final');
  });

  it('leaves names alone when sanitizing is off', () => {
    expect(getSizeLimitedSeparateSuffixLabel({ segmentName: 'R1: clutch?', index: 0, totalSegments: 1, safeOutputFileName: false })).toBe('R1: clutch?');
  });

  it('disambiguates duplicate auto names', () => {
    expect(buildSizeLimitedAutoFileNames({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'simple',
      preset: 'quality',
      safeOutputFileName: true,
      items: [
        { sizeLabel: 9.3 * 1024 * 1024 },
        { sizeLabel: 9.3 * 1024 * 1024 },
      ],
    })).toEqual([
      '9.3MB Quality Overwatch 2.mp4',
      '9.3MB Quality Overwatch 2-2.mp4',
    ]);
  });

  it('finds the next clean name when overwrite-off collisions exist', () => {
    expect(findAvailableSizeLimitedAutoFileName({
      sourceBaseName: 'Overwatch 2',
      controlMode: 'simple',
      preset: 'quality',
      safeOutputFileName: true,
      item: { sizeLabel: 9.3 * 1024 * 1024 },
      isReserved: (fileName) => fileName === '9.3MB Quality Overwatch 2.mp4' || fileName === '9.3MB Quality Overwatch 2-2.mp4',
    })).toBe('9.3MB Quality Overwatch 2-3.mp4');
  });
});
