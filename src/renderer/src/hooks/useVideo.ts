import type { ReactEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChromiumHTMLVideoElement, PlaybackMode } from '../types';
import { showPlaybackFailedMessage } from '../swal';
import { createSeekQueue } from '../seekQueue';
import { getVideoPlaybackRate, stepUserPlaybackRate } from '../previewPlaybackRate';

export default ({ filePath }: { filePath: string | undefined }) => {
  const [commandedTime, setCommandedTimeRaw] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [outputPlaybackRate, setOutputPlaybackRateState] = useState(1);
  const [playerTime, setPlayerTime] = useState<number>();
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>();
  const playbackModeRef = useRef<PlaybackMode>();

  const setPlaybackMode = useCallback((mode: PlaybackMode | undefined) => {
    playbackModeRef.current = mode;
    setPlaybackModeState(mode);
  }, []);

  const videoRef = useRef<ChromiumHTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const segmentPreviewSpeedRef = useRef(1);
  const outputPlaybackRateRef = useRef(1);
  // J and L's own factor, kept apart: worked back out of a rate that was capped at 16×, it would come out wrong.
  const userPlaybackRateRef = useRef(1);

  const applyPlaybackRate = useCallback(() => {
    const rate = getVideoPlaybackRate({ userRate: userPlaybackRateRef.current, speeds: outputPlaybackRateRef.current * segmentPreviewSpeedRef.current });
    const video = videoRef.current;
    // Set only when it changes: this runs for every frame of a sped-up preview.
    if (video != null && video.playbackRate !== rate) {
      video.playbackRate = rate;
      video.preservesPitch = true;
    }
    setPlaybackRateState(rate);
  }, []);

  const setSegmentPreviewSpeed = useCallback((speed: number) => {
    segmentPreviewSpeedRef.current = speed;
    applyPlaybackRate();
  }, [applyPlaybackRate]);

  /** J (direction < 0) and L (> 0): their own factor, a step slower or faster. */
  const changeUserPlaybackRate = useCallback((direction: number, multiplier?: number) => {
    userPlaybackRateRef.current = stepUserPlaybackRate({ userRate: userPlaybackRateRef.current, direction, multiplier });
    applyPlaybackRate();
  }, [applyPlaybackRate]);

  /** Back to the speeds alone, without J and L's. */
  const resetPlaybackRate = useCallback(() => {
    userPlaybackRateRef.current = 1;
    applyPlaybackRate();
  }, [applyPlaybackRate]);

  /** Without touching the video (a file closing): the next rate set reads it. */
  const setOutputPlaybackRateQuietly = useCallback((rate: number) => {
    outputPlaybackRateRef.current = rate;
    setOutputPlaybackRateState(rate);
  }, []);

  const setOutputPlaybackRate = useCallback((rate: number) => {
    setOutputPlaybackRateState(rate);
    outputPlaybackRateRef.current = rate;
    // As before: a new whole-export speed starts without J and L's.
    userPlaybackRateRef.current = 1;
    applyPlaybackRate();
  }, [applyPlaybackRate]);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  // Coalesces seeks while scrubbing; see seekQueue.ts.
  const seekQueue = useMemo(() => createSeekQueue({
    seek: (time) => {
      if (videoRef.current != null) videoRef.current.currentTime = time;
    },
  }), []);

  useEffect(() => () => seekQueue.reset(), [filePath, seekQueue]);

  const smoothSeek = useCallback((seekTo: number) => seekQueue.request(seekTo), [seekQueue]);

  const onSeeked = useCallback<ReactEventHandler<HTMLVideoElement>>(() => seekQueue.landed(), [seekQueue]);

  const commandedTimeRef = useRef(commandedTime);

  const setCommandedTime = useCallback((t: number) => {
    commandedTimeRef.current = t;
    setCommandedTimeRaw(t);
  }, []);

  const seekAbs = useCallback((val: number | undefined) => {
    if (filePath == null) return;
    const video = videoRef.current;
    if (video == null || val == null || Number.isNaN(val)) return;
    let outVal = val;
    if (outVal < 0) outVal = 0;
    if (outVal > video.duration) outVal = video.duration;

    smoothSeek(outVal);
    setCommandedTime(outVal);
  }, [filePath, setCommandedTime, smoothSeek]);

  // Relevant time is the player's playback position if we're currently playing - if not, it's the user's commanded time.
  const relevantTime = useMemo(() => (playing ? playerTime : commandedTime) || 0, [commandedTime, playerTime, playing]);
  // The reason why we also have a getter is because it can be used when we need to get the time, but don't want to re-render for every time update (which can be heavy!)
  const getRelevantTime = useCallback(() => (playingRef.current ? videoRef.current?.currentTime : commandedTimeRef.current) || 0, []);

  const seekRel = useCallback((val: number) => {
    seekAbs(getRelevantTime() + val);
  }, [getRelevantTime, seekAbs]);

  const onPlayingChange = useCallback((val: boolean) => {
    playingRef.current = val;
    setPlaying(val);
    // Timeupdates are only kept while playing, so start from where the video is.
    if (val && videoRef.current) setPlayerTime(videoRef.current.currentTime);
    if (!val && videoRef.current) {
      // A seek still on its way (e.g. playback paused for a scrub) is where the user asked to be.
      setCommandedTime(seekQueue.latestTarget() ?? videoRef.current.currentTime);
    }
  }, [seekQueue, setCommandedTime]);

  const onStopPlaying = useCallback(() => {
    onPlayingChange(false);
  }, [onPlayingChange]);

  const onVideoAbort = useCallback(() => {
    playingRef.current = false;
    setPlaying(false); // we want to preserve current time https://github.com/mifi/lossless-cut/issues/1674#issuecomment-1658937716
    setPlaybackMode(undefined);
  }, [setPlaybackMode]);

  const onStartPlaying = useCallback(() => onPlayingChange(true), [onPlayingChange]);

  const pause = useCallback(() => {
    if (!filePath || !playingRef.current) return;
    videoRef.current?.pause();
  }, [filePath, playingRef, videoRef]);

  const play = useCallback((withoutUserRate?: boolean) => {
    if (!filePath || playingRef.current) return;

    const video = videoRef.current;

    // This was added to re-sync time if file gets reloaded #1674 - but I had to remove this because it broke loop-selected-segments https://github.com/mifi/lossless-cut/discussions/1785#discussioncomment-7852134
    // if (Math.abs(commandedTimeRef.current - video.currentTime) > 1) video.currentTime = commandedTimeRef.current;

    if (withoutUserRate) resetPlaybackRate();
    video?.play().catch((err) => {
      if (err instanceof Error && err.name === 'AbortError' && 'code' in err && err.code === 20) { // Probably "DOMException: The play() request was interrupted by a call to pause()."
        console.error(err);
      } else {
        showPlaybackFailedMessage();
      }
    });
  }, [filePath, playingRef, resetPlaybackRate, videoRef]);


  return {
    videoRef,
    videoContainerRef,
    playbackRate,
    changeUserPlaybackRate,
    resetPlaybackRate,
    setSegmentPreviewSpeed,
    outputPlaybackRate,
    setOutputPlaybackRate,
    commandedTime,
    setCommandedTime,
    commandedTimeRef,
    playing,
    setPlaying,
    playingRef,
    onStopPlaying,
    onStartPlaying,
    onSeeked,
    seekAbs,
    seekRel,
    play,
    pause,
    relevantTime,
    getRelevantTime,
    onVideoAbort,
    setOutputPlaybackRateState: setOutputPlaybackRateQuietly,
    playbackMode,
    setPlaybackMode,
    playbackModeRef,
    playerTime,
    setPlayerTime,
  };
};
