import color from 'color';
import invariant from 'tiny-invariant';

import type { SegmentColorIndex } from '../types';

// Distinct hues in a fixed order, so neighbouring clips never look alike. Teal is left out: it is
// the app's accent (selection, playhead), and a teal clip would read as selected.
const colorStrings = '#5b8def, #f08a4b, #a274f0, #46c47e, #ec6aa6, #e3b341, #e5574f, #93c94a, #7c83f5, #d97bd6, #4fb4e8, #c99a6b'.split(',').map((str) => str.trim());
const colors = colorStrings.map((str) => color(str));

function getColor(n: number) {
  const ret = colors[n % colors.length];
  invariant(ret != null);
  return ret;
}

// eslint-disable-next-line import/prefer-default-export
export function getSegColor(seg: SegmentColorIndex | undefined) {
  if (!seg) {
    return color({
      h: 0,
      s: 0,
      v: 100,
    });
  }
  const { segColorIndex } = seg;

  return getColor(segColorIndex);
}
