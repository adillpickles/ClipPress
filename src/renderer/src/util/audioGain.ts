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
