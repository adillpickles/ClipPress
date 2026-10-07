import { describe, expect, it } from 'vitest';

import { createDefaultTextOverlayClip, sanitizeOverlayClip, minTextOverlayDuration, getVideoStreamRotation, getRotatedVideoDimensions, fitTextOverlayBox, getOverlayFontSize, layoutTextOverlay } from './textOverlays';

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

  it('keeps legacy clips at the size their box height implied and pins it when fitted', () => {
    const legacy = { overlayId: 'a', type: 'text' as const, start: 0, end: 1, text: 'one\ntwo', box: { x: 0, y: 0, width: 0.5, height: 0.2 } };
    expect(getOverlayFontSize(legacy)).toBeCloseTo(0.056);
    const fitted = fitTextOverlayBox(legacy, 1000, 1000, fakeMeasureContext());
    expect(fitted.fontSize).toBeCloseTo(0.056);
    expect(fitted.box.height).toBeCloseTo(((2 * 1.15) + 0.4) * 0.056);
  });
});
