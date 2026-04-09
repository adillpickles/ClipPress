import type { OverlayBox, OverlayClip, TextOverlayClip } from './types';

const defaultTextOverlayDuration = 3;
export const minTextOverlayDuration = 0.1;
export const defaultTextOverlayText = 'Sample Text';
export const defaultTextOverlayFontFamily = 'Arial, sans-serif';

const defaultOverlayBox: OverlayBox = {
  x: 0.2,
  y: 0.12,
  width: 0.6,
  height: 0.18,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampOverlayNumber(value: number) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

export function clampOverlayBox(box: OverlayBox): OverlayBox {
  const width = clamp(box.width, 0.05, 1);
  const height = clamp(box.height, 0.08, 1);
  const x = clamp(box.x, 0, 1 - width);
  const y = clamp(box.y, 0, 1 - height);
  return { x, y, width, height };
}

export function normalizeRotation(rotation: number | undefined) {
  if (rotation == null || !Number.isFinite(rotation)) return 0;
  const normalizedRotation = Math.round(rotation / 90) * 90;
  const normalized = (((normalizedRotation % 360) + 360) % 360);
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function getRotatedVideoDimensions({
  width,
  height,
  rotation,
}: {
  width: number,
  height: number,
  rotation: number | undefined,
}) {
  const normalizedRotation = normalizeRotation(rotation);
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

export function createDefaultTextOverlayClip({
  currentTime,
  fileDuration,
  overlayId,
}: {
  currentTime: number,
  fileDuration: number | undefined,
  overlayId: string,
}): TextOverlayClip {
  const safeCurrentTime = Math.max(0, currentTime);
  const safeDuration = fileDuration != null && Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : undefined;
  const maxStart = safeDuration != null ? Math.max(0, safeDuration - minTextOverlayDuration) : safeCurrentTime;
  const start = clamp(safeCurrentTime, 0, maxStart);
  const preferredEnd = start + defaultTextOverlayDuration;
  const end = safeDuration != null
    ? Math.max(start + minTextOverlayDuration, Math.min(preferredEnd, safeDuration))
    : preferredEnd;

  return {
    overlayId,
    type: 'text',
    start,
    end,
    text: defaultTextOverlayText,
    box: { ...defaultOverlayBox },
  };
}

export function isOverlayActiveAtTime(overlayClip: OverlayClip, time: number) {
  return time >= overlayClip.start && time <= overlayClip.end;
}

export function doOverlayAndSegmentOverlap(overlayClip: OverlayClip, segment: { start: number, end: number }) {
  return overlayClip.start < segment.end && overlayClip.end > segment.start;
}

function wrapTextLines({
  ctx,
  text,
  maxWidth,
}: {
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
}) {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (trimmedParagraph.length === 0) {
      lines.push('');
    } else {
      const words = trimmedParagraph.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const proposedLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;
        if (ctx.measureText(proposedLine).width <= maxWidth || currentLine.length === 0) {
          currentLine = proposedLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine.length > 0) lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

export function getPreviewFontSize({
  surfaceHeight,
  boxHeight,
}: {
  surfaceHeight: number,
  boxHeight: number,
}) {
  return Math.max(14, Math.round(surfaceHeight * boxHeight * 0.28));
}

export async function renderTextOverlayPng({
  text,
  width,
  height,
}: {
  text: string,
  width: number,
  height: number,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(width));
  canvas.height = Math.max(8, Math.round(height));

  const ctx = canvas.getContext('2d');
  if (ctx == null) throw new Error('Failed to create text overlay canvas');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const horizontalPadding = Math.max(8, canvas.width * 0.06);
  const verticalPadding = Math.max(6, canvas.height * 0.1);
  const maxTextWidth = Math.max(1, canvas.width - (horizontalPadding * 2));
  const maxTextHeight = Math.max(1, canvas.height - (verticalPadding * 2));

  let fontSize = Math.max(14, Math.round(canvas.height * 0.32));
  let lines = [''];
  let lineHeight = fontSize * 1.15;

  while (fontSize >= 12) {
    ctx.font = `${fontSize}px ${defaultTextOverlayFontFamily}`;
    lines = wrapTextLines({ ctx, text, maxWidth: maxTextWidth });
    lineHeight = fontSize * 1.15;
    const totalHeight = lines.length * lineHeight;
    const widestLine = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    if (widestLine <= maxTextWidth && totalHeight <= maxTextHeight) break;
    fontSize -= 1;
  }

  ctx.font = `${fontSize}px ${defaultTextOverlayFontFamily}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = Math.max(2, fontSize * 0.12);
  ctx.shadowOffsetX = Math.max(1, fontSize * 0.04);
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);

  const totalTextHeight = lines.length * lineHeight;
  let cursorY = verticalPadding + Math.max(0, (maxTextHeight - totalTextHeight) / 2);

  for (const line of lines) {
    ctx.fillText(line, horizontalPadding, cursorY);
    cursorY += lineHeight;
  }

  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

export function sanitizeOverlayClip(overlayClip: OverlayClip): OverlayClip {
  return {
    ...overlayClip,
    start: Math.max(0, overlayClip.start),
    end: Math.max(overlayClip.start + minTextOverlayDuration, overlayClip.end),
    text: overlayClip.text,
    box: clampOverlayBox({
      x: clampOverlayNumber(overlayClip.box.x),
      y: clampOverlayNumber(overlayClip.box.y),
      width: clampOverlayNumber(overlayClip.box.width),
      height: clampOverlayNumber(overlayClip.box.height),
    }),
  };
}
