import { UserFacingError } from '../errors';
import type { SizeLimitedExecutionResult, SizeLimitedResolvedStrategy } from './types';

export const tightAdvancedH264WarningVideoBitrateThreshold = 3_000_000;

export function shouldWarnAboutTightAdvancedH264Target({
  strategy,
  videoBitrate,
}: {
  strategy: Pick<SizeLimitedResolvedStrategy, 'controlMode' | 'effectiveCodec'>,
  videoBitrate: number,
}) {
  return strategy.controlMode === 'advanced' && strategy.effectiveCodec === 'h264' && videoBitrate < tightAdvancedH264WarningVideoBitrateThreshold;
}

function createSizeLimitedTargetFailure(bestResult: SizeLimitedExecutionResult) {
  if (bestResult.strategy.effectiveCodec === 'h264') {
    return new UserFacingError(`H.264 could not reach the requested file-size limit for this clip after ${bestResult.attemptCount} attempt(s). Try AV1, lower resolution/FPS, or increase the target size.`);
  }

  return new UserFacingError('Unable to create a size-limited export under the requested file-size limit');
}

export function finalizeSizeLimitedExecutionResult(bestResult: SizeLimitedExecutionResult | undefined) {
  if (bestResult == null) {
    throw new UserFacingError('Unable to create a size-limited export');
  }

  if (!bestResult.metTarget) {
    throw createSizeLimitedTargetFailure(bestResult);
  }

  return bestResult;
}
