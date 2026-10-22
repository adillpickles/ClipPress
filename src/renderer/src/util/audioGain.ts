/**
 * Audio gain limits and the two predicates that read them.
 *
 * Split out of `streams.ts` so the size-limited encoder arguments can be assembled
 * without pulling in the renderer's stream/DOM types; `streams.ts` re-exports them, so
 * existing imports are unaffected.
 */

export const defaultAudioGainDb = 0;
export const minAudioGainDb = -50;
export const maxAudioGainDb = 50;

/** Close enough to 0 dB that applying a filter would only cost a re-encode. */
export const isNeutralAudioGain = (audioGainDb: number | undefined) => audioGainDb == null || Math.abs(audioGainDb) < 0.01;

/** At or below the minimum, the user means silence rather than "very quiet". */
export const isMutedAudioGain = (audioGainDb: number | undefined) => audioGainDb != null && audioGainDb <= minAudioGainDb;

/** A clip's own volume, on top of each track's. Stored in dB so it adds to the track volume. */
export interface ClipVolume {
  audioGainDb?: number | undefined,
  audioMuted?: boolean | undefined,
}

/** The clip volume slider runs from silence to twice as loud (+6 dB), like Clipchamp's. */
export const maxClipVolumePercent = 200;

export const percentToDb = (percent: number) => Math.round(2000 * Math.log10(percent / 100)) / 100;
export const dbToPercent = (audioGainDb: number) => Math.round(100 * 10 ** (audioGainDb / 20));

export const isClipVolumeChanged = (clip: ClipVolume) => clip.audioMuted === true || !isNeutralAudioGain(clip.audioGainDb);

/** Saved projects may carry anything; keep a usable value instead of rejecting the project. */
export function sanitizeClipGainDb(audioGainDb: unknown) {
  if (typeof audioGainDb !== 'number' || !Number.isFinite(audioGainDb) || isNeutralAudioGain(audioGainDb)) return undefined;
  return Math.min(Math.max(audioGainDb, minAudioGainDb), maxAudioGainDb);
}

/**
 * The gain a track gets inside a clip: the two volumes add up in dB, and either one muted means silence
 * (worked out from the flags, not from the sum, so a boost can't un-mute a muted track).
 */
export function combineAudioGain(trackGainDb: number | undefined, clip: ClipVolume | undefined) {
  const track = trackGainDb ?? defaultAudioGainDb;
  if (isMutedAudioGain(track) || clip?.audioMuted === true) return minAudioGainDb;
  return Math.max(minAudioGainDb, track + (clip?.audioGainDb ?? 0));
}

export const getVolumeFilter = (audioGainDb: number) => (isMutedAudioGain(audioGainDb) ? 'volume=0' : `volume=${audioGainDb.toFixed(2)}dB`);
