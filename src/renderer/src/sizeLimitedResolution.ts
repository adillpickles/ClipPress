import type { SizeLimitControlMode, SizeLimitPreset, SizeLimitSimpleFps, SizeLimitSimpleResolution } from '../../common/types.js';

const simpleResolutionSteps = [1440, 1080, 720] as const;
const maxAutoDisplayHeight = 1440;
const autoBitratePerPixelFrameThreshold = 0.035;
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

export interface ResolvedSizeLimitedTransformSettings {
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
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

function buildResolvedVideoProfile({
  outputWidth,
  outputHeight,
  outputFps,
  targetDisplayHeight,
}: {
  outputWidth: number | undefined,
  outputHeight: number | undefined,
  outputFps: number | undefined,
  targetDisplayHeight: number | undefined,
}) {
  return {
    outputWidth,
    outputHeight,
    outputFps,
    targetDisplayHeight,
    resolutionDecision: getResolutionDecision(targetDisplayHeight),
    fpsDecision: outputFps != null ? 'drop_to_30' : 'keep_source',
  } satisfies ResolvedSizeLimitedVideoProfile;
}

function buildKeepSourceProfile() {
  return buildResolvedVideoProfile({
    outputWidth: undefined,
    outputHeight: undefined,
    outputFps: undefined,
    targetDisplayHeight: undefined,
  });
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

function getAutoSourceFpsCandidateHeights(sourceDisplayHeight: number) {
  if (sourceDisplayHeight <= 720) return [undefined];
  if (sourceDisplayHeight <= 1080) return [undefined, 720];
  if (sourceDisplayHeight <= 1440) return [undefined, 1080, 720];
  return [maxAutoDisplayHeight, 1080, 720];
}

function getAuto30FpsCandidateHeights(sourceDisplayHeight: number) {
  if (sourceDisplayHeight <= 720) return [undefined];
  if (sourceDisplayHeight <= 1080) return [undefined, 720];
  return [1080, 720];
}

function buildTargetDisplayHeightCandidates({
  resolution,
  sourceDisplayHeight,
  prefer30Fps,
}: {
  resolution: SizeLimitSimpleResolution,
  sourceDisplayHeight: number,
  prefer30Fps: boolean,
}) {
  if (resolution !== 'auto') return [parseSimpleResolutionHeight(resolution)];
  return prefer30Fps ? getAuto30FpsCandidateHeights(sourceDisplayHeight) : getAutoSourceFpsCandidateHeights(sourceDisplayHeight);
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

export function resolveEffectiveSizeLimitedTransformSettings({
  controlMode,
  preset,
  simpleResolution,
  simpleResolutionTouched,
  simpleFps,
  simpleFpsTouched,
  advancedResolution,
  advancedFps,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  simpleResolution: SizeLimitSimpleResolution,
  simpleResolutionTouched: boolean,
  simpleFps: SizeLimitSimpleFps,
  simpleFpsTouched: boolean,
  advancedResolution: SizeLimitSimpleResolution,
  advancedFps: SizeLimitSimpleFps,
}) {
  if (controlMode === 'advanced') {
    return {
      resolution: advancedResolution,
      fps: advancedFps,
    } satisfies ResolvedSizeLimitedTransformSettings;
  }

  if (preset !== 'max_quality') {
    return {
      resolution: simpleResolution,
      fps: simpleFps,
    } satisfies ResolvedSizeLimitedTransformSettings;
  }

  return {
    resolution: !simpleResolutionTouched && simpleResolution === 'auto' ? 'source' : simpleResolution,
    fps: !simpleFpsTouched && simpleFps === 'auto' ? 'source' : simpleFps,
  } satisfies ResolvedSizeLimitedTransformSettings;
}

function getReferenceFpsForProfile({
  outputFps,
  sourceFps,
}: {
  outputFps: number | undefined,
  sourceFps: number | undefined,
}) {
  if (outputFps != null) return outputFps;
  if (sourceFps == null || !Number.isFinite(sourceFps) || sourceFps <= 0) return undefined;
  return Math.min(sourceFps, 60);
}

function buildVideoProfileForTargetDisplayHeight({
  targetDisplayHeight: requestedDisplayHeight,
  displayDimensions,
  sourceWidth,
  sourceHeight,
  outputFps,
}: {
  targetDisplayHeight: number | undefined,
  displayDimensions: SizeLimitedDisplayDimensions,
  sourceWidth: number,
  sourceHeight: number,
  outputFps: number | undefined,
}) {
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

  return buildResolvedVideoProfile({
    outputWidth,
    outputHeight,
    outputFps,
    targetDisplayHeight,
  });
}

function isVideoProfileSupported({
  videoProfile,
  sourceWidth,
  sourceHeight,
  sourceFps,
  plannedVideoBitrate,
}: {
  videoProfile: ResolvedSizeLimitedVideoProfile,
  sourceWidth: number,
  sourceHeight: number,
  sourceFps: number | undefined,
  plannedVideoBitrate: number,
}) {
  const referenceFps = getReferenceFpsForProfile({
    outputFps: videoProfile.outputFps,
    sourceFps,
  });
  if (referenceFps == null) return true;

  const resolvedWidth = videoProfile.outputWidth ?? sourceWidth;
  const resolvedHeight = videoProfile.outputHeight ?? sourceHeight;
  const bitratePerPixelFrame = plannedVideoBitrate / (resolvedWidth * resolvedHeight * referenceFps);
  return bitratePerPixelFrame >= autoBitratePerPixelFrameThreshold;
}

function findSupportedVideoProfile({
  candidateHeights,
  displayDimensions,
  sourceWidth,
  sourceHeight,
  outputFps,
  sourceFps,
  plannedVideoBitrate,
}: {
  candidateHeights: (number | undefined)[],
  displayDimensions: SizeLimitedDisplayDimensions,
  sourceWidth: number,
  sourceHeight: number,
  outputFps: number | undefined,
  sourceFps: number | undefined,
  plannedVideoBitrate: number,
}) {
  return candidateHeights
    .map((targetDisplayHeight) => buildVideoProfileForTargetDisplayHeight({
      targetDisplayHeight,
      displayDimensions,
      sourceWidth,
      sourceHeight,
      outputFps,
    }))
    .find((videoProfile) => isVideoProfileSupported({
      videoProfile,
      sourceWidth,
      sourceHeight,
      sourceFps,
      plannedVideoBitrate,
    }));
}

function getLastVideoProfile({
  candidateHeights,
  displayDimensions,
  sourceWidth,
  sourceHeight,
  outputFps,
}: {
  candidateHeights: (number | undefined)[],
  displayDimensions: SizeLimitedDisplayDimensions,
  sourceWidth: number,
  sourceHeight: number,
  outputFps: number | undefined,
}) {
  const lastCandidateHeight = candidateHeights.at(-1);
  if (lastCandidateHeight === undefined && candidateHeights.length === 0) return undefined;

  return buildVideoProfileForTargetDisplayHeight({
    targetDisplayHeight: lastCandidateHeight,
    displayDimensions,
    sourceWidth,
    sourceHeight,
    outputFps,
  });
}

export function resolveSizeLimitedVideoProfile({
  resolution,
  fps,
  sourceWidth,
  sourceHeight,
  rotation,
  sourceFps,
  plannedVideoBitrate,
}: {
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
  sourceFps: number | undefined,
  plannedVideoBitrate: number,
}) {
  const displayDimensions = getSizeLimitedDisplayDimensions({ sourceWidth, sourceHeight, rotation });
  if (displayDimensions == null || sourceWidth == null || sourceHeight == null) {
    return buildKeepSourceProfile();
  }

  const sourceCandidateHeights = buildTargetDisplayHeightCandidates({
    resolution,
    sourceDisplayHeight: displayDimensions.height,
    prefer30Fps: false,
  });
  const sourceProfile = findSupportedVideoProfile({
    candidateHeights: sourceCandidateHeights,
    displayDimensions,
    sourceWidth,
    sourceHeight,
    outputFps: undefined,
    sourceFps,
    plannedVideoBitrate,
  });

  if (fps === 'source') {
    return sourceProfile ?? getLastVideoProfile({
      candidateHeights: sourceCandidateHeights,
      displayDimensions,
      sourceWidth,
      sourceHeight,
      outputFps: undefined,
    }) ?? buildKeepSourceProfile();
  }

  if (fps === 'auto' && sourceProfile != null) return sourceProfile;

  if (!canReduceFpsTo30(sourceFps)) {
    return sourceProfile ?? getLastVideoProfile({
      candidateHeights: sourceCandidateHeights,
      displayDimensions,
      sourceWidth,
      sourceHeight,
      outputFps: undefined,
    }) ?? buildKeepSourceProfile();
  }

  const reducedFpsCandidateHeights = buildTargetDisplayHeightCandidates({
    resolution,
    sourceDisplayHeight: displayDimensions.height,
    prefer30Fps: true,
  });
  const reducedFpsProfile = findSupportedVideoProfile({
    candidateHeights: reducedFpsCandidateHeights,
    displayDimensions,
    sourceWidth,
    sourceHeight,
    outputFps: targetLowFps,
    sourceFps,
    plannedVideoBitrate,
  });
  if (reducedFpsProfile != null) return reducedFpsProfile;

  return getLastVideoProfile({
    candidateHeights: reducedFpsCandidateHeights,
    displayDimensions,
    sourceWidth,
    sourceHeight,
    outputFps: targetLowFps,
  }) ?? sourceProfile ?? getLastVideoProfile({
    candidateHeights: sourceCandidateHeights,
    displayDimensions,
    sourceWidth,
    sourceHeight,
    outputFps: undefined,
  }) ?? buildKeepSourceProfile();
}

export function resolveSizeLimitedOutputDimensions({
  resolution,
  sourceWidth,
  sourceHeight,
  rotation,
  plannedVideoBitrate,
}: {
  resolution: SizeLimitSimpleResolution,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  rotation: number | undefined,
  plannedVideoBitrate: number,
}) {
  const videoProfile = resolveSizeLimitedVideoProfile({
    resolution,
    fps: 'source',
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
