import { describe, expect, test } from 'vitest';

import formatClockTime from './clockTime';

describe('formatClockTime', () => {
  test('short times have unpadded minutes', () => {
    expect(formatClockTime(0)).toBe('0:00');
    expect(formatClockTime(7.9)).toBe('0:07');
    expect(formatClockTime(62)).toBe('1:02');
  });

  test('decimals are truncated, not rounded', () => {
    expect(formatClockTime(1.99, { decimals: 1 })).toBe('0:01.9');
    expect(formatClockTime(1.2, { decimals: 1 })).toBe('0:01.2');
    expect(formatClockTime(90.057, { decimals: 2 })).toBe('1:30.05');
  });

  test('hours appear when needed or asked for', () => {
    expect(formatClockTime(3723)).toBe('1:02:03');
    expect(formatClockTime(65, { showHours: true })).toBe('0:01:05');
  });

  test('negative times keep their sign', () => {
    expect(formatClockTime(-5)).toBe('-0:05');
  });
});
