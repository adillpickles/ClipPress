import { constants, copyFile, link, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
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

it('replaces a file from another drive in one step, and leaves nothing behind when that fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clippress-publish-'));
  try {
    const from = join(dir, 'encoded.mp4');
    const to = join(dir, 'existing.mp4');
    await writeFile(from, 'encoded');
    await writeFile(to, 'original');
    const crossDevice = Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    const copyExclusive = (source: string, target: string) => copyFile(source, target, constants.COPYFILE_EXCL);
    // The staged copy can't replace the file: the old one stays, and the staged copy is removed.
    const failing = { rename: vi.fn().mockRejectedValueOnce(crossDevice).mockRejectedValueOnce(new Error('locked')), link, unlink, copyExclusive };
    await expect(publishFile(from, to, true, failing)).rejects.toThrow('locked');
    await expect(readFile(to, 'utf8')).resolves.toBe('original');
    await expect(readFile(from, 'utf8')).resolves.toBe('encoded');
    expect((await readdir(dir)).sort()).toEqual(['encoded.mp4', 'existing.mp4']);
    // Then it works: the destination has the new file and the temporary one is gone.
    const working = { rename: vi.fn().mockRejectedValueOnce(crossDevice).mockImplementation(rename), link, unlink, copyExclusive };
    await publishFile(from, to, true, working);
    await expect(readFile(to, 'utf8')).resolves.toBe('encoded');
    await expect(readFile(from)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it.each([true, false])('copies a file from another drive under a temporary name, then names it in one step (overwrite: %s)', async (overwrite) => {
  const dir = await mkdtemp(join(tmpdir(), 'clippress-publish-'));
  try {
    const from = join(dir, 'encoded.mp4');
    const to = join(dir, 'new.mp4');
    await writeFile(from, 'encoded');
    const crossDevice = Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    const copied: string[] = [];
    const fs = {
      // The first move is from the other drive; the staged copy is beside the destination.
      rename: vi.fn().mockRejectedValueOnce(crossDevice).mockImplementation(rename),
      link: vi.fn().mockRejectedValueOnce(crossDevice).mockImplementation(link),
      unlink,
      copyExclusive: async (source: string, target: string) => {
        copied.push(target);
        await copyFile(source, target, constants.COPYFILE_EXCL);
      },
    };
    await publishFile(from, to, overwrite, fs);
    await expect(readFile(to, 'utf8')).resolves.toBe('encoded');
    // Never copied to the real name itself, where a stopped copy would leave half a file.
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatch(/new\.mp4\.clippress-\d+-\d+\.tmp$/);
    expect(await readdir(dir)).toEqual(['new.mp4']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('never replaces a file from another drive when overwrite is off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clippress-publish-'));
  try {
    const from = join(dir, 'encoded.mp4');
    const to = join(dir, 'existing.mp4');
    await writeFile(from, 'encoded');
    await writeFile(to, 'original');
    const crossDevice = Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    const fs = { rename, link: vi.fn().mockRejectedValueOnce(crossDevice).mockImplementation(link), unlink, copyExclusive: (source: string, target: string) => copyFile(source, target, constants.COPYFILE_EXCL) };
    await expect(publishFile(from, to, false, fs)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readFile(to, 'utf8')).resolves.toBe('original');
    expect((await readdir(dir)).sort()).toEqual(['encoded.mp4', 'existing.mp4']);
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
