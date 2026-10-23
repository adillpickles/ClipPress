import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import sortBy from 'lodash/sortBy';
import useDebounceOld from 'react-use/lib/useDebounce'; // Want to phase out this
import { useTranslation } from 'react-i18next';

import type { Frame } from '../ffmpeg';
import { readFramesAroundTime, findNearestKeyFrameTime as ffmpegFindNearestKeyFrameTime, readFrames } from '../ffmpeg';
import type { FFprobeStream } from '../../../common/ffprobe';
import { getFrameCountRaw } from '../edlFormats';
import type { HandleError } from '../contexts';


const toObj = (map: Frame[]) => Object.fromEntries(map.map((frame) => [frame.time, frame]));

function useKeyframes({ keyframesEnabled, filePath, commandedTime, videoStream, detectedFps, ffmpegExtractWindow, maxKeyframes, currentCutSegOrWholeTimeline, setWorking, setMaxKeyframes, handleError }: {
  keyframesEnabled: boolean,
  filePath: string | undefined,
  commandedTime: number,
  videoStream: FFprobeStream | undefined,
  detectedFps: number | undefined,
  ffmpegExtractWindow: number,
  maxKeyframes: number,
  currentCutSegOrWholeTimeline: { start: number, end: number },
  setWorking: (w: { text: string, abortController?: AbortController } | undefined) => void,
  setMaxKeyframes: (max: number) => void,
  handleError: HandleError,
}) {
  const { t } = useTranslation();

  const readingKeyframesPromise = useRef<Promise<unknown>>();
  const [neighbouringKeyFramesMap, setNeighbouringKeyFrames] = useState<Record<string, Frame>>({});

  const neighbouringKeyFrames = useMemo(() => Object.values(neighbouringKeyFramesMap), [neighbouringKeyFramesMap]);

  const keyframeByNumber = useMemo(() => {
    const map: Record<number, Frame> = {};
    if (detectedFps != null) {
      neighbouringKeyFrames.forEach((frame) => {
        map[getFrameCountRaw(detectedFps, frame.time)!] = frame;
      });
    }
    return map;
  }, [detectedFps, neighbouringKeyFrames]);

  const findNearestKeyFrameTime = useCallback(({ time, direction }: { time: number, direction: number }) => ffmpegFindNearestKeyFrameTime({ frames: neighbouringKeyFrames, time, direction, fps: detectedFps }), [neighbouringKeyFrames, detectedFps]);

  // Stretches already read: seeking around inside them needs no new ffprobe run (each one takes ~150 ms).
  const coveredRef = useRef<{ from: number, to: number }[]>([]);
  useEffect(() => {
    coveredRef.current = [];
    setNeighbouringKeyFrames({});
  }, [filePath, videoStream]);

  useDebounceOld(() => {
    let aborted = false;

    (async () => {
      // See getIntervalAroundTime
      // We still want to calculate keyframes even if not shouldShowKeyframes because maybe we want to be able to step to the closest keyframe
      const shouldRun = keyframesEnabled && filePath != null && videoStream && commandedTime != null && !readingKeyframesPromise.current;
      if (!shouldRun) return;
      // Most of the window already read: skip (keyframes are at most a few seconds apart).
      const wantFrom = Math.max(commandedTime - ffmpegExtractWindow / 4, 0);
      const wantTo = commandedTime + ffmpegExtractWindow / 4;
      if (coveredRef.current.some(({ from, to }) => from <= wantFrom && to >= wantTo)) return;

      try {
        const promise = readFramesAroundTime({ filePath, aroundTime: commandedTime, streamIndex: videoStream.index, window: ffmpegExtractWindow });
        readingKeyframesPromise.current = promise;
        const newFrames = await promise;
        if (aborted) return;
        const newKeyFrames = newFrames.filter((frame) => frame.keyframe);
        const interval = { from: Math.max(commandedTime - ffmpegExtractWindow / 2, 0), to: commandedTime + ffmpegExtractWindow / 2 };
        coveredRef.current.push(interval);
        // console.log(newFrames);
        setNeighbouringKeyFrames((existingKeyFramesMap) => {
          // Nothing new: keep the same object, so nothing that uses it re-renders.
          if (newKeyFrames.every((frame) => existingKeyFramesMap[frame.time] != null)) return existingKeyFramesMap;
          let existingFrames = Object.values(existingKeyFramesMap);
          if (existingFrames.length >= maxKeyframes) {
            existingFrames = sortBy(existingFrames, 'createdAt').slice(newKeyFrames.length);
            // Older keyframes were dropped, so only this stretch is known to be complete now.
            coveredRef.current = [interval];
          }
          return {
            ...toObj(existingFrames),
            ...toObj(newKeyFrames),
          };
        });
      } catch (err) {
        console.error('Failed to read keyframes', err);
      } finally {
        readingKeyframesPromise.current = undefined;
      }
    })();

    return () => {
      aborted = true;
    };
    // NOTE: you have to manually pass dependencies here, eslint doesn't recognize it
  }, 500, [keyframesEnabled, filePath, commandedTime, videoStream, ffmpegExtractWindow, maxKeyframes]);

  const readAllKeyframes = useCallback(async () => {
    const { start, end } = currentCutSegOrWholeTimeline;

    if (!filePath || !videoStream) return;
    try {
      setWorking({ text: t('Reading all keyframes') });
      const newFrames = await readFrames({ filePath, from: start, to: end, streamIndex: videoStream.index });
      const newKeyFrames = newFrames.filter((frame) => frame.keyframe);
      // These replace what was read before, so only this stretch is known to be read now.
      coveredRef.current = [{ from: start, to: end }];
      setNeighbouringKeyFrames(toObj(newKeyFrames));
      setMaxKeyframes(newKeyFrames.length);
    } catch (err) {
      handleError({ err });
    } finally {
      setWorking(undefined);
    }
  }, [currentCutSegOrWholeTimeline, filePath, handleError, setMaxKeyframes, setWorking, t, videoStream]);


  return {
    neighbouringKeyFrames, findNearestKeyFrameTime, keyframeByNumber, readAllKeyframes,
  };
}

export type FindNearestKeyframeTime = ReturnType<typeof useKeyframes>['findNearestKeyFrameTime'];

export default useKeyframes;
