import { useEffect, useState } from 'react';

import { renderAudioPeaks } from '../ffmpeg';
import type { AudioPeaks } from '../audioPeaks';
import { loadPeaksFromDisk, peaksMemory, savePeaks } from '../timelineCacheIo';
import { isAbortedError } from '../util';

/**
 * The waveform for the audio track of the open recording; made when it opens (shown as it fills in), and kept in the
 * timeline cache once complete, so the recording shows it at once the next time. `done` once it's complete or
 * couldn't be made.
 */
export default function useAudioPeaks({ filePath, streamIndex, duration, enabled, cacheKey }: {
  filePath: string | undefined,
  streamIndex: number | undefined,
  duration: number | undefined,
  enabled: boolean,
  /** The recording as it is now (getTimelineCacheKey), once its size and time are known. */
  cacheKey: string | undefined,
}) {
  const owner = enabled && filePath != null && duration != null && duration > 0 ? `${filePath}|${streamIndex}|${duration}|${cacheKey}` : undefined;
  // Whose waveform it is: the last recording's isn't shown for the new one.
  const [state, setState] = useState<{ owner: string | undefined, peaks: AudioPeaks | undefined, done: boolean }>({ owner: undefined, peaks: undefined, done: false });

  useEffect(() => {
    if (owner == null || filePath == null || duration == null) return undefined;
    const abortController = new AbortController();
    const peaksKey = cacheKey != null ? `${cacheKey}|${streamIndex ?? 'a'}` : undefined;
    const finish = (peaks: AudioPeaks | undefined) => {
      // For measuring how fast a recording opens (read by tests; costs nothing).
      if (peaks != null) performance.mark('clippress:waveform-done');
      setState({ owner, peaks, done: true });
    };
    const inMemory = peaksKey != null ? peaksMemory.get(peaksKey) : undefined;
    if (inMemory != null) {
      finish(inMemory);
      return () => abortController.abort();
    }
    (async () => {
      const fromDisk = peaksKey != null ? await loadPeaksFromDisk(peaksKey).catch(() => undefined) : undefined;
      if (abortController.signal.aborted) return;
      if (fromDisk != null) {
        finish(fromDisk);
        return;
      }
      let last: AudioPeaks | undefined;
      const onPeaks = (peaks: AudioPeaks) => {
        last = peaks;
        setState({ owner, peaks, done: false });
      };
      // The app's Abort button (of an export, say) stops every FFmpeg, this one too: then it's made again rather
      // than left half drawn (a few times at most).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await renderAudioPeaks({ filePath, streamIndex, duration, signal: abortController.signal, onPeaks });
          if (abortController.signal.aborted) return;
          if (peaksKey != null && last != null) savePeaks(peaksKey, last);
          finish(last);
          return;
        } catch (err) {
          if (abortController.signal.aborted) return;
          if (!isAbortedError(err)) {
            console.warn('Audio waveform failed', err);
            break;
          }
        }
      }
      setState({ owner, peaks: last, done: true });
    })();
    return () => abortController.abort();
  }, [cacheKey, duration, filePath, owner, streamIndex]);

  return state.owner === owner && owner != null ? { peaks: state.peaks, done: state.done } : { peaks: undefined, done: false };
}
