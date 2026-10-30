import { describe, expect, it } from 'vitest';

import getMergePartNames from './mergePartNames';

const inFolder = (...names: string[]) => {
  const lower = new Set(names.map((name) => name.toLowerCase()));
  return async (name: string) => lower.has(name.toLowerCase());
};

describe('getMergePartNames', () => {
  it('keeps names no file has', async () => {
    expect(await getMergePartNames(['a-1-2.mp4', 'a-3-4.mp4'], inFolder('other.mp4'))).toEqual(['a-1-2.mp4', 'a-3-4.mp4']);
  });

  it('steps around a file that is already there, whatever its case', async () => {
    expect(await getMergePartNames(['a-1-2.mp4'], inFolder('A-1-2.MP4'))).toEqual(['a-1-2-part2.mp4']);
    expect(await getMergePartNames(['a-1-2.mp4'], inFolder('a-1-2.mp4', 'a-1-2-part2.mp4'))).toEqual(['a-1-2-part3.mp4']);
  });

  it('keeps two clips of the same name apart', async () => {
    expect(await getMergePartNames(['a.mp4', 'a.mp4'], inFolder())).toEqual(['a.mp4', 'a-part2.mp4']);
  });

  it('stays within 255 characters', async () => {
    const long = `${'x'.repeat(251)}.mp4`;
    const [name] = await getMergePartNames([long], inFolder(long));
    expect(name).toHaveLength(255);
    expect(name!.endsWith('-part2.mp4')).toBe(true);
  });

  it('stops when the folder cannot be checked', async () => {
    await expect(getMergePartNames(['a.mp4'], async () => { throw new Error('EACCES'); })).rejects.toThrow('EACCES');
  });
});
