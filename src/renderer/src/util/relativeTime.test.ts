import { describe, expect, test } from 'vitest';

import formatRelativeTime from './relativeTime';

const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const now = Date.UTC(2026, 9, 23, 12);

describe('relative time', () => {
  test('under a minute is "just now", not "this minute"', () => {
    expect(formatRelativeTime(now, now, format, 'Just now')).toBe('Just now');
    expect(formatRelativeTime(now - 59_000, now, format, 'Just now')).toBe('Just now');
    // A clock that is slightly behind gives a time a little in the future.
    expect(formatRelativeTime(now + 5000, now, format, 'Just now')).toBe('Just now');
  });

  test('from a minute on, counts in the largest whole unit', () => {
    expect(formatRelativeTime(now - 60_000, now, format, 'Just now')).toBe('1 minute ago');
    expect(formatRelativeTime(now - 5 * 60_000, now, format, 'Just now')).toBe('5 minutes ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now, format, 'Just now')).toBe('3 hours ago');
  });

  test('words from Intl start with a capital, like the rest of the labels', () => {
    expect(formatRelativeTime(now - 86_400_000, now, format, 'Just now')).toBe('Yesterday');
    expect(formatRelativeTime(now - 7 * 86_400_000, now, format, 'Just now')).toBe('Last week');
  });
});
