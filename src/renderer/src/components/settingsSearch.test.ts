import { describe, expect, test } from 'vitest';

import { findSearchMatches, matchesSearch } from './settingsSearch';

describe('matchesSearch', () => {
  test('every word typed is somewhere in the text, in any case and order', () => {
    expect(matchesSearch('p', 'Review before exporting')).toBe(true);
    expect(matchesSearch('P', 'Clips are')).toBe(true);
    expect(matchesSearch('clip start', 'Start playing when a clip opens')).toBe(true);
    expect(matchesSearch('zz', 'Clips are')).toBe(false);
  });

  test('an empty search finds everything', () => {
    expect(matchesSearch('  ', 'Anything')).toBe(true);
  });
});

describe('findSearchMatches', () => {
  test("each word's first place in the text, merged and in order", () => {
    expect(findSearchMatches('Clips are', 'p')).toEqual([[3, 4]]);
    expect(findSearchMatches('Use the GPU', 'p')).toEqual([[9, 10]]);
    expect(findSearchMatches('Start playing', 'pla play')).toEqual([[6, 10]]);
    expect(findSearchMatches('Zoom / crop the clip', 'c')).toEqual([[7, 8]]);
    expect(findSearchMatches('Review', 'x')).toEqual([]);
  });
});
