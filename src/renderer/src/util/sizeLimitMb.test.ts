import { describe, expect, it } from 'vitest';

import parseSizeLimitMb from './sizeLimitMb';

describe('parseSizeLimitMb', () => {
  it('reads whole and decimal sizes', () => {
    expect(parseSizeLimitMb('8')).toBe(8);
    expect(parseSizeLimitMb('25')).toBe(25);
    expect(parseSizeLimitMb('9.5')).toBe(9.5);
    expect(parseSizeLimitMb(' 10 ')).toBe(10);
  });

  it('accepts a decimal comma', () => {
    expect(parseSizeLimitMb('9,5')).toBe(9.5);
  });

  it('reads the steps of typing 0.5 as they come', () => {
    expect(parseSizeLimitMb('0')).toBeUndefined();
    expect(parseSizeLimitMb('0.')).toBeUndefined();
    expect(parseSizeLimitMb('0.5')).toBe(0.5);
    expect(parseSizeLimitMb('.5')).toBe(0.5);
    // A trailing point is still the same number, so the box can keep showing it.
    expect(parseSizeLimitMb('8.')).toBe(8);
  });

  it('has no size for an empty box or text that is not a positive number', () => {
    expect(parseSizeLimitMb('')).toBeUndefined();
    expect(parseSizeLimitMb('   ')).toBeUndefined();
    expect(parseSizeLimitMb('abc')).toBeUndefined();
    expect(parseSizeLimitMb('-5')).toBeUndefined();
    expect(parseSizeLimitMb('Infinity')).toBeUndefined();
  });
});
