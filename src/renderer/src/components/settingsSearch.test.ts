import { describe, expect, test } from 'vitest';

import { findSearchMatches, matchesSearch } from './settingsSearch';

describe('matchesSearch', () => {
  test('a word typed finds the words it starts, in any case and order', () => {
    expect(matchesSearch('p', 'Start playing when a clip opens')).toBe(true);
    expect(matchesSearch('p', 'Review before exporting')).toBe(false);
    expect(matchesSearch('EXP', 'Review before exporting')).toBe(true);
    expect(matchesSearch('clip start', 'Start playing when a clip opens')).toBe(true);
    expect(matchesSearch('app', 'In-app messages')).toBe(true);
  });

  test('an empty search finds everything', () => {
    expect(matchesSearch('  ', 'Anything')).toBe(true);
  });
});

describe('findSearchMatches', () => {
  test('the start of each word found, merged and in order', () => {
    expect(findSearchMatches('Zoom / crop the clip', 'c')).toEqual([[7, 8], [16, 17]]);
    expect(findSearchMatches('Start playing', 'pla play')).toEqual([[6, 10]]);
    expect(findSearchMatches('Review before exporting', 'p')).toEqual([]);
  });
});
