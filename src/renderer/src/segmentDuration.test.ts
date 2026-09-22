import { expect, it } from 'vitest';
import { getSegmentsTotalDuration } from './segments';

it('shows the full source duration for the initial untrimmed clip', () => {
  expect(getSegmentsTotalDuration([{ start: 0, end: 0, initial: true }], 52.2)).toBe(52.2);
});

it('sums real selections and keeps markers at zero duration', () => {
  expect(getSegmentsTotalDuration([{ start: 4, end: 9 }, { start: 20 }, { start: 30, end: 32 }], 52.2)).toBe(7);
  expect(getSegmentsTotalDuration([{ start: 0, initial: true }], undefined)).toBe(0);
});
