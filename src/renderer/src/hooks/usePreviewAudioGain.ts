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

// One context for the app: each one holds a real-time audio thread, and a <video> is made per opened file.
let sharedContext: AudioContext | undefined;
const getContext = () => {
  sharedContext ??= new AudioContext();
  return sharedContext;
};

// An element can only ever be wired into one Web Audio graph, so remember it per element.
const graphs = new WeakMap<HTMLMediaElement, { source: MediaElementAudioSourceNode, gain: GainNode }>();

/** Lets a removed <video> (and its source node) be freed. */
function releaseGraph(video: HTMLMediaElement) {
  const graph = graphs.get(video);
  if (graph == null) return;
  graph.source.disconnect();
  graph.gain.disconnect();
  graphs.delete(video);
}

/**
 * Plays the export's volume through the native video player: the track volume, times the volume of the clip
 * under the playhead.
 *
 * Applying gain used to switch the preview to the FFmpeg-assisted player, which re-encodes the
 * picture live at 800 px / 30 fps and periodically jumps back to resync. A Web Audio gain node
 * changes only the sound, so the picture stays full quality. The graph is created on the first
 * real gain change and kept afterwards; at 0 dB it simply passes audio through. While playing with clip
 * volumes, the gain follows the playhead every frame (and on `timeupdate` when no frames are drawn, e.g. in a
 * hidden window) and glides over a few milliseconds at clip boundaries.
 */
export default function usePreviewAudioGain(videoRef: RefObject<HTMLVideoElement | null>, audioGainDb: number | undefined, filePath: string | undefined, clipVolumes = noClipVolumes) {
  const trackFactor = getPreviewGainFactor(audioGainDb);

  useEffect(() => {
    const video = videoRef.current;
    if (video == null) return undefined;

    let graph = graphs.get(video);
    if (graph == null) {
      if (trackFactor === 1 && clipVolumes.length === 0) return undefined;
      const context = getContext();
      const source = context.createMediaElementSource(video);
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);
      graph = { source, gain };
      graphs.set(video, graph);
    }

    const { gain } = graph;
    const context = getContext();
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
    const follows = clipVolumes.length > 0;
    let frame = 0;
    const follow = () => {
      apply();
      frame = requestAnimationFrame(follow);
    };
    const onPlay = () => {
      resume();
      apply();
      cancelAnimationFrame(frame);
      if (follows) frame = requestAnimationFrame(follow);
    };
    const onPause = () => {
      cancelAnimationFrame(frame);
      apply();
    };
    if (!video.paused) onPlay();
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', apply);
    if (follows) video.addEventListener('timeupdate', apply);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', apply);
      video.removeEventListener('timeupdate', apply);
      // Effects clean up after the DOM changed: a <video> that has gone (file closed) lets go of its graph.
      if (!video.isConnected) releaseGraph(video);
    };
    // filePath: re-run when a newly opened file (and its saved gain) arrives.
  }, [clipVolumes, filePath, trackFactor, videoRef]);
}
