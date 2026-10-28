import i18n from 'i18next';

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
    return new UserFacingError(i18n.t("H.264 couldn't get this clip that small. Try AV1, a lower resolution or frame rate, or a bigger size."));
  }

  return new UserFacingError(i18n.t("This clip can't be made that small. Try a bigger size or a shorter clip."));
}

export function finalizeSizeLimitedExecutionResult(bestResult: SizeLimitedExecutionResult | undefined) {
  if (bestResult == null) {
    throw new UserFacingError(i18n.t('Unable to create a size-limited export'));
  }

  if (!bestResult.metTarget) {
    throw createSizeLimitedTargetFailure(bestResult);
  }

  return bestResult;
}
