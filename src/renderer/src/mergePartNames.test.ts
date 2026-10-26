import { describe, expect, it } from 'vitest';

import getMergePartNames from './mergePartNames';

describe('getMergePartNames', () => {
  it('keeps names no file has', () => {
    expect(getMergePartNames(['a-1-2.mp4', 'a-3-4.mp4'], new Set(['other.mp4']))).toEqual(['a-1-2.mp4', 'a-3-4.mp4']);
  });

  it('steps around a file that is already there, whatever its case', () => {
    expect(getMergePartNames(['a-1-2.mp4'], new Set(['A-1-2.MP4']))).toEqual(['a-1-2-part2.mp4']);
    expect(getMergePartNames(['a-1-2.mp4'], new Set(['a-1-2.mp4', 'a-1-2-part2.mp4']))).toEqual(['a-1-2-part3.mp4']);
  });

  it('keeps two clips of the same name apart', () => {
    expect(getMergePartNames(['a.mp4', 'a.mp4'], new Set())).toEqual(['a.mp4', 'a-part2.mp4']);
  });
});
