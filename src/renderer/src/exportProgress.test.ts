import { describe, expect, test } from 'vitest';

import createForwardJobProgress from './exportProgress';

describe('createForwardJobProgress', () => {
  test('one encode fills 90%, then the job is done', () => {
    const show = createForwardJobProgress();
    expect(show(0, 1)).toBe(0);
    expect(show(0.5, 1)).toBeCloseTo(0.45);
    expect(show(1, 1)).toBeCloseTo(0.9);
  });

  test('a second encode carries on from where the first stopped, never back', () => {
    const show = createForwardJobProgress();
    show(1, 1);
    expect(show(0, 2)).toBeCloseTo(0.9);
    expect(show(0.5, 2)).toBeCloseTo(0.945);
    expect(show(1, 2)).toBeCloseTo(0.99);
    // A third one still only moves forward.
    expect(show(0, 3)).toBeCloseTo(0.99);
    expect(show(1, 3)).toBeLessThan(1);
  });

  test('a two-pass encode (one attempt, two passes on one bar) and late or repeated ticks never move it back', () => {
    const show = createForwardJobProgress();
    expect(show(0.25, 1)).toBeCloseTo(0.225);
    expect(show(0.2, 1)).toBeCloseTo(0.225);
    expect(show(0.75, 1)).toBeCloseTo(0.675);
  });

  test('progress without an attempt (a lossless copy) is a step like an encode', () => {
    const show = createForwardJobProgress();
    expect(show(0.5, undefined)).toBeCloseTo(0.45);
    expect(show(1, undefined)).toBeCloseTo(0.9);
  });

  test('a copy that turns out too big after reaching its end still leaves room for the encode after it', () => {
    const show = createForwardJobProgress();
    show(1, undefined);
    expect(show(0, 1)).toBeCloseTo(0.9);
    expect(show(0.5, 1)).toBeCloseTo(0.945);
    expect(show(1, 1)).toBeCloseTo(0.99);
  });

  test('out-of-range values are clamped', () => {
    const show = createForwardJobProgress();
    expect(show(-1, 1)).toBe(0);
    expect(show(2, 1)).toBeCloseTo(0.9);
  });
});
