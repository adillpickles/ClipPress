import { describe, expect, it } from 'vitest';

import { minExportBytes, recycleOriginal, sameIdentity, verifyExportedFiles } from './originalRecycling';

const goodStat = async () => ({ size: 5_000_000, isFile: true });
const goodProbe = async () => ({ duration: 12.5, streamCount: 2 });

describe('verifyExportedFiles', () => {
  it('accepts real, non-empty, playable outputs', async () => {
    expect(await verifyExportedFiles(['a.mp4', 'b.mp4'], { statFile: goodStat, probe: goodProbe })).toEqual({ ok: true });
  });

  it('rejects when nothing was exported', async () => {
    expect((await verifyExportedFiles([], { statFile: goodStat, probe: goodProbe })).ok).toBe(false);
  });

  it('rejects a missing output', async () => {
    const result = await verifyExportedFiles(['a.mp4', 'gone.mp4'], { statFile: async (p) => (p === 'gone.mp4' ? undefined : goodStat()), probe: goodProbe });
    expect(result).toEqual({ ok: false, path: 'gone.mp4', reason: 'missing' });
  });

  it('rejects an output that is too small to be a clip', async () => {
    const result = await verifyExportedFiles(['a.mp4'], { statFile: async () => ({ size: minExportBytes - 1, isFile: true }), probe: goodProbe });
    expect(result).toEqual({ ok: false, path: 'a.mp4', reason: 'empty' });
  });

  it('rejects an output ffprobe cannot read, or that has no media in it', async () => {
    expect(await verifyExportedFiles(['a.mp4'], { statFile: goodStat, probe: async () => { throw new Error('bad'); } })).toEqual({ ok: false, path: 'a.mp4', reason: 'unreadable' });
    expect(await verifyExportedFiles(['a.mp4'], { statFile: goodStat, probe: async () => ({ duration: 0, streamCount: 2 }) })).toEqual({ ok: false, path: 'a.mp4', reason: 'no-media' });
    expect(await verifyExportedFiles(['a.mp4'], { statFile: goodStat, probe: async () => ({ duration: 3, streamCount: 0 }) })).toEqual({ ok: false, path: 'a.mp4', reason: 'no-media' });
    expect(await verifyExportedFiles(['a.mp4'], { statFile: goodStat, probe: async () => ({ duration: undefined, streamCount: 1 }) })).toEqual({ ok: false, path: 'a.mp4', reason: 'no-media' });
  });
});

describe('recycleOriginal', () => {
  const identity = { size: 100, mtimeMs: 1000 };
  const noWait = async () => undefined;

  it('moves the original to the Recycle Bin', async () => {
    let present = true;
    const trashed: string[] = [];
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => identity,
      trash: async (p) => { trashed.push(p); present = false; },
      exists: async () => present,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: true });
    expect(trashed).toEqual(['rec.mp4']);
  });

  it('keeps the original when it changed since the export started', async () => {
    const trashed: string[] = [];
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => ({ size: 101, mtimeMs: 1000 }),
      trash: async (p) => { trashed.push(p); },
      exists: async () => true,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: false, reason: 'changed' });
    expect(trashed).toEqual([]);
  });

  it('keeps the original (and never deletes it) when the Recycle Bin refuses it', async () => {
    let calls = 0;
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => identity,
      trash: async () => { calls += 1; throw new Error('cannot recycle'); },
      exists: async () => true,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: false, reason: 'refused' });
    expect(calls).toBe(3);
  });

  it('retries while the file is briefly in use', async () => {
    let calls = 0;
    let present = true;
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => identity,
      trash: async () => {
        calls += 1;
        if (calls < 2) throw new Error('in use');
        present = false;
      },
      exists: async () => present,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: true });
    expect(calls).toBe(2);
  });

  it('reports a missing original without trying anything', async () => {
    const result = await recycleOriginal('rec.mp4', identity, { identify: async () => undefined, trash: async () => { throw new Error('no'); }, exists: async () => false, wait: noWait });
    expect(result).toEqual({ recycled: false, reason: 'missing' });
  });

  it('checks the original again before each retry and stops when it changed', async () => {
    let calls = 0;
    let identifies = 0;
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => {
        identifies += 1;
        return identifies === 1 ? identity : { size: 200, mtimeMs: 2000 };
      },
      trash: async () => { calls += 1; throw new Error('in use'); },
      exists: async () => true,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: false, reason: 'changed' });
    expect(calls).toBe(1);
  });

  it('keeps the original when cancelled before an attempt', async () => {
    let calls = 0;
    const result = await recycleOriginal('rec.mp4', identity, {
      identify: async () => identity,
      trash: async () => { calls += 1; },
      exists: async () => true,
      isCancelled: () => true,
      wait: noWait,
    });
    expect(result).toEqual({ recycled: false, reason: 'cancelled' });
    expect(calls).toBe(0);
  });

  it('compares identities by size and modification time', () => {
    expect(sameIdentity(identity, { size: 100, mtimeMs: 1000.4 })).toBe(true);
    expect(sameIdentity(identity, { size: 100, mtimeMs: 2000 })).toBe(false);
    expect(sameIdentity(identity, undefined)).toBe(false);
  });
});
