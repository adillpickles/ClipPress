import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWriteFileAtomically } from './atomicWrite';

const realFs = { writeFile, rename, unlink, dirname, basename, join };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'clippress-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createWriteFileAtomically', () => {
  it('writes a new file and leaves no temp file behind', async () => {
    const writeFileAtomically = createWriteFileAtomically(realFs);
    const target = join(dir, 'project.llc');

    await writeFileAtomically(target, '{ "version": 3 }');

    expect(await readFile(target, 'utf8')).toBe('{ "version": 3 }');
    expect(await readdir(dir)).toEqual(['project.llc']);
  });

  it('replaces an existing file', async () => {
    const writeFileAtomically = createWriteFileAtomically(realFs);
    const target = join(dir, 'project.llc');
    await writeFile(target, 'old contents that are much longer than the new ones');

    await writeFileAtomically(target, 'new');

    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['project.llc']);
  });

  it('never leaves a partially written target: the temp file is renamed, not the target truncated', async () => {
    const target = join(dir, 'project.llc');
    await writeFile(target, 'previous good project');

    let renamedFrom: string | undefined;
    const writeFileAtomically = createWriteFileAtomically({
      ...realFs,
      rename: async (from, to) => {
        // At this point the target must still hold the previous contents, i.e. the
        // write went to a temp file rather than opening the target for truncation.
        expect(await readFile(to, 'utf8')).toBe('previous good project');
        renamedFrom = from;
        await rename(from, to);
      },
    });

    await writeFileAtomically(target, 'next project');

    expect(renamedFrom).toBeDefined();
    expect(dirname(renamedFrom!)).toBe(dir); // same directory, so rename is atomic
    expect(await readFile(target, 'utf8')).toBe('next project');
  });

  it('cleans up the temp file and keeps the original when the rename fails', async () => {
    const target = join(dir, 'project.llc');
    await writeFile(target, 'previous good project');

    const writeFileAtomically = createWriteFileAtomically({
      ...realFs,
      rename: async () => { throw new Error('EPERM'); },
    });

    await expect(writeFileAtomically(target, 'next project')).rejects.toThrow('EPERM');
    expect(await readFile(target, 'utf8')).toBe('previous good project');
    expect(await readdir(dir)).toEqual(['project.llc']);
  });

  it('propagates the original write error rather than a cleanup error', async () => {
    // Writing into a path whose parent does not exist fails, and the cleanup unlink
    // of the never-created temp file must not mask that.
    const writeFileAtomically = createWriteFileAtomically(realFs);
    const target = join(dir, 'missing-subdir', 'project.llc');

    await expect(writeFileAtomically(target, 'x')).rejects.toThrow(/ENOENT/);
  });

  it('uses a unique temp file per call so concurrent saves do not collide', async () => {
    const tempPaths: string[] = [];
    const writeFileAtomically = createWriteFileAtomically({
      ...realFs,
      writeFile: async (path, data) => { tempPaths.push(path); await writeFile(path, data); },
    });
    await mkdir(join(dir, 'sub'));

    await Promise.all([
      writeFileAtomically(join(dir, 'sub', 'a.llc'), 'a'),
      writeFileAtomically(join(dir, 'sub', 'b.llc'), 'b'),
      writeFileAtomically(join(dir, 'sub', 'a.llc'), 'a2'),
    ]);

    expect(new Set(tempPaths).size).toBe(3);
    expect((await readdir(join(dir, 'sub'))).sort()).toEqual(['a.llc', 'b.llc']);
  });
});
