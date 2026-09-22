import { mkdtemp, writeFile, link, stat, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import findSourceFileCollision from './sourceFileIdentity.js';

it('protects first, middle and last sources through hard links and directory aliases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clippress-identity-'));
  try {
    const sourcesDir = join(dir, 'sources');
    await mkdir(sourcesDir);
    const sources = [0, 1, 2].map((index) => join(sourcesDir, `${index}.mp4`));
    await Promise.all(sources.map((path) => writeFile(path, 'original')));
    const aliasDir = join(dir, 'alias');
    await symlink(sourcesDir, aliasDir, process.platform === 'win32' ? 'junction' : 'dir');
    for (const [index, source] of sources.entries()) {
      const hardLink = join(dir, `hard-${index}.mp4`);
      // eslint-disable-next-line no-await-in-loop
      await link(source, hardLink);
      for (const output of [hardLink, join(aliasDir, `${index}.mp4`)]) {
        // eslint-disable-next-line no-await-in-loop
        await expect(findSourceFileCollision({ outPaths: [output], protectedPaths: sources, stat: (path) => stat(path, { bigint: true }) })).resolves.toBe(output);
      }
    }
    await expect(findSourceFileCollision({ outPaths: [join(dir, 'new.mp4')], protectedPaths: sources, stat: (path) => stat(path, { bigint: true }) })).resolves.toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('does not ignore permission errors while checking a destination', async () => {
  const error = Object.assign(new Error('denied'), { code: 'EACCES' });
  await expect(findSourceFileCollision({ outPaths: ['output'], protectedPaths: [], stat: async () => { throw error; } })).rejects.toBe(error);
});
