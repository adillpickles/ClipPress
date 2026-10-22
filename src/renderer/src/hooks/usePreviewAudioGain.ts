import type { RefObject } from 'react';
import { useEffect } from 'react';

import { isMutedAudioGain, isNeutralAudioGain } from '../util/audioGain';

export function getPreviewGainFactor(audioGainDb: number | undefined) {
  if (isNeutralAudioGain(audioGainDb)) return 1;
  if (isMutedAudioGain(audioGainDb)) return 0;
  return 10 ** (audioGainDb! / 20);
}

/** A stretch of the recording (a clip) that plays at its own volume. */
export interface PreviewClipVolume {
  start: number,
  end: number,
  factor: number,
}

const noClipVolumes: PreviewClipVolume[] = [];

/** Short enough to land on the clip boundary, long enough not to click. */
const rampSeconds = 0.004;

export const getClipVolumeFactorAt = (clipVolumes: PreviewClipVolume[], time: number) => clipVolumes.find((clip) => time >= clip.start && time < clip.end)?.factor ?? 1;

// An element can only ever be wired into one Web Audio graph, so remember it per element.
const graphs = new WeakMap<HTMLMediaElement, { context: AudioContext, gain: GainNode }>();

/**
 * Plays the export's volume through the native video player: the track volume, times the volume of the clip
 * under the playhead.
 *
 * Applying gain used to switch the preview to the FFmpeg-assisted player, which re-encodes the
 * picture live at 800 px / 30 fps and periodically jumps back to resync. A Web Audio gain node
 * changes only the sound, so the picture stays full quality. The graph is created on the first
 * real gain change and kept afterwards; at 0 dB it simply passes audio through. While playing with clip
 * volumes, the gain follows the playhead every frame and glides over a few milliseconds at clip boundaries.
 */
export default function usePreviewAudioGain(videoRef: RefObject<HTMLVideoElement | null>, audioGainDb: number | undefined, filePath: string | undefined, clipVolumes = noClipVolumes) {
  const trackFactor = getPreviewGainFactor(audioGainDb);

  useEffect(() => {
    const video = videoRef.current;
    if (video == null) return undefined;

    let graph = graphs.get(video);
    if (graph == null) {
      if (trackFactor === 1 && clipVolumes.length === 0) return undefined;
      const context = new AudioContext();
      const gain = context.createGain();
      context.createMediaElementSource(video).connect(gain).connect(context.destination);
      graph = { context, gain };
      graphs.set(video, graph);
    }

    const { context, gain } = graph;
    let applied: number | undefined;
    const apply = () => {
      const target = trackFactor * getClipVolumeFactorAt(clipVolumes, video.currentTime);
      if (target === applied) return;
      applied = target;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(target, context.currentTime, rampSeconds);
    };
    apply();

    // Contexts created before a user gesture start suspended; playback is a gesture.
    const resume = () => { if (context.state === 'suspended') context.resume().catch(() => undefined); };
    resume();

    // Only clip volumes change along the way; a lone track volume needs no loop.
    let frame = 0;
    const follow = () => {
      apply();
      frame = requestAnimationFrame(follow);
    };
    const onPlay = () => {
      resume();
      apply();
      cancelAnimationFrame(frame);
      if (clipVolumes.length > 0) frame = requestAnimationFrame(follow);
    };
    const onPause = () => {
      cancelAnimationFrame(frame);
      apply();
    };
    if (!video.paused) onPlay();
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', apply);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', apply);
    };
    // filePath: re-run when a newly opened file (and its saved gain) arrives.
  }, [clipVolumes, filePath, trackFactor, videoRef]);
}
