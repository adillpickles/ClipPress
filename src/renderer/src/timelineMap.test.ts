import { describe, expect, it } from 'vitest';

import { createTimelineMap, getWarpedImageSpans } from './timelineMap';

describe('createTimelineMap', () => {
  it('is the identity without speed changes', () => {
    const map = createTimelineMap([{ start: 10, end: 20 }], 60);
    expect(map.displayDuration).toBe(60);
    expect(map.toDisplay(15)).toBe(15);
    expect(map.toSource(42)).toBe(42);
  });

  it('stretches slowed segments and ripples everything after them', () => {
    const map = createTimelineMap([{ start: 10, end: 20, speed: 0.5 }, { start: 30, end: 40 }], 60);
    expect(map.displayDuration).toBe(70);
    expect(map.toDisplay(10)).toBe(10);
    expect(map.toDisplay(20)).toBe(30);
    expect(map.toDisplay(30)).toBe(40);
    expect(map.toSource(25)).toBe(17.5);
    expect(map.toSource(40)).toBe(30);
  });

  it('compresses sped-up segments', () => {
    const map = createTimelineMap([{ start: 0, end: 60, speed: 2 }], 60);
    expect(map.displayDuration).toBe(30);
    expect(map.toDisplay(60)).toBe(30);
    expect(map.toSource(15)).toBe(30);
  });

  it('lets the first overlapping segment set the rate and ignores markers', () => {
    const map = createTimelineMap([{ start: 0, end: 10, speed: 2 }, { start: 5, end: 15, speed: 0.5 }, { start: 20, speed: 4 }], 30);
    expect(map.toDisplay(10)).toBe(5);
    expect(map.toDisplay(15)).toBe(15);
    expect(map.displayDuration).toBe(30);
  });

  it('round-trips and extrapolates outside the file', () => {
    const map = createTimelineMap([{ start: 5, end: 15, speed: 0.25 }], 20);
    for (const time of [0, 5, 7.5, 15, 19]) expect(map.toSource(map.toDisplay(time))).toBeCloseTo(time);
    expect(map.toDisplay(22)).toBe(map.displayDuration + 2);
    expect(map.toSource(-1)).toBe(-1);
  });
});

describe('getWarpedImageSpans', () => {
  it('splits an image across pieces with matching inner offsets', () => {
    const map = createTimelineMap([{ start: 10, end: 20, speed: 0.5 }], 20);
    const spans = getWarpedImageSpans(map, 0, 20);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ left: 0, width: (10 / 30) * 100, innerLeft: -0, innerWidth: 200 });
    expect(spans[1]!.left).toBeCloseTo((10 / 30) * 100);
    expect(spans[1]!.innerLeft).toBeCloseTo(-100);
    expect(spans[1]!.innerWidth).toBeCloseTo(200);
  });
});
