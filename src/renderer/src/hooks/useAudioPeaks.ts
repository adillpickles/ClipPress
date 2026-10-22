import { useEffect, useState } from 'react';

import { renderAudioPeaks } from '../ffmpeg';
import type { AudioPeaks } from '../audioPeaks';
import { isAbortedError } from '../util';

/** The waveform for the audio track of the open recording; made once when it opens, dropped when it closes. */
export default function useAudioPeaks({ filePath, streamIndex, duration, enabled }: {
  filePath: string | undefined,
  streamIndex: number | undefined,
  duration: number | undefined,
  enabled: boolean,
}) {
  const [peaks, setPeaks] = useState<AudioPeaks>();

  useEffect(() => {
    if (!enabled || filePath == null || duration == null || !(duration > 0)) return undefined;
    const abortController = new AbortController();
    (async () => {
      try {
        const result = await renderAudioPeaks({ filePath, streamIndex, duration, signal: abortController.signal });
        if (!abortController.signal.aborted) setPeaks(result);
      } catch (err) {
        if (!isAbortedError(err) && !abortController.signal.aborted) console.warn('Audio waveform failed', err);
      }
    })();
    return () => {
      abortController.abort();
      setPeaks(undefined);
    };
  }, [duration, enabled, filePath, streamIndex]);

  return peaks;
}
