import type { FfmpegHwAccel } from './types.ts';

export const parseFfprobeDuration = (durationStr: string | undefined) => (
  durationStr != null ? parseFloat(durationStr) : undefined
);

export const getHwaccelArgs = (hwaccel: FfmpegHwAccel) => (hwaccel !== 'none' ? ['-hwaccel', hwaccel] : []);

// 6 decimals (FFmpeg's microseconds): with 5, a cut edge on a frame boundary could round past it and copy one frame too many
// (LosslessCut #2838). Times are still rounded, as FFmpeg can reject a time argument with too many decimals.
export const formatFfmpegNumber = (n: number) => n.toFixed(6);
