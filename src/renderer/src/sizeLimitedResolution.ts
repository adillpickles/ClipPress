import type { SizeLimitControlMode, SizeLimitSimpleFps, SizeLimitSimpleResolution } from '../../common/types.js';

const simpleResolutionSteps = [1440, 1080, 720] as const;
const lowBitrateThreshold = 4_000_000;
const highResThreshold = 6_000_000;
const maxAutoDisplayHeight = 1440;
const autoFpsDropThreshold = 0.035;
const targetLowFps = 30;
export const sizeLimitedSwsFlags = 'lanczos+accurate_rnd';

export type SizeLimitedResolutionDecision = 'keep_source' | 'scale_to_720p' | 'scale_to_1080p' | 'scale_to_1440p';
export type SizeLimitedFpsDecision = 'keep_source' | 'drop_to_30';

export interface SizeLimitedDisplayDimensions {
  width: number,
  height: number,
}

export interface SizeLimitedOutputDimensions extends SizeLimitedDisplayDimensions {
  targetDisplayHeight: number,
}

export interface ResolvedSizeLimitedVideoProfile {
  outputWidth: number | undefined,
  outputHeight: number | undefined,
  outputFps: number | undefined,
  targetDisplayHeight: number | undefined,
  resolutionDecision: SizeLimitedResolutionDecision,
  fpsDecision: SizeLimitedFpsDecision,
}

export interface SizeLimitedVideoTransformProfile {
  outputWidth: number | undefined,
  outputHeight: number | undefined,
  outputFps: number | undefined,
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

function canReduceFpsTo30(sourceFps: number | undefined) {
  return sourceFps != null && Number.isFinite(sourceFps) && sourceFps > targetLowFps;
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

function getResolutionDecision(targetDisplayHeight: number | undefined): SizeLimitedResolutionDecision {
  switch (targetDisplayHeight) {
    case 720: {
      return 'scale_to_720p';
    }
    case 1080: {
      return 'scale_to_1080p';
    }
    case 1440: {
      return 'scale_to_1440p';
    }
    default: {
      return 'keep_source';
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

function resolveTargetDisplayHeight({
  simpleResolution,
  sourceDisplayHeight,
  plannedVideoBitrate,
}: {
  simpleResolution: SizeLimitSimpleResolution,
  sourceDisplayHeight: number,
  plannedVideoBitrate: number,
}) {
  return simpleResolution === 'auto'
    ? getAutoTargetDisplayHeight(sourceDisplayHeight, plannedVideoBitrate)
    : parseSimpleResolutionHeight(simpleResolution);
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

export function getSizeLimitedSimpleFpsOptions({
  sourceFps,
}: {
  sourceFps: number | undefined,
}) {
  if (!canReduceFpsTo30(sourceFps)) {
    return ['auto', 'source'] satisfies SizeLimitSimpleFps[];
  }

  return ['auto', 'source', '30fps'] satisfies SizeLimitSimpleFps[];
}

function shouldDropFpsTo30({
  simpleFps,
  sourceFps,
  plannedVideoBitrate,
  resolvedWidth,
  resolvedHeight,
}: {
  simpleFps: SizeLimitSimpleFps,
  sourceFps: number | undefined,
  plannedVideoBitrate: number,
  resolvedWidth: number | undefined,
  resolvedHeight: number | undefined,
}) {
  if (!canReduceFpsTo30(sourceFps)) return false;
  if (simpleFps === 'source') return false;
  if (simpleFps === '30fps') return true;
  if (resolvedWidth == null || resolvedHeight == null) return false;
  if (sourceFps == null) return false;

  const referenceFps = Math.min(sourceFps, 60);
  const bitratePerPixelFrame = plannedVideoBitrate / (resolvedWidth * resolvedHeight * referenceFps);
  return bitratePerPixelFrame < autoFpsDropThreshold;
}

export function resolveSizeLimitedVideoProfile({
  controlMode,
  simpleResolution,
  simpleFps,
  sourceWidth,
  sourceHeight,
  rotation,
  sourceFps,
  plannedVideoBitrate,
}: {
  controlMode: SizeLimitControlMode,
  simpleResolution: SizeLimitSimpleResolution,
  simpleFps: SizeLimitSimpleFps,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
  sourceFps: number | undefined,
  plannedVideoBitrate: number,
}) {
  if (controlMode !== 'simple') {
    return {
      outputWidth: undefined,
      outputHeight: undefined,
      outputFps: undefined,
      targetDisplayHeight: undefined,
      resolutionDecision: 'keep_source',
      fpsDecision: 'keep_source',
    } satisfies ResolvedSizeLimitedVideoProfile;
  }

  const displayDimensions = getSizeLimitedDisplayDimensions({ sourceWidth, sourceHeight, rotation });
  if (displayDimensions == null || sourceWidth == null || sourceHeight == null) {
    return {
      outputWidth: undefined,
      outputHeight: undefined,
      outputFps: undefined,
      targetDisplayHeight: undefined,
      resolutionDecision: 'keep_source',
      fpsDecision: 'keep_source',
    } satisfies ResolvedSizeLimitedVideoProfile;
  }

  const requestedDisplayHeight = resolveTargetDisplayHeight({
    simpleResolution,
    sourceDisplayHeight: displayDimensions.height,
    plannedVideoBitrate,
  });

  let outputWidth: number | undefined;
  let outputHeight: number | undefined;
  let targetDisplayHeight: number | undefined;

  if (requestedDisplayHeight != null && requestedDisplayHeight < displayDimensions.height) {
    const scaleFactor = requestedDisplayHeight / displayDimensions.height;
    if (scaleFactor < 1) {
      const scaledWidth = roundDownToEven(sourceWidth * scaleFactor);
      const scaledHeight = roundDownToEven(sourceHeight * scaleFactor);

      if (scaledWidth < sourceWidth || scaledHeight < sourceHeight) {
        outputWidth = scaledWidth;
        outputHeight = scaledHeight;
        targetDisplayHeight = requestedDisplayHeight;
      }
    }
  }

  const resolvedWidth = outputWidth ?? sourceWidth;
  const resolvedHeight = outputHeight ?? sourceHeight;
  const outputFps = shouldDropFpsTo30({
    simpleFps,
    sourceFps,
    plannedVideoBitrate,
    resolvedWidth,
    resolvedHeight,
  }) ? targetLowFps : undefined;

  return {
    outputWidth,
    outputHeight,
    outputFps,
    targetDisplayHeight,
    resolutionDecision: getResolutionDecision(targetDisplayHeight),
    fpsDecision: outputFps != null ? 'drop_to_30' : 'keep_source',
  } satisfies ResolvedSizeLimitedVideoProfile;
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
  const videoProfile = resolveSizeLimitedVideoProfile({
    controlMode,
    simpleResolution,
    simpleFps: 'source',
    sourceWidth,
    sourceHeight,
    rotation,
    sourceFps: undefined,
    plannedVideoBitrate,
  });

  if (videoProfile.outputWidth == null || videoProfile.outputHeight == null || videoProfile.targetDisplayHeight == null) return undefined;

  return {
    width: videoProfile.outputWidth,
    height: videoProfile.outputHeight,
    targetDisplayHeight: videoProfile.targetDisplayHeight,
  } satisfies SizeLimitedOutputDimensions;
}

export function buildSizeLimitedScaleFilter(outputWidth: number | undefined, outputHeight: number | undefined) {
  if (outputWidth == null || outputHeight == null) return undefined;
  return `scale=${outputWidth}:${outputHeight}:flags=${sizeLimitedSwsFlags}`;
}

export function buildSizeLimitedVideoTransformFilters({
  videoProfile,
}: {
  videoProfile: SizeLimitedVideoTransformProfile,
}) {
  const filters: string[] = [];

  // Resolution is chosen before FPS reduction, but fps runs first so we avoid scaling frames we will discard.
  if (videoProfile.outputFps != null) filters.push(`fps=${videoProfile.outputFps}`);

  const scaleFilter = buildSizeLimitedScaleFilter(videoProfile.outputWidth, videoProfile.outputHeight);
  if (scaleFilter != null) filters.push(scaleFilter);

  return filters;
}

export function buildSizeLimitedVideoFilter({
  videoProfile,
}: {
  videoProfile: SizeLimitedVideoTransformProfile,
}) {
  const filters = buildSizeLimitedVideoTransformFilters({ videoProfile });
  return filters.length > 0 ? filters.join(',') : undefined;
}
