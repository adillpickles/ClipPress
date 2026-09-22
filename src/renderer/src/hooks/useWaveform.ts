import { useState, useRef, useEffect, useCallback } from 'react';
import invariant from 'tiny-invariant';

import { renderWaveformPng, safeCreateBlob } from '../ffmpeg';
import type { OverviewWaveform, WaveformSlice } from '../types';
import type { FFprobeStream } from '../../../common/ffprobe';

const maxWaveforms = 100;
const color = '#ffffff';

export default ({ filePath, relevantTime, fileDuration, waveformEnabled, audioStream, ffmpegExtractWindow }: {
  filePath: string | undefined,
  relevantTime: number,
  fileDuration: number | undefined,
  waveformEnabled: boolean,
  audioStream: FFprobeStream | undefined,
  ffmpegExtractWindow: number,
}) => {
  const [waveforms, setWaveforms] = useState<WaveformSlice[]>([]);
  const [overviewWaveform, setOverviewWaveform] = useState<OverviewWaveform>();
  const cache = useRef<WaveformSlice[]>([]);
  const overviewRequest = useRef<AbortController>();
  const streamIndex = audioStream?.index;
  const waveformStartTime = Math.floor(relevantTime / ffmpegExtractWindow) * ffmpegExtractWindow;

  useEffect(() => {
    setWaveforms([]);
    setOverviewWaveform(undefined);
    return () => {
      overviewRequest.current?.abort();
      cache.current.forEach((waveform) => {
        if (waveform.url != null) URL.revokeObjectURL(waveform.url);
      });
      cache.current = [];
    };
  }, [filePath, streamIndex, ffmpegExtractWindow]);

  useEffect(() => {
    if (filePath == null || fileDuration == null || streamIndex == null || !waveformEnabled || ffmpegExtractWindow <= 0) return undefined;
    const controller = new AbortController();

    (async () => {
      const times = [waveformStartTime, waveformStartTime + ffmpegExtractWindow, waveformStartTime - ffmpegExtractWindow]
        .filter((time) => time >= 0 && time < fileDuration);

      for (const time of times) {
        if (controller.signal.aborted) return;
        if (!cache.current.some((waveform) => waveform.from === time)) {
          const duration = Math.min(ffmpegExtractWindow, fileDuration - time);
          const waveform: WaveformSlice = { from: time, to: time + duration, duration, createdAt: new Date() };
          try {
            // eslint-disable-next-line no-await-in-loop
            const { buffer } = await renderWaveformPng({ filePath, start: time, duration, color, streamIndex, timeout: 10000, signal: controller.signal });
            if (controller.signal.aborted) return;
            waveform.url = URL.createObjectURL(safeCreateBlob(buffer, { type: 'image/png' }));
          } catch (error) {
            if (controller.signal.aborted) return;
            console.error('Failed to render waveform', error);
            waveform.failed = true;
          }

          if (cache.current.length >= maxWaveforms) {
            const [removed] = cache.current;
            cache.current = cache.current.slice(1);
            if (removed?.url != null) URL.revokeObjectURL(removed.url);
          }
          cache.current = [...cache.current, waveform];
          setWaveforms(cache.current);
        }
      }
    })();

    return () => controller.abort();
  }, [streamIndex, ffmpegExtractWindow, fileDuration, filePath, waveformEnabled, waveformStartTime]);

  const renderOverviewWaveform = useCallback(async () => {
    invariant(filePath != null && streamIndex != null);
    overviewRequest.current?.abort();
    const controller = new AbortController();
    overviewRequest.current = controller;
    try {
      const { buffer } = await renderWaveformPng({ filePath, color, streamIndex, resample: 10000, signal: controller.signal });
      if (controller.signal.aborted) return;
      setOverviewWaveform({ createdAt: new Date(), url: URL.createObjectURL(safeCreateBlob(buffer, { type: 'image/png' })) });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }, [streamIndex, filePath]);

  useEffect(() => () => {
    if (overviewWaveform?.url != null) URL.revokeObjectURL(overviewWaveform.url);
  }, [overviewWaveform]);

  return { overviewWaveform, waveforms, renderOverviewWaveform };
};
