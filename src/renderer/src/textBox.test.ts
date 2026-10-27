import { describe, expect, it } from 'vitest';

import { moveTextBox, resizeTextBoxWidth, scaleTextBox } from './textBox';
import { maxTextOverlayFontSize, minTextOverlayFontSize, minTextOverlayWidth } from './textOverlays';

// Two lines of text whatever the width: the height is the font size times a constant, like a fitted box.
const twoLines = (fontSize: number) => fontSize * 2.7;
const start = { box: { x: 0.2, y: 0.3, width: 0.4, height: 0.1 }, height: 0.1, fontSize: 0.05 };
const frame = { width: 1600, height: 900 };

describe('moving the text box', () => {
  const noSnap = { x: 0, y: 0 };

  it('follows the pointer and stays inside the frame', () => {
    const moved = moveTextBox(start, { x: 0.1, y: -0.05 }, noSnap).box;
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved.y).toBeCloseTo(0.25);
    expect(moved.width).toBe(start.box.width);
    expect(moveTextBox(start, { x: 2, y: 2 }, noSnap).box).toMatchObject({ x: 0.6, y: 0.9 });
    expect(moveTextBox(start, { x: -2, y: -2 }, noSnap).box).toMatchObject({ x: 0, y: 0 });
  });

  it('snaps its centre onto the frame centre lines when close, and says which guides to show', () => {
    // Centre x would be 0.2 + 0.2 + 0.095 = 0.495: within 0.01 of the middle.
    const snapped = moveTextBox(start, { x: 0.095, y: 0 }, { x: 0.01, y: 0.01 });
    expect(snapped.box.x).toBeCloseTo(0.3);
    expect(snapped.guides).toEqual({ vertical: true, horizontal: false });
    const both = moveTextBox(start, { x: 0.1, y: 0.152 }, { x: 0.01, y: 0.01 });
    expect(both.box.y).toBeCloseTo(0.45);
    expect(both.guides).toEqual({ vertical: true, horizontal: true });
    expect(moveTextBox(start, { x: 0.05, y: 0 }, { x: 0.01, y: 0.01 }).guides.vertical).toBe(false);
  });

  it('uses the height the text really takes, not a stored minimum', () => {
    const low = { ...start, box: { ...start.box, height: 0.2 }, height: 0.04 };
    expect(moveTextBox(low, { x: 0, y: 5 }, noSnap).box.y).toBeCloseTo(0.96);
  });
});

describe('resizing the text box from a corner', () => {
  it('grows the text and the width together, keeping the opposite corner still', () => {
    // Dragging the bottom-right corner along the diagonal by its own length doubles the box.
    const diagonal = { x: start.box.width * frame.width, y: start.height * frame.height };
    const grown = scaleTextBox(start, 'bottom-right', { x: diagonal.x * 0.25, y: diagonal.y * 0.25 }, frame, twoLines);
    expect(grown.fontSize).toBeCloseTo(0.0625);
    expect(grown.box.width).toBeCloseTo(0.5);
    expect(grown.box).toMatchObject({ x: 0.2, y: 0.3 });
  });

  it('keeps the bottom-right corner still when dragging the top-left one', () => {
    const diagonal = { x: start.box.width * frame.width, y: start.height * frame.height };
    const shrunk = scaleTextBox(start, 'top-left', { x: diagonal.x * 0.5, y: diagonal.y * 0.5 }, frame, twoLines);
    expect(shrunk.fontSize).toBeCloseTo(0.025);
    expect(shrunk.box.x + shrunk.box.width).toBeCloseTo(0.6);
    expect(shrunk.box.y + shrunk.box.height).toBeCloseTo(start.box.y + start.height);
  });

  it('stops at the frame edge and at the size limits', () => {
    const huge = scaleTextBox(start, 'bottom-right', { x: 5000, y: 5000 }, frame, twoLines);
    expect(huge.box.x + huge.box.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(huge.fontSize).toBeLessThanOrEqual(maxTextOverlayFontSize);
    const tiny = scaleTextBox(start, 'bottom-right', { x: -5000, y: -5000 }, frame, twoLines);
    expect(tiny.fontSize).toBeGreaterThanOrEqual(minTextOverlayFontSize - 1e-12);
    expect(tiny.box.width).toBeGreaterThanOrEqual(minTextOverlayWidth - 1e-12);
  });

  it('ignores the part of a drag that goes across the diagonal', () => {
    const across = scaleTextBox(start, 'bottom-right', { x: 90, y: -640 }, frame, twoLines);
    expect(across.fontSize).toBeCloseTo(start.fontSize, 2);
  });
});

describe('changing the text box width from a side', () => {
  const wraps = (fontSize: number, width: number) => fontSize * 1.5 * Math.ceil(0.4 / width);

  it('moves only the dragged side and lets the text wrap again', () => {
    const narrower = resizeTextBoxWidth(start, 'right', -0.2, wraps);
    expect(narrower.box).toMatchObject({ x: 0.2, width: 0.2 });
    expect(narrower.box.height).toBeCloseTo(0.15);
    const fromLeft = resizeTextBoxWidth(start, 'left', 0.1, wraps);
    expect(fromLeft.box.x).toBeCloseTo(0.3);
    expect(fromLeft.box.x + fromLeft.box.width).toBeCloseTo(0.6);
    expect(fromLeft.fontSize).toBe(start.fontSize);
  });

  it('stays between the smallest width and the frame edge', () => {
    expect(resizeTextBoxWidth(start, 'right', 5, wraps).box.width).toBeCloseTo(0.8);
    expect(resizeTextBoxWidth(start, 'left', -5, wraps).box).toMatchObject({ x: 0 });
    expect(resizeTextBoxWidth(start, 'right', -5, wraps).box.width).toBe(minTextOverlayWidth);
  });
});
