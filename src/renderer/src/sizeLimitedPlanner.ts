import type { SizeLimitQuality } from '../../common/types.js';
import type { SizeLimitedPlan, SizeLimitedRetryStep } from './types';

export const bytesPerMb = 1024 * 1024;
export const boundedRetryFactors = [1, 0.92, 0.84, 0.76] as const;

const minDurationSeconds = 0.5;
const minOverheadBytes = 32 * 1024;
const maxOverheadBytes = 256 * 1024;
const defaultOverheadRatio = 0.03;

const minVideoBitrate = 80_000;
const minAudioBitrate = 24_000;

const preferredAudioBitrates: Record<SizeLimitQuality, number> = {
  fast: 96_000,
  high_quality: 128_000,
};

export function targetSizeMbToBytes(targetSizeMb: number) {
  return Math.max(1, Math.floor(targetSizeMb * bytesPerMb));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getOverheadBytes(targetBytes: number) {
  return clamp(Math.floor(targetBytes * defaultOverheadRatio), minOverheadBytes, maxOverheadBytes);
}

function getPreferredAudioBitrate({ hasAudio, quality, totalBitrate }: { hasAudio: boolean, quality: SizeLimitQuality, totalBitrate: number }) {
  if (!hasAudio) return 0;

  const preferred = preferredAudioBitrates[quality];
  const cappedByBudget = Math.floor(totalBitrate * 0.25);
  const audioBitrate = Math.min(preferred, Math.max(minAudioBitrate, cappedByBudget));

  if (totalBitrate - audioBitrate < minVideoBitrate) {
    return Math.max(minAudioBitrate, totalBitrate - minVideoBitrate);
  }

  return audioBitrate;
}

function buildRetryStep({ attemptNumber, factor, baseTotalBitrate, audioBitrate }: {
  attemptNumber: number,
  factor: number,
  baseTotalBitrate: number,
  audioBitrate: number,
}) {
  const minTotalBitrate = minVideoBitrate + audioBitrate;
  const totalBitrate = Math.max(Math.floor(baseTotalBitrate * factor), minTotalBitrate);
  return {
    attemptNumber,
    totalBitrate,
    audioBitrate,
    videoBitrate: Math.max(totalBitrate - audioBitrate, minVideoBitrate),
  } satisfies SizeLimitedRetryStep;
}

export function planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, quality }: {
  targetSizeMb: number,
  duration: number,
  hasAudio: boolean,
  quality: SizeLimitQuality,
}) {
  const targetBytes = targetSizeMbToBytes(targetSizeMb);
  const safeDuration = Math.max(duration, minDurationSeconds);
  const overheadBytes = getOverheadBytes(targetBytes);
  const availableBytes = Math.max(targetBytes - overheadBytes, minOverheadBytes);
  const baseTotalBitrate = Math.max(Math.floor((availableBytes * 8) / safeDuration), minVideoBitrate + (hasAudio ? minAudioBitrate : 0));
  const audioBitrate = getPreferredAudioBitrate({ hasAudio, quality, totalBitrate: baseTotalBitrate });

  const retries = boundedRetryFactors.reduce<SizeLimitedRetryStep[]>((acc, factor, index) => {
    const step = buildRetryStep({
      attemptNumber: index + 1,
      factor,
      baseTotalBitrate,
      audioBitrate,
    });

    const previous = acc.at(-1);
    if (previous && previous.totalBitrate === step.totalBitrate) return acc;
    return [...acc, step];
  }, []);

  return {
    targetBytes,
    duration: safeDuration,
    overheadBytes,
    retries,
  } satisfies SizeLimitedPlan;
}
