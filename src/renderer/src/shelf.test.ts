import { describe, expect, it } from 'vitest';

import { buildShelfQueue, isShelfVideo, maxShelfExports, parseShelfOrder, pickNextClip, rememberShelfExport, shelfThumbnailKey, toggleShelfOrder } from './shelf';
import type { ShelfFile } from './shelf';

const file = (name: string, modifiedAt: number): ShelfFile => ({ path: `C:\\Clips\\${name}`, name, modifiedAt, size: 1000 });

const a = file('Valorant 2026.10.19 - 21.51.16.mp4', 3000);
const b = file('Valorant 2026.10.19 - 22.03.10.mp4', 1000);
const c = file('clip 10.mkv', 2000);
const d = file('clip 9.mov', 4000);
const files = [a, b, c, d];

describe('shelf', () => {
  it('only lists videos', () => {
    expect(isShelfVideo('Recording.MP4')).toBe(true);
    expect(isShelfVideo('a.mkv')).toBe(true);
    expect(isShelfVideo('a-proj.llc')).toBe(false);
    expect(isShelfVideo('thumbs.db')).toBe(false);
    expect(isShelfVideo('.hidden.mp4')).toBe(false);
    expect(isShelfVideo('mp4')).toBe(false);
  });

  it('puts the oldest recording first, or sorts by name with numbers in order', () => {
    expect(buildShelfQueue(files, { order: 'date', exports: [], caseInsensitive: true }).map((item) => item.file)).toEqual([b, c, a, d]);
    expect(buildShelfQueue(files, { order: 'name', exports: [], caseInsensitive: true }).map((item) => item.file)).toEqual([d, c, a, b]);
  });

  it('turns either order round: newest first, or Z to A', () => {
    expect(buildShelfQueue(files, { order: 'date-desc', exports: [], caseInsensitive: true }).map((item) => item.file)).toEqual([d, a, c, b]);
    expect(buildShelfQueue(files, { order: 'name-desc', exports: [], caseInsensitive: true }).map((item) => item.file)).toEqual([b, a, c, d]);
  });

  it('turns the order round when it is clicked again, and starts the other one the usual way round', () => {
    expect(toggleShelfOrder('date', 'date')).toBe('date-desc');
    expect(toggleShelfOrder('date-desc', 'date')).toBe('date');
    expect(toggleShelfOrder('name', 'name')).toBe('name-desc');
    expect(toggleShelfOrder('name-desc', 'name')).toBe('name');
    expect(toggleShelfOrder('date-desc', 'name')).toBe('name');
    expect(toggleShelfOrder('name-desc', 'date')).toBe('date');
    expect(parseShelfOrder('name-desc')).toEqual({ by: 'name', reversed: true });
    expect(parseShelfOrder('date')).toEqual({ by: 'date', reversed: false });
  });

  it('keeps exported clips at the bottom and picks the next clip in the order shown, either way round', () => {
    const exports = [{ source: d.path, outputs: [], exportedAt: 1 }];
    const newestFirst = buildShelfQueue(files, { order: 'date-desc', exports, caseInsensitive: true });
    // a, c, b, then d (exported)
    expect(newestFirst.map((item) => [item.file, item.exported])).toEqual([[a, false], [c, false], [b, false], [d, true]]);
    expect(pickNextClip(newestFirst, a.path, true)).toBe(c);
    expect(pickNextClip(newestFirst, b.path, true)).toBe(a);
    expect(pickNextClip(newestFirst, undefined, true)).toBe(a);
    const zToA = buildShelfQueue(files, { order: 'name-desc', exports, caseInsensitive: true });
    expect(zToA.map((item) => item.file)).toEqual([b, a, c, d]);
    expect(pickNextClip(zToA, b.path, true)).toBe(a);
  });

  it('gives a recording saved again under the same name a new thumbnail', () => {
    expect(shelfThumbnailKey(a)).toBe(shelfThumbnailKey({ ...a }));
    expect(shelfThumbnailKey(a)).not.toBe(shelfThumbnailKey({ ...a, modifiedAt: a.modifiedAt + 1 }));
    expect(shelfThumbnailKey(a)).not.toBe(shelfThumbnailKey({ ...a, size: a.size + 1 }));
  });

  it('moves exported clips to the bottom and leaves out the exports themselves', () => {
    const output = file('Valorant 2026.10.19 - 22.03.10-cut.mp4', 9000);
    const exports = [{ source: 'c:/clips/VALORANT 2026.10.19 - 22.03.10.mp4', outputs: [output.path.toLowerCase()], exportedAt: 1 }];
    const queue = buildShelfQueue([...files, output], { order: 'date', exports, caseInsensitive: true });
    expect(queue.map((item) => [item.file.name, item.exported])).toEqual([
      [c.name, false],
      [a.name, false],
      [d.name, false],
      [b.name, true],
    ]);
  });

  it('takes a new recording saved under an exported name for a new clip', () => {
    const exports = [{ source: a.path, sourceSize: a.size, sourceModifiedAt: a.modifiedAt, outputs: [], exportedAt: 1 }];
    expect(buildShelfQueue([a], { order: 'date', exports, caseInsensitive: true })[0]?.exported).toBe(true);
    const replaced = { ...a, modifiedAt: a.modifiedAt + 60_000 };
    expect(buildShelfQueue([replaced], { order: 'date', exports, caseInsensitive: true })[0]?.exported).toBe(false);
    expect(rememberShelfExport([], exports[0]!, true)[0]).toMatchObject({ sourceSize: a.size, sourceModifiedAt: a.modifiedAt });
  });

  it('picks the next clip still to do, wrapping round, never the open one', () => {
    const exports = [{ source: b.path, outputs: [], exportedAt: 1 }];
    const queue = buildShelfQueue(files, { order: 'date', exports, caseInsensitive: true });
    // c, a, d, then b (exported)
    expect(pickNextClip(queue, c.path, true)).toBe(a);
    expect(pickNextClip(queue, d.path, true)).toBe(c);
    // Just exported: back to the top of the queue.
    expect(pickNextClip(queue, b.path, true)).toBe(c);
    expect(pickNextClip(queue, undefined, true)).toBe(c);
    expect(pickNextClip(queue, 'C:/Elsewhere/x.mp4', true)).toBe(c);
    const allDone = buildShelfQueue([b], { order: 'date', exports, caseInsensitive: true });
    expect(pickNextClip(allDone, b.path, true)).toBeUndefined();
  });

  it('passes by a recording that could not be opened, until it changes', () => {
    const queue = buildShelfQueue(files, { order: 'date', exports: [], caseInsensitive: true });
    // b, c, a, d: c is damaged
    const unopenable = new Set([shelfThumbnailKey(c)]);
    expect(pickNextClip(queue, b.path, true, unopenable)).toBe(a);
    expect(pickNextClip(queue, undefined, true, unopenable)).toBe(b);
    // Written again (a new recording under the same name): offered again.
    const rewritten = { ...c, modifiedAt: 9000 };
    const queue2 = buildShelfQueue([b, rewritten, a, d], { order: 'name', exports: [], caseInsensitive: true });
    expect(pickNextClip(queue2, d.path, true, unopenable)).toBe(rewritten);
  });

  it('after a clip closes, offers the one after it and never the closed clip again', () => {
    // The app passes the clip that was open last once the editor closes (App's shelfAnchorPath).
    const queue = buildShelfQueue(files, { order: 'date', exports: [], caseInsensitive: true });
    // b, c, a, d
    expect(pickNextClip(queue, c.path, true)).toBe(a);
    expect(pickNextClip(queue, d.path, true)).toBe(b);
    // A folder with just the one video: nothing is up next, Recent already lists it.
    const single = buildShelfQueue([a], { order: 'date', exports: [], caseInsensitive: true });
    expect(pickNextClip(single, a.path, true)).toBeUndefined();
    expect(pickNextClip(single, a.path.toUpperCase().replaceAll('\\', '/'), true)).toBeUndefined();
  });

  it('remembers each export once, newest first, and keeps the list short', () => {
    let list = rememberShelfExport([], { source: a.path, outputs: ['x.mp4'], exportedAt: 1 }, true);
    list = rememberShelfExport(list, { source: b.path, outputs: ['y.mp4'], exportedAt: 2 }, true);
    list = rememberShelfExport(list, { source: a.path.toUpperCase(), outputs: ['z.mp4', 'X.MP4'], exportedAt: 3 }, true);
    expect(list.map((entry) => [entry.exportedAt, entry.outputs])).toEqual([[3, ['z.mp4', 'X.MP4']], [2, ['y.mp4']]]);
    for (let i = 0; i < maxShelfExports + 10; i += 1) list = rememberShelfExport(list, { source: `${i}.mp4`, outputs: [], exportedAt: i }, true);
    expect(list).toHaveLength(maxShelfExports);
  });
});
