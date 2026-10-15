import type { RefObject } from 'react';
import { useEffect } from 'react';

import { isMutedAudioGain, isNeutralAudioGain } from '../util/audioGain';

export function getPreviewGainFactor(audioGainDb: number | undefined) {
  if (isNeutralAudioGain(audioGainDb)) return 1;
  if (isMutedAudioGain(audioGainDb)) return 0;
  return 10 ** (audioGainDb! / 20);
}

// An element can only ever be wired into one Web Audio graph, so remember it per element.
const graphs = new WeakMap<HTMLMediaElement, { context: AudioContext, gain: GainNode }>();

/**
 * Plays the export's audio gain through the native video player.
 *
 * Applying gain used to switch the preview to the FFmpeg-assisted player, which re-encodes the
 * picture live at 800 px / 30 fps and periodically jumps back to resync. A Web Audio gain node
 * changes only the sound, so the picture stays full quality. The graph is created on the first
 * real gain change and kept afterwards; at 0 dB it simply passes audio through.
 */
export default function usePreviewAudioGain(videoRef: RefObject<HTMLVideoElement | null>, audioGainDb: number | undefined, filePath: string | undefined) {
  const factor = getPreviewGainFactor(audioGainDb);

  useEffect(() => {
    const video = videoRef.current;
    if (video == null) return undefined;

    let graph = graphs.get(video);
    if (graph == null) {
      if (factor === 1) return undefined;
      const context = new AudioContext();
      const gain = context.createGain();
      context.createMediaElementSource(video).connect(gain).connect(context.destination);
      graph = { context, gain };
      graphs.set(video, graph);
    }

    graph.gain.gain.value = factor;

    // Contexts created before a user gesture start suspended; playback is a gesture.
    const { context } = graph;
    const resume = () => { if (context.state === 'suspended') context.resume().catch(() => undefined); };
    resume();
    video.addEventListener('play', resume);
    return () => video.removeEventListener('play', resume);
    // filePath: re-run when a newly opened file (and its saved gain) arrives.
  }, [factor, filePath, videoRef]);
}
