import { describe, expect, it } from 'vitest';

import { createDefaultTextOverlayClip, sanitizeOverlayClip, minTextOverlayDuration, getVideoStreamRotation, getRotatedVideoDimensions, fitTextOverlayBox, getOverlayFontSize, layoutTextOverlay, getTextLaneRows, getTextOverlayOffsetAt } from './textOverlays';

describe('video rotation', () => {
  it('reads modern display matrices in the same direction as the preview and crop bounds', () => {
    const rotation = getVideoStreamRotation({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] });
    expect(rotation).toBe(90);
    expect(getRotatedVideoDimensions({ width: 320, height: 180, rotation })).toEqual({ width: 180, height: 320 });
    expect(getVideoStreamRotation({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: 90 }] })).toBe(270);
    expect(getVideoStreamRotation({ tags: { rotate: '90' }, side_data_list: [{ side_data_type: 'Display Matrix', rotation: 0 }] })).toBe(0);
  });

  it('accepts legacy rotation tags and leaves unrotated sources alone', () => {
    expect(getVideoStreamRotation({ tags: { rotate: '90' } })).toBe(90);
    expect(getVideoStreamRotation({ tags: { rotate: 'invalid' } })).toBeUndefined();
    expect(getVideoStreamRotation({})).toBeUndefined();
  });
});

describe('textOverlays bounds', () => {
  it('creates overlay that does not exceed file duration for short media', () => {
    const clip = createDefaultTextOverlayClip({ currentTime: 0, fileDuration: 0.05, overlayId: 'a' });
    expect(clip.end).toBeLessThanOrEqual(0.05);
    expect(clip.end).toBe(0.05);
    // start should be clamped to 0
    expect(clip.start).toBe(0);
  });

  it('sanitize clamps end to fileDuration', () => {
    const clip = {
      overlayId: 'b',
      type: 'text' as const,
      start: 8,
      end: 100,
      text: 'hi',
      box: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
    };
    const sanitized = sanitizeOverlayClip(clip, 10);
    expect(sanitized.end).toBeLessThanOrEqual(10);
    expect(sanitized.start).toBeLessThan(sanitized.end);
  });

  it('sanitize clamps start outside duration', () => {
    const clip = {
      overlayId: 'c',
      type: 'text' as const,
      start: 20,
      end: 22,
      text: 'hi',
      box: { x: 0, y: 0, width: 0.6, height: 0.18 },
    };
    const sanitized = sanitizeOverlayClip(clip, 10);
    expect(sanitized.start).toBeLessThanOrEqual(10 - minTextOverlayDuration);
    expect(sanitized.end).toBeLessThanOrEqual(10);
  });
});

describe('adding a text', () => {
  const add = (currentTime: number, existingClips: { start: number, end: number }[], fileDuration = 60) => {
    const { start, end } = createDefaultTextOverlayClip({ currentTime, fileDuration, overlayId: 'new', existingClips });
    return { start, end };
  };

  it('starts at the playhead for 3 s when nothing is there', () => {
    expect(add(5, [])).toEqual({ start: 5, end: 8 });
    // A text that ends at the playhead isn't in the way.
    expect(add(12, [{ start: 4, end: 12 }])).toEqual({ start: 12, end: 15 });
  });

  it('starts after the texts under the playhead instead of on top of them', () => {
    expect(add(5, [{ start: 4, end: 12 }])).toEqual({ start: 12, end: 15 });
    expect(add(5, [{ start: 12, end: 20 }, { start: 4, end: 12 }])).toEqual({ start: 20, end: 23 });
    // A gap too short for a text counts as taken.
    expect(add(4.95, [{ start: 5, end: 9 }])).toEqual({ start: 9, end: 12 });
  });

  it('stops where the next text starts', () => {
    expect(add(5, [{ start: 6, end: 10 }])).toEqual({ start: 5, end: 6 });
    expect(add(5, [{ start: 4, end: 12 }, { start: 13, end: 20 }])).toEqual({ start: 12, end: 13 });
  });

  it('stays at the playhead when there is no room after the texts there', () => {
    expect(add(5, [{ start: 4, end: 12 }], 12)).toEqual({ start: 5, end: 8 });
  });
});

// Every character is half the font size wide, so wrapping is predictable without a DOM.
function fakeMeasureContext() {
  const ctx = { font: '10px', measureText: (text: string) => ({ width: text.length * Number.parseFloat(ctx.font) * 0.5 }) };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('text overlay layout', () => {
  it('grows the box for each line instead of clipping or shrinking the text', () => {
    const ctx = fakeMeasureContext();
    const one = layoutTextOverlay({ text: 'first', widthPx: 400, fontSizePx: 20, ctx });
    const three = layoutTextOverlay({ text: 'first\nsecond\nthird', widthPx: 400, fontSizePx: 20, ctx });
    expect(three.lines).toEqual(['first', 'second', 'third']);
    expect(three.heightPx - one.heightPx).toBeCloseTo(2 * one.lineHeightPx);
  });

  it('wraps to the box width and splits words that cannot fit', () => {
    const ctx = fakeMeasureContext();
    // 100px wide minus 2 * 7px padding fits 8 characters at 20px.
    expect(layoutTextOverlay({ text: 'aaaa bbbb cccc', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['aaaa', 'bbbb', 'cccc']);
    expect(layoutTextOverlay({ text: 'abcdefghijkl', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['abcdefgh', 'ijkl']);
  });

  it('keeps spaces as typed, like the text box, except where a line wraps', () => {
    const ctx = fakeMeasureContext();
    expect(layoutTextOverlay({ text: '  a  b', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['  a  b']);
    // The spaces before a wrapped word stay at the end of the line, out of sight.
    expect(layoutTextOverlay({ text: 'aaaa   bbbb', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['aaaa', 'bbbb']);
    // Spaces at the end of a line don't wrap it.
    expect(layoutTextOverlay({ text: 'aaaaaaaa   ', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['aaaaaaaa']);
    expect(layoutTextOverlay({ text: 'a\n\nb', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['a', '', 'b']);
  });

  it('finds the place in the text under a point of the box, on any line, empty ones too', () => {
    const ctx = fakeMeasureContext();
    // 20px: 10px a character, 7px / 4px padding, lines 23px apart. Lines: 'aaaa', 'bbbb', '', 'A', 'BB'.
    const text = 'aaaa bbbb\n\nA\nBB';
    const at = (line: number, chars: number) => getTextOverlayOffsetAt({ text, widthPx: 100, fontSizePx: 20, x: 7 + chars * 10, y: 4 + line * 23 + 5, ctx });
    expect(at(0, 2.4)).toBe(2);
    expect(at(1, 4)).toBe(9);
    expect(at(2, 3)).toBe(10);
    expect(at(3, 9)).toBe(12);
    expect(at(4, 1)).toBe(14);
    // Below the last line: on the last line.
    expect(at(9, 0)).toBe(13);
  });

  it('breaks a line after a hyphen between letters, as the text box does, and never puts the caret inside an emoji', () => {
    const ctx = fakeMeasureContext();
    expect(layoutTextOverlay({ text: 'aaaa-bbbb', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['aaaa-', 'bbbb']);
    expect(layoutTextOverlay({ text: 'aa-1', widthPx: 100, fontSizePx: 20, ctx }).lines).toEqual(['aa-1']);
    expect(getTextOverlayOffsetAt({ text: 'aaaa-bbbb', widthPx: 100, fontSizePx: 20, x: 7 + 2 * 10, y: 4 + 23 + 5, ctx })).toBe(7);
    // The fake ctx counts code units: a click halfway into the emoji lands before or after it, not between its halves.
    const emoji = getTextOverlayOffsetAt({ text: 'a\u{1F525}b', widthPx: 100, fontSizePx: 20, x: 7 + 1.6 * 10, y: 9, ctx });
    expect([1, 3]).toContain(emoji);
  });

  it('never splits a letter from its accent when a word is too wide for the box', () => {
    const ctx = fakeMeasureContext();
    // 20px: 8 code units fit. Seven a's and the e fit, its accent doesn't: the accented e moves down whole.
    const { lines } = layoutTextOverlay({ text: 'aaaaaaae\u0301bb', widthPx: 100, fontSizePx: 20, ctx });
    expect(lines).toEqual(['aaaaaaa', 'e\u0301bb']);
  });

  it('keeps legacy clips at the size their box height implied and pins it when fitted', () => {
    const legacy = { overlayId: 'a', type: 'text' as const, start: 0, end: 1, text: 'one\ntwo', box: { x: 0, y: 0, width: 0.5, height: 0.2 } };
    expect(getOverlayFontSize(legacy)).toBeCloseTo(0.056);
    const fitted = fitTextOverlayBox(legacy, 1000, 1000, fakeMeasureContext());
    expect(fitted.fontSize).toBeCloseTo(0.056);
    expect(fitted.box.height).toBeCloseTo(((2 * 1.15) + 0.4) * 0.056);
  });
});

describe('text lane rows', () => {
  const text = (overlayId: string, start: number, end: number) => ({ overlayId, start, end });
  const rowsOf = (rows: ReturnType<typeof getTextLaneRows>) => Object.fromEntries([...rows].map(([id, { row, rows: count }]) => [id, `${row}/${count}`]));

  it('gives texts that overlap nothing the whole lane', () => {
    expect(rowsOf(getTextLaneRows([text('a', 0, 2), text('b', 2, 4), text('c', 5, 6)]))).toEqual({ a: '0/1', b: '0/1', c: '0/1' });
    expect(rowsOf(getTextLaneRows([]))).toEqual({});
  });

  it('puts texts at the same time in rows, each in the lowest free one', () => {
    // b and c both overlap a but not each other, so they share the second row; d is on its own.
    expect(rowsOf(getTextLaneRows([text('a', 0, 10), text('b', 1, 3), text('c', 4, 6), text('d', 12, 14)])))
      .toEqual({ a: '0/2', b: '1/2', c: '1/2', d: '0/1' });
  });

  it('never makes more than two rows: a third text goes where it shares the least time', () => {
    // c shares 6 s with a (top row) and 1 s with b (bottom row).
    expect(rowsOf(getTextLaneRows([text('a', 0, 10), text('b', 1, 3), text('c', 2, 8)]))).toEqual({ a: '0/2', b: '1/2', c: '1/2' });
    // The same time in both rows: the top one.
    expect(rowsOf(getTextLaneRows([text('a', 0, 3), text('b', 0, 3), text('c', 1, 2)]))).toEqual({ a: '0/2', b: '1/2', c: '0/2' });
  });

  it('splits a chain of overlaps the same way all along it', () => {
    // a-b and b-c overlap, a and c don't: one group, so all three get its row count.
    expect(rowsOf(getTextLaneRows([text('a', 0, 4), text('b', 3, 7), text('c', 6, 9)]))).toEqual({ a: '0/2', b: '1/2', c: '0/2' });
  });

  it('keeps the other texts in their rows while one is dragged', () => {
    const before = getTextLaneRows([text('a', 0, 4), text('b', 2, 6), text('c', 3, 8)]);
    expect(rowsOf(before)).toEqual({ a: '0/2', b: '1/2', c: '0/2' });
    // a is dragged away: b and c stay where they were (no jump under the cursor), a takes the free top row.
    const drag = { overlayId: 'a', rows: before };
    expect(rowsOf(getTextLaneRows([text('a', 20, 24), text('b', 2, 6), text('c', 3, 8)], drag))).toEqual({ a: '0/1', b: '1/2', c: '0/2' });
    // Dragged onto b and c, it goes in b's row, where it shares less time.
    expect(rowsOf(getTextLaneRows([text('a', 5, 7), text('b', 2, 6), text('c', 3, 8)], drag))).toEqual({ a: '1/2', b: '1/2', c: '0/2' });
    // Without the drag, rows are worked out afresh.
    expect(rowsOf(getTextLaneRows([text('a', 20, 24), text('b', 2, 6), text('c', 3, 8)]))).toEqual({ a: '0/1', b: '0/2', c: '1/2' });
  });
});
