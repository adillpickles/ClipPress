import { UserFacingError } from '../errors';
import type { SizeLimitedExecutionResult } from './types';

export const fastH264NvencVideoBitrateThreshold = 2_500_000;

export function shouldUseH264NvencForSimpleFast(videoBitrate: number) {
  return videoBitrate >= fastH264NvencVideoBitrateThreshold;
}

export function finalizeSizeLimitedExecutionResult(bestResult: SizeLimitedExecutionResult | undefined) {
  if (bestResult == null) {
    throw new UserFacingError('Unable to create a size-limited export');
  }

  if (!bestResult.metTarget) {
    throw new UserFacingError('Unable to create a size-limited export under the requested file-size limit');
  }

  return bestResult;
}
