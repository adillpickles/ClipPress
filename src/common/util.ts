import type { FfmpegHwAccel } from './types.ts';

export const parseFfprobeDuration = (durationStr: string | undefined) => (
  durationStr != null ? parseFloat(durationStr) : undefined
);

export const getHwaccelArgs = (hwaccel: FfmpegHwAccel) => (hwaccel !== 'none' ? ['-hwaccel', hwaccel] : []);

// 6 decimals (FFmpeg's microseconds): with 5, a cut edge on a frame boundary could round past it and copy one frame too many
// (LosslessCut #2838). Times are still rounded, as FFmpeg can reject a time argument with too many decimals.
export const formatFfmpegNumber = (n: number) => n.toFixed(6);

export function parseRatio(str: string, char = '/') {
  const split = str.split(char);
  if (split.length !== 2) return undefined;
  const num = parseInt(split[0]!, 10);
  const den = parseInt(split[1]!, 10);
  if (Number.isNaN(num) || Number.isNaN(den)) return undefined;
  if (den <= 0) return undefined;
  return num / den;
}
