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
      try {
        await renderAudioPeaks({ filePath, streamIndex, duration, signal: abortController.signal, onPeaks: setPeaks });
        // For measuring how fast a recording opens (read by tests; costs nothing).
        if (!abortController.signal.aborted) performance.mark('clippress:waveform-done');
      } catch (err) {
        if (!isAbortedError(err) && !abortController.signal.aborted) console.warn('Audio waveform failed', err);
      } finally {
        if (!abortController.signal.aborted) setDone(true);
      }
    })();
    return () => {
      abortController.abort();
      setPeaks(undefined);
      setDone(false);
    };
  }, [duration, enabled, filePath, streamIndex]);

  return { peaks, done };
}
