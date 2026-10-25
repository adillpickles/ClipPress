import { describe, expect, it } from 'vitest';

import ShelfThumbnails, { firstShelfThumbnail } from './shelfThumbnails';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A render whose results the test hands out one by one. */
function setup(options: { maxEntries?: number, concurrency?: number } = {}) {
  const started: { path: string, signal: AbortSignal, resolve: (url: string | undefined) => void }[] = [];
  const revoked: string[] = [];
  let changes = 0;
  const store = new ShelfThumbnails({
    render: (path, signal) => new Promise((resolve) => started.push({ path, signal, resolve })),
    revoke: (url) => revoked.push(url),
    onChange: () => { changes += 1; },
    ...options,
  });
  // null: FFmpeg made nothing.
  const finish = async (path: string, url: string | null = `blob:${path}`) => {
    const job = started.find((entry) => entry.path === path);
    if (job == null) throw new Error(`${path} not started`);
    job.resolve(url ?? undefined);
    await flush();
  };
  return { store, started, revoked, finish, changes: () => changes };
}

const job = (path: string) => ({ key: `${path}|1|1`, path });

describe('shelf thumbnails', () => {
  it('makes the rows that show first, several at a time, and the rest one at a time in the background', async () => {
    const { store, started, finish } = setup({ concurrency: 2 });
    store.prefetch(['a', 'b', 'c', 'd'].map((path) => job(path)));
    expect(started.map((entry) => entry.path)).toEqual(['a']);
    store.request(job('x'));
    store.request(job('y'));
    // x takes the free slot; y waits for one, and background work waits for both.
    expect(started.map((entry) => entry.path)).toEqual(['a', 'x']);
    await finish('a');
    expect(started.map((entry) => entry.path)).toEqual(['a', 'x', 'y']);
    await finish('x');
    await finish('y');
    expect(started.map((entry) => entry.path)).toEqual(['a', 'x', 'y', 'b']);
  });

  it('shows what was asked for as it arrives, and the background ones with the next snapshot', async () => {
    const { store, finish, changes } = setup();
    store.prefetch([job('a')]);
    await finish('a');
    expect(changes()).toBe(0);
    expect(store.snapshot().get(job('a').key)).toBe('blob:a');
    // A row asking for one made in the background gets it at once.
    store.request(job('a'));
    expect(changes()).toBe(1);
    store.request(job('b'));
    await finish('b', null);
    expect(changes()).toBe(2);
    // None could be made: remembered, so the row stops waiting and it isn't tried again.
    expect(store.snapshot().get(job('b').key)).toBeNull();
  });

  it('makes each one once, even when asked for while the background is already making it', async () => {
    const { store, started, finish, changes } = setup();
    store.prefetch([job('a')]);
    store.request(job('a'));
    store.request(job('a'));
    expect(started).toHaveLength(1);
    await finish('a');
    expect(changes()).toBe(1);
    store.prefetch([job('a')]);
    store.request(job('a'));
    expect(started).toHaveLength(1);
  });

  it('stops starting background work when told, and starts again with what is still missing', async () => {
    const { store, started, finish } = setup();
    store.prefetch(['a', 'b', 'c'].map((path) => job(path)));
    store.stopPrefetch();
    await finish('a');
    expect(started.map((entry) => entry.path)).toEqual(['a']);
    store.prefetch(['a', 'b', 'c'].map((path) => job(path)));
    expect(started.map((entry) => entry.path)).toEqual(['a', 'b']);
  });

  it('keeps only so many, freeing the least recently used', async () => {
    const { store, finish, revoked } = setup({ maxEntries: 2 });
    for (const path of ['a', 'b']) {
      store.request(job(path));
      // eslint-disable-next-line no-await-in-loop
      await finish(path);
    }
    store.request(job('a'));
    store.request(job('c'));
    await finish('c');
    expect(revoked).toEqual(['blob:b']);
    expect([...store.snapshot().keys()]).toEqual([job('a').key, job('c').key]);
  });

  it('cancels and frees everything when disposed (the folder changed)', async () => {
    const { store, started, finish, revoked } = setup();
    store.request(job('a'));
    await finish('a');
    store.request(job('b'));
    store.prefetch(['c', 'd'].map((path) => job(path)));
    store.dispose();
    expect(started.find((entry) => entry.path === 'b')?.signal.aborted).toBe(true);
    expect(revoked).toEqual(['blob:a']);
    // One that finishes anyway is freed too, and nothing more starts.
    await finish('b');
    expect(revoked).toEqual(['blob:a', 'blob:b']);
    expect(started.map((entry) => entry.path)).toEqual(['a', 'b', 'c']);
    expect(store.snapshot().size).toBe(0);
  });
});

describe('first shelf thumbnail', () => {
  const picture = (url: string | undefined) => () => Promise.resolve(url);
  const failure = () => Promise.reject(new Error('Could not open encoder before EOF'));

  it('tries the next way when one fails or makes nothing', async () => {
    const { signal } = new AbortController();
    expect(await firstShelfThumbnail([failure, picture('blob:first-frame')], signal)).toBe('blob:first-frame');
    expect(await firstShelfThumbnail([picture(undefined), picture('blob:first-frame')], signal)).toBe('blob:first-frame');
    expect(await firstShelfThumbnail([picture('blob:keyframe'), failure], signal)).toBe('blob:keyframe');
    expect(await firstShelfThumbnail([failure, failure], signal)).toBeUndefined();
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    let tried = 0;
    const cancelled = () => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    };
    await expect(firstShelfThumbnail([cancelled, () => { tried += 1; return Promise.resolve('blob:x'); }], controller.signal)).rejects.toThrow('aborted');
    expect(tried).toBe(0);
  });
});
