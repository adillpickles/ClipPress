import type { SizeLimitControlMode, SizeLimitSimpleResolution } from '../../common/types.js';

const simpleResolutionSteps = [1440, 1080, 720] as const;
const lowBitrateThreshold = 4_000_000;
const highResThreshold = 6_000_000;
const maxAutoDisplayHeight = 1440;

export interface SizeLimitedDisplayDimensions {
  width: number,
  height: number,
}

export interface SizeLimitedOutputDimensions extends SizeLimitedDisplayDimensions {
  targetDisplayHeight: number,
}

function normalizeRotation(rotation: number | undefined) {
  if (rotation == null || Number.isNaN(rotation)) return 0;
  const normalized = ((Math.round(rotation) % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function isQuarterTurnRotation(rotation: number | undefined) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270;
}

function roundDownToEven(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function parseSimpleResolutionHeight(value: SizeLimitSimpleResolution) {
  switch (value) {
    case '720p': {
      return 720;
    }
    case '1080p': {
      return 1080;
    }
    case '1440p': {
      return 1440;
    }
    default: {
      return undefined;
    }
  }
}

export function getSizeLimitedDisplayDimensions({
  sourceWidth,
  sourceHeight,
  rotation,
}: {
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
}) {
  if (sourceWidth == null || sourceHeight == null || sourceWidth <= 0 || sourceHeight <= 0) return undefined;
  if (isQuarterTurnRotation(rotation)) {
    return { width: sourceHeight, height: sourceWidth } satisfies SizeLimitedDisplayDimensions;
  }
  return { width: sourceWidth, height: sourceHeight } satisfies SizeLimitedDisplayDimensions;
}

function getAutoTargetDisplayHeight(sourceDisplayHeight: number, plannedVideoBitrate: number) {
  if (sourceDisplayHeight <= 720) return undefined;
  if (sourceDisplayHeight <= 1080) {
    return plannedVideoBitrate < lowBitrateThreshold ? 720 : undefined;
  }
  if (plannedVideoBitrate < lowBitrateThreshold) return 720;
  if (plannedVideoBitrate < highResThreshold) return 1080;
  return sourceDisplayHeight > maxAutoDisplayHeight ? maxAutoDisplayHeight : undefined;
}

export function getSizeLimitedSimpleResolutionOptions({
  sourceWidth,
  sourceHeight,
  rotation,
}: {
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
}) {
  const displayDimensions = getSizeLimitedDisplayDimensions({ sourceWidth, sourceHeight, rotation });
  if (displayDimensions == null) {
    return ['auto', 'source'] satisfies SizeLimitSimpleResolution[];
  }

  return [
    'auto',
    'source',
    ...simpleResolutionSteps
      .filter((height) => height < displayDimensions.height)
      .map((height) => `${height}p` as const),
  ] satisfies SizeLimitSimpleResolution[];
}

export function resolveSizeLimitedOutputDimensions({
  controlMode,
  simpleResolution,
  sourceWidth,
  sourceHeight,
  rotation,
  plannedVideoBitrate,
}: {
  controlMode: SizeLimitControlMode,
  simpleResolution: SizeLimitSimpleResolution,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
  plannedVideoBitrate: number,
}) {
  if (controlMode !== 'simple') return undefined;

  const displayDimensions = getSizeLimitedDisplayDimensions({ sourceWidth, sourceHeight, rotation });
  if (displayDimensions == null || sourceWidth == null || sourceHeight == null) return undefined;

  const targetDisplayHeight = simpleResolution === 'auto'
    ? getAutoTargetDisplayHeight(displayDimensions.height, plannedVideoBitrate)
    : parseSimpleResolutionHeight(simpleResolution);

  if (targetDisplayHeight == null || targetDisplayHeight >= displayDimensions.height) return undefined;

  const scaleFactor = targetDisplayHeight / displayDimensions.height;
  if (scaleFactor >= 1) return undefined;

  const scaledWidth = roundDownToEven(sourceWidth * scaleFactor);
  const scaledHeight = roundDownToEven(sourceHeight * scaleFactor);

  if (scaledWidth >= sourceWidth && scaledHeight >= sourceHeight) return undefined;

  return {
    width: scaledWidth,
    height: scaledHeight,
    targetDisplayHeight,
  } satisfies SizeLimitedOutputDimensions;
}
