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

/** J and L's factor in a rate the video is asked to play at, given the speeds it plays on top of. */
export function getUserPlaybackRate({ rate, speeds }: { rate: number, speeds: number }) {
  return Math.min(maxUserPlaybackRate, Math.max(minVideoPlaybackRate, rate / speeds));
}
