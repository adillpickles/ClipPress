import { describe, expect, it } from 'vitest';

import { TimelineMemoryCache, decodePeaks, decodeStrip, encodePeaks, encodeStrip, getCacheFilesToPrune, getTimelineCacheKey } from './timelineCache';

describe('getTimelineCacheKey', () => {
  it('changes with the file, and ignores case where the file system does', () => {
    const key = getTimelineCacheKey({ path: 'D:/Clips/A.mp4', size: 10, mtimeMs: 1000.4, caseInsensitive: true });
    expect(getTimelineCacheKey({ path: 'd:/clips/a.mp4', size: 10, mtimeMs: 1000, caseInsensitive: true })).toBe(key);
    expect(getTimelineCacheKey({ path: 'D:/Clips/A.mp4', size: 11, mtimeMs: 1000, caseInsensitive: true })).not.toBe(key);
    expect(getTimelineCacheKey({ path: 'D:/Clips/A.mp4', size: 10, mtimeMs: 2000, caseInsensitive: true })).not.toBe(key);
    expect(getTimelineCacheKey({ path: '/clips/A.mp4', size: 10, mtimeMs: 1000, caseInsensitive: false })).not.toBe(getTimelineCacheKey({ path: '/clips/a.mp4', size: 10, mtimeMs: 1000, caseInsensitive: false }));
  });
});

describe('TimelineMemoryCache', () => {
  it('drops the least recently used, but never one in use', () => {
    const evicted: string[] = [];
    const cache = new TimelineMemoryCache<string>({ maxEntries: 2, onEvict: (v) => evicted.push(v) });
    cache.put('a', 'A');
    cache.acquire('a');
    cache.put('b', 'B');
    cache.put('c', 'C');
    // 'a' is in use, so the next oldest goes.
    expect(evicted).toEqual(['B']);
    expect(cache.get('a')).toBe('A');
    cache.get('c');
    cache.release('a');
    // Over the limit no more, now that 'a' could go: it's the least recently used.
    cache.put('d', 'D');
    expect(evicted).toEqual(['B', 'A']);
    expect(cache.has('c') && cache.has('d')).toBe(true);
  });

  it('frees what it replaces', () => {
    const evicted: string[] = [];
    const cache = new TimelineMemoryCache<string>({ maxEntries: 5, onEvict: (v) => evicted.push(v) });
    cache.put('a', 'A1');
    cache.put('a', 'A2');
    expect(evicted).toEqual(['A1']);
    expect(cache.get('a')).toBe('A2');
  });
});

describe('encoding', () => {
  it('reads back a strip, and only for its own key', async () => {
    const frames = [0, 1.5, 3].map((time) => ({ time, url: `blob:${time}`, blob: new Blob([new Uint8Array([time, 0xFF, 0xD8, 7])]) }));
    const bytes = await encodeStrip('k', { frames, aspect: 4 / 3 });
    const decoded = decodeStrip(bytes, 'k');
    expect(decoded?.aspect).toBe(4 / 3);
    expect(decoded?.images.map(({ time, image }) => [time, [...image]])).toEqual([[0, [0, 0xFF, 0xD8, 7]], [1.5, [1, 0xFF, 0xD8, 7]], [3, [3, 0xFF, 0xD8, 7]]]);
    expect(decodeStrip(bytes, 'other')).toBeUndefined();
    expect(decodeStrip(bytes.subarray(0, -1), 'k')).toBeUndefined();
    expect(decodeStrip(new Uint8Array([1, 2, 3]), 'k')).toBeUndefined();
    expect(decodePeaks(bytes, 'k')).toBeUndefined();
  });

  it('reads back a waveform', () => {
    const peaks = new Float32Array([0, 0.25, 1, 0.5]);
    const bytes = encodePeaks('k', { peaks, bucketSeconds: 0.01 });
    expect(decodePeaks(bytes, 'k')).toEqual({ peaks, bucketSeconds: 0.01 });
    expect(decodePeaks(bytes, 'j')).toBeUndefined();
    expect(decodePeaks(bytes.subarray(0, -2), 'k')).toBeUndefined();
  });
});

describe('getCacheFilesToPrune', () => {
  it('drops entries unused for too long, then the least recently used beyond the size limit', () => {
    const now = 1_000_000;
    const files = [
      { name: 'old', size: 1, mtimeMs: now - 500 },
      { name: 'a', size: 40, mtimeMs: now - 10 },
      { name: 'b', size: 40, mtimeMs: now - 20 },
      { name: 'c', size: 40, mtimeMs: now - 30 },
    ];
    expect(getCacheFilesToPrune(files, { maxBytes: 100, maxAgeMs: 100, now }).sort()).toEqual(['c', 'old']);
  });
});
