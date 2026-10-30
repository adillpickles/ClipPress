import type { OverlayBox } from './types';
import { maxTextOverlayFontSize, minTextOverlayFontSize, minTextOverlayWidth } from './textOverlays';

// The maths of the text box on the picture (TextOverlayEditor): moving it, resizing it from a corner and changing its
// width from a side. Boxes are in fractions of the output frame; the height always comes from the text (fitHeight).

export type TextBoxCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type TextBoxSide = 'left' | 'right';

export interface TextBoxStart {
  box: OverlayBox,
  /** The height the text really takes (the stored one can be a minimum). */
  height: number,
  fontSize: number,
}

/** The box height a font size and width give, as a fraction of the frame. */
export type FitHeight = (fontSize: number, width: number) => number;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Moves the box by a delta, its centre pulled onto the frame's centre lines when it comes within `snap` of them (the
 * guides to show are returned). The box stays inside the frame.
 */
export function moveTextBox(start: TextBoxStart, delta: { x: number, y: number }, snap: { x: number, y: number }) {
  const { box, height } = start;
  let x = box.x + delta.x;
  let y = box.y + delta.y;
  const snapX = Math.abs(x + (box.width / 2) - 0.5) <= snap.x;
  const snapY = Math.abs(y + (height / 2) - 0.5) <= snap.y;
  if (snapX) x = 0.5 - (box.width / 2);
  if (snapY) y = 0.5 - (height / 2);
  x = clamp(x, 0, 1 - box.width);
  y = clamp(y, 0, 1 - height);
  return {
    box: { ...box, x, y },
    guides: { vertical: snapX && Math.abs(x + (box.width / 2) - 0.5) < 1e-9, horizontal: snapY && Math.abs(y + (height / 2) - 0.5) < 1e-9 },
  };
}

/**
 * Resizes from a corner: the text and its width grow together (the lines stay the same) and the opposite corner stays
 * put. The factor is how far the pointer has gone along the box's diagonal, so the corner follows the pointer.
 * `deltaPx` and `framePx` are in screen pixels, since the frame's fractions aren't square.
 */
export function scaleTextBox(start: TextBoxStart, corner: TextBoxCorner, deltaPx: { x: number, y: number }, framePx: { width: number, height: number }, fitHeight: FitHeight) {
  const { box, height, fontSize } = start;
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  const diagonal = { x: (right ? 1 : -1) * box.width * framePx.width, y: (bottom ? 1 : -1) * height * framePx.height };
  const length2 = (diagonal.x ** 2) + (diagonal.y ** 2);
  const requested = length2 > 0 ? 1 + (((deltaPx.x * diagonal.x) + (deltaPx.y * diagonal.y)) / length2) : 1;

  const roomX = right ? 1 - box.x : box.x + box.width;
  const roomY = bottom ? 1 - box.y : box.y + height;
  const minFactor = Math.max(minTextOverlayFontSize / fontSize, minTextOverlayWidth / box.width);
  const maxFactor = Math.min(maxTextOverlayFontSize / fontSize, roomX / box.width, height > 0 ? roomY / height : Infinity);
  const factor = clamp(requested, minFactor, maxFactor);

  const nextFontSize = fontSize * factor;
  const width = Math.min(box.width * factor, roomX);
  const nextHeight = fitHeight(nextFontSize, width);
  const x = right ? box.x : box.x + box.width - width;
  const y = bottom ? box.y : box.y + height - nextHeight;
  return {
    fontSize: nextFontSize,
    box: { x: clamp(x, 0, 1 - width), y: clamp(y, 0, 1 - nextHeight), width, height: nextHeight },
  };
}

/** Changes the width from a side, the other side staying put; the text wraps again and the height follows. */
export function resizeTextBoxWidth(start: TextBoxStart, side: TextBoxSide, deltaX: number, fitHeight: FitHeight) {
  const { box, fontSize } = start;
  const room = side === 'right' ? 1 - box.x : box.x + box.width;
  const width = clamp(box.width + (side === 'right' ? deltaX : -deltaX), minTextOverlayWidth, room);
  const x = side === 'right' ? box.x : box.x + box.width - width;
  const height = fitHeight(fontSize, width);
  return { fontSize, box: { x, y: clamp(box.y, 0, 1 - height), width, height } };
}
