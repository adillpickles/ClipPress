import { constants, copyFile, link, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import publishFile from './publishFile';

it.each([false, true])('never replaces an existing file when overwrite is off (copy fallback: %s)', async (fallback) => {
  const dir = await mkdtemp(join(tmpdir(), 'clippress-publish-'));
  try {
    const from = join(dir, 'encoded.mp4');
    const to = join(dir, 'existing.mp4');
    await writeFile(from, 'encoded');
    await writeFile(to, 'original');
    const fs = {
      rename,
      unlink,
      link: fallback ? async () => { throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }); } : link,
      copyExclusive: (source: string, target: string) => copyFile(source, target, constants.COPYFILE_EXCL),
    };
    await expect(publishFile(from, to, false, fs)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readFile(to, 'utf8')).resolves.toBe('original');
    await expect(readFile(from, 'utf8')).resolves.toBe('encoded');
    await unlink(to);
    await publishFile(from, to, false, fs);
    await expect(readFile(to, 'utf8')).resolves.toBe('encoded');
    await expect(readFile(from)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('keeps publication successful when removing an extra temporary link fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await expect(publishFile('temp', 'output', false, {
      rename: vi.fn(), link: vi.fn(), copyExclusive: vi.fn(), unlink: vi.fn().mockRejectedValue(new Error('locked')),
    })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
  }
});
