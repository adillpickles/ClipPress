import { useEffect, useState } from 'react';
import pMap from 'p-map';

import { renderFilmstripChunk } from '../ffmpeg';
import { getFilmstripChunks, getFilmstripInterval } from '../filmstrip';
import type { FilmstripFrame } from '../filmstrip';
import type { FfmpegHwAccel } from '../../../common/types';
import { getHwaccelArgs } from '../../../common/util';
import { isAbortedError } from '../util';

/**
 * Frames for the timeline filmstrip of the open recording. Made once when it opens (stretches in parallel,
 * shown as they arrive) and freed when it closes; nothing outlives the recording.
 */
export default function useFilmstrip({ filePath, duration, enabled, ffmpegHwaccel, timeOffset }: {
  filePath: string | undefined,
  duration: number | undefined,
  enabled: boolean,
  ffmpegHwaccel: FfmpegHwAccel,
  /** The recording's start time, subtracted from FFmpeg's timestamps (the player starts at 0). */
  timeOffset: number,
}) {
  const [frames, setFrames] = useState<FilmstripFrame[]>([]);

  useEffect(() => {
    if (!enabled || filePath == null || duration == null || !(duration > 0)) return undefined;

    const abortController = new AbortController();
    const urls: string[] = [];
    const interval = getFilmstripInterval(duration);
    // Hardware decoding makes this several times faster; FFmpeg falls back to software if it can't.
    const hwaccelArgs = getHwaccelArgs(ffmpegHwaccel !== 'none' ? ffmpegHwaccel : 'auto');

    (async () => {
      try {
        await pMap(getFilmstripChunks(duration), async ({ from, length }) => {
          const chunk = await renderFilmstripChunk({ filePath, from, length, interval, hwaccelArgs, timeOffset, signal: abortController.signal });
          if (abortController.signal.aborted) {
            chunk.forEach((frame) => URL.revokeObjectURL(frame.url));
            return;
          }
          urls.push(...chunk.map((frame) => frame.url));
          setFrames((existing) => [...existing, ...chunk].sort((a, b) => a.time - b.time));
        }, { concurrency: 2 });
      } catch (err) {
        if (!isAbortedError(err) && !abortController.signal.aborted) console.warn('Filmstrip failed', err);
      }
    })();

    return () => {
      abortController.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      setFrames([]);
    };
  }, [duration, enabled, ffmpegHwaccel, filePath, timeOffset]);

  return frames;
}
