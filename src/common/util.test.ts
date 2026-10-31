import { expect, test } from 'vitest';

import { formatFfmpegNumber } from './util.js';

test('formatFfmpegNumber keeps a frame time to the microsecond', () => {
  // A cut ending on a 30 fps frame (as the player reports it): 5 decimals gave 7.26667, which copied that frame too
  expect(formatFfmpegNumber(7.266667)).toBe('7.266667');
  expect(formatFfmpegNumber(7.266667 - 2)).toBe('5.266667');
  expect(formatFfmpegNumber(0)).toBe('0.000000');
});
