import type { OverlayBox, OverlayClip, TextOverlayClip } from './types';
import type { FFprobeStream } from '../../common/ffprobe';

const defaultTextOverlayDuration = 3;
export const minTextOverlayDuration = 0.1;
export const defaultTextOverlayText = 'Sample Text';
export const defaultTextOverlayFontFamily = 'Arial, sans-serif';
/** Font sizes are fractions of the (rotated) video height so they survive resolution changes. */
export const defaultTextOverlayFontSize = 0.055;
export const minTextOverlayFontSize = 0.015;
export const maxTextOverlayFontSize = 0.3;
export const minTextOverlayWidth = 0.05;
export const textOverlayLineHeight = 1.15;
// Before font size was stored, the preview derived it from the box height.
const legacyFontSizePerBoxHeight = 0.28;

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

/** FFprobe display matrices use counterclockwise degrees; the editor uses clockwise. */
export function getVideoStreamRotation(stream: Pick<FFprobeStream, 'tags' | 'side_data_list'> | undefined) {
  const matrixRotation = stream?.side_data_list?.find((data) => data.side_data_type === 'Display Matrix')?.rotation;
  if (matrixRotation != null && Number.isFinite(matrixRotation)) return normalizeRotation(-matrixRotation);
  const tagRotation = stream?.tags?.rotate != null ? Number(stream.tags.rotate) : undefined;
  return tagRotation != null && Number.isFinite(tagRotation) ? normalizeRotation(tagRotation) : undefined;
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
  let end = safeDuration != null
    ? Math.max(start + minTextOverlayDuration, Math.min(preferredEnd, safeDuration))
    : preferredEnd;
  // For very short media (< min duration), we cannot satisfy min duration without exceeding file length.
  // Clamp to file duration instead.
  if (safeDuration != null && end > safeDuration) end = safeDuration;

  return {
    overlayId,
    type: 'text',
    start,
    end,
    text: defaultTextOverlayText,
    fontSize: defaultTextOverlayFontSize,
    box: { ...defaultOverlayBox, height: defaultTextOverlayFontSize * (textOverlayLineHeight + 0.4) },
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
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
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
        if (ctx.measureText(proposedLine).width <= maxWidth) {
          currentLine = proposedLine;
        } else {
          if (currentLine.length > 0) lines.push(currentLine);
          currentLine = '';
          // Split a word wider than the box across lines instead of letting it overflow.
          for (const char of word) {
            if (currentLine.length > 0 && ctx.measureText(currentLine + char).width > maxWidth) {
              lines.push(currentLine);
              currentLine = '';
            }
            currentLine += char;
          }
        }
      }

      if (currentLine.length > 0) lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

export function getOverlayFontSize(overlayClip: Pick<TextOverlayClip, 'fontSize' | 'box'>) {
  const fontSize = overlayClip.fontSize ?? overlayClip.box.height * legacyFontSizePerBoxHeight;
  return clamp(Number.isFinite(fontSize) ? fontSize : defaultTextOverlayFontSize, minTextOverlayFontSize, maxTextOverlayFontSize);
}

type MeasureContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

let sharedMeasureContext: MeasureContext | undefined;
function getMeasureContext() {
  sharedMeasureContext ??= document.createElement('canvas').getContext('2d') ?? undefined;
  if (sharedMeasureContext == null) throw new Error('Failed to create text measuring canvas');
  return sharedMeasureContext;
}

/**
 * Wraps text to the box width at a fixed font size. The box grows to fit every line, so the
 * editor preview and the exported image share one layout (all values in video pixels).
 */
export function layoutTextOverlay({ text, widthPx, fontSizePx, ctx: measureContext }: {
  text: string,
  widthPx: number,
  fontSizePx: number,
  ctx?: MeasureContext | undefined,
}) {
  const paddingX = fontSizePx * 0.35;
  const paddingY = fontSizePx * 0.2;
  const ctx = measureContext ?? getMeasureContext();
  ctx.font = `${fontSizePx}px ${defaultTextOverlayFontFamily}`;
  const lines = wrapTextLines({ ctx, text, maxWidth: Math.max(1, widthPx - (paddingX * 2)) });
  const lineHeightPx = fontSizePx * textOverlayLineHeight;
  return { lines, lineHeightPx, paddingX, paddingY, heightPx: (lines.length * lineHeightPx) + (paddingY * 2) };
}

/** Box height (fraction of video height) that fits the clip's text; also pins the font size. */
export function fitTextOverlayBox(overlayClip: TextOverlayClip, videoWidth: number, videoHeight: number, ctx?: MeasureContext): TextOverlayClip {
  const fontSize = getOverlayFontSize(overlayClip);
  const { heightPx } = layoutTextOverlay({ text: overlayClip.text, widthPx: overlayClip.box.width * videoWidth, fontSizePx: fontSize * videoHeight, ctx });
  return { ...overlayClip, fontSize, box: { ...overlayClip.box, height: Math.min(1, heightPx / videoHeight) } };
}

export async function renderTextOverlayPng({
  text,
  width,
  fontSize,
}: {
  text: string,
  width: number,
  fontSize: number,
}) {
  const { lines, lineHeightPx, paddingX, paddingY, heightPx } = layoutTextOverlay({ text, widthPx: width, fontSizePx: fontSize });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(width));
  canvas.height = Math.max(8, Math.ceil(heightPx));

  const ctx = canvas.getContext('2d');
  if (ctx == null) throw new Error('Failed to create text overlay canvas');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px ${defaultTextOverlayFontFamily}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = Math.max(2, fontSize * 0.12);
  ctx.shadowOffsetX = Math.max(1, fontSize * 0.04);
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);

  lines.forEach((line, index) => ctx.fillText(line, paddingX, paddingY + (index * lineHeightPx)));

  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

export function sanitizeOverlayClip(overlayClip: OverlayClip, fileDuration?: number): OverlayClip {
  const safeDuration = fileDuration != null && Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : undefined;
  const clampedStart = Math.max(0, Math.min(overlayClip.start, safeDuration != null ? Math.max(0, safeDuration - minTextOverlayDuration) : overlayClip.start));
  const maxEnd = safeDuration != null ? safeDuration : Number.POSITIVE_INFINITY;
  const desiredEnd = Math.max(clampedStart + minTextOverlayDuration, overlayClip.end);
  const clampedEnd = Math.min(desiredEnd, maxEnd);
  return {
    ...overlayClip,
    start: clampedStart,
    end: clampedEnd,
    text: overlayClip.text,
    ...(overlayClip.fontSize != null ? { fontSize: getOverlayFontSize(overlayClip) } : {}),
    box: clampOverlayBox({
      x: clampOverlayNumber(overlayClip.box.x),
      y: clampOverlayNumber(overlayClip.box.y),
      width: clampOverlayNumber(overlayClip.box.width),
      height: clampOverlayNumber(overlayClip.box.height),
    }),
  };
}
