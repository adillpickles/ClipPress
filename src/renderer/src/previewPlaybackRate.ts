import { adjustRate } from './util/rate-calculator';

/**
 * The preview plays at the clip's speed times advanced mode's whole-export speed times J and L's. Chromium refuses a
 * rate above 16× or below 1/16×; up to 16× it keeps the sound, its pitch preserved (measured).
 */
export const maxVideoPlaybackRate = 16;
export const minVideoPlaybackRate = 1 / 16;
/** J and L go up to 8× (a sped-up clip still plays faster, up to 16×). */
export const maxUserPlaybackRate = 8;

/** The rate the video element plays at. */
export function getVideoPlaybackRate({ userRate, speeds }: { userRate: number, /** The clip's speed times the whole export's. */ speeds: number }) {
  return Math.min(maxVideoPlaybackRate, Math.max(minVideoPlaybackRate, userRate * speeds));
}

/** J and L's next factor, stepped on their own (never worked back out of a rate that was capped). */
export function stepUserPlaybackRate({ userRate, direction, multiplier }: { userRate: number, direction: number, multiplier?: number | undefined }) {
  return Math.min(maxUserPlaybackRate, Math.max(minVideoPlaybackRate, adjustRate(userRate, direction, multiplier)));
}

/** The last frame the preview showed while playing: when, and its time in the recording. */
export interface PreviewFrame { at: number, mediaTime: number }

/**
 * Playing, the frame loop sets a clip's speed on its first frame, and the playhead time from `timeupdate` (every
 * ~250 ms) can still be from before it. That time sets the speed only once it's past the last frame shown, or when
 * no frame has come for a while: a still stretch of a recording that only stores changed frames, a minimised window,
 * sound past the last frame.
 */
export function isFrameLoopAhead({ lastFrame, time, now }: { lastFrame: PreviewFrame | undefined, time: number, now: number }) {
  return lastFrame != null && now - lastFrame.at < 500 && lastFrame.mediaTime >= time;
}
