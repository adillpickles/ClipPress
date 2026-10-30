import { describe, expect, test } from 'vitest';
import color from 'color';

import { getSegBadgeStyle, getSegColorVars } from './colors';
import { getSegColor } from './util/colors';

describe('getSegColorVars', () => {
  test('is the badge colour, so the selected clip, its badge and its timeline block match', () => {
    const segColor = getSegColor({ segColorIndex: 1 });
    const badge = getSegBadgeStyle(segColor);
    expect(getSegColorVars(segColor)).toEqual({ '--clip-color': badge.background, '--clip-on-color': badge.color });
  });

  test('marks drawn on a light clip colour are dark, on a dark one white', () => {
    expect(getSegColorVars(color('#e3b341'))['--clip-on-color']).toBe('rgb(0 0 0 / 80%)');
    expect(getSegColorVars(color('#5b8def'))['--clip-on-color']).toBe('#fff');
  });

  test('keeps the hue but not a very light or very dark tone', () => {
    for (const str of ['#fff8e0', '#101830']) {
      const vars = getSegColorVars(color(str));
      expect(color(vars['--clip-color']).lightness()).toBeCloseTo(46, 0);
    }
  });
});
