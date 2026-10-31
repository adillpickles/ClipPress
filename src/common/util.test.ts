import { expect, test } from 'vitest';

import { formatFfmpegNumber, parseRatio } from './util.js';

test('formatFfmpegNumber keeps a frame time to the microsecond', () => {
  // A cut ending on a 30 fps frame (as the player reports it): 5 decimals gave 7.26667, which copied that frame too
  expect(formatFfmpegNumber(7.266667)).toBe('7.266667');
  expect(formatFfmpegNumber(7.266667 - 2)).toBe('5.266667');
  expect(formatFfmpegNumber(0)).toBe('0.000000');
});

test('parseRatio', () => {
  expect(parseRatio('30000/1001')).toBeCloseTo(29.97, 2);
  expect(parseRatio('60/1')).toBe(60);
  expect(parseRatio('30')).toBeUndefined();
  expect(parseRatio('30/0')).toBeUndefined();
  expect(parseRatio('a/b')).toBeUndefined();
  expect(parseRatio('1/2/3')).toBeUndefined();
});
