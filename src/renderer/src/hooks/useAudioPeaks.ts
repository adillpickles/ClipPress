import { useEffect, useState } from 'react';

import { renderAudioPeaks } from '../ffmpeg';
import type { AudioPeaks } from '../audioPeaks';
import { isAbortedError } from '../util';

/**
 * The waveform for the audio track of the open recording; made when it opens (shown as it fills in), dropped when
 * it closes. `done` once it's complete or couldn't be made.
 */
export default function useAudioPeaks({ filePath, streamIndex, duration, enabled }: {
  filePath: string | undefined,
  streamIndex: number | undefined,
  duration: number | undefined,
  enabled: boolean,
}) {
  const [peaks, setPeaks] = useState<AudioPeaks>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled || filePath == null || duration == null || !(duration > 0)) return undefined;
    const abortController = new AbortController();
    (async () => {
      // The app's Abort button (of an export, say) stops every FFmpeg, this one too: then it's made again rather
      // than left half drawn (a few times at most).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await renderAudioPeaks({ filePath, streamIndex, duration, signal: abortController.signal, onPeaks: setPeaks });
          // For measuring how fast a recording opens (read by tests; costs nothing).
          if (!abortController.signal.aborted) performance.mark('clippress:waveform-done');
          break;
        } catch (err) {
          if (abortController.signal.aborted) break;
          if (!isAbortedError(err)) {
            console.warn('Audio waveform failed', err);
            break;
          }
        }
      }
      if (!abortController.signal.aborted) setDone(true);
    })();
    return () => {
      abortController.abort();
      setPeaks(undefined);
      setDone(false);
    };
  }, [duration, enabled, filePath, streamIndex]);

  return { peaks, done };
}
