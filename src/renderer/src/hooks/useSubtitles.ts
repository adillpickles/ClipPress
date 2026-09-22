import { useCallback, useEffect, useRef, useState } from 'react';
import { extractSubtitleTrackVtt } from '../ffmpeg';
import type { FFprobeStream } from '../../../common/ffprobe';


export default () => {
  const [subtitlesByStreamId, setSubtitlesState] = useState<Record<string, { url: string, lang?: string }>>({});
  const generation = useRef(0);
  const urls = useRef(new Set<string>());
  const setSubtitlesByStreamId = useCallback<typeof setSubtitlesState>((value) => {
    generation.current += 1;
    setSubtitlesState(value);
  }, []);

  useEffect(() => () => {
    generation.current += 1;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
  }, []);

  const loadSubtitle = useCallback(async ({ filePath, index, subtitleStream }: { filePath: string, index: number, subtitleStream: FFprobeStream }) => {
    const requestGeneration = generation.current;
    const url = await extractSubtitleTrackVtt(filePath, index);
    if (requestGeneration !== generation.current) {
      URL.revokeObjectURL(url);
      return;
    }
    urls.current.add(url);
    setSubtitlesState((old) => ({ ...old, [index]: { url, lang: subtitleStream.tags && subtitleStream.tags.language } }));
  }, []);

  // Cleanup removed subtitles
  const subtitlesByStreamIdRef = useRef<typeof subtitlesByStreamId>({});
  useEffect(() => {
    Object.values(subtitlesByStreamIdRef.current).forEach(({ url, lang }) => {
      if (!Object.values(subtitlesByStreamId).some((existingSubtitle) => existingSubtitle.url === url)) {
        console.log('Cleanup subtitle', lang);
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }
    });
    subtitlesByStreamIdRef.current = subtitlesByStreamId;
  }, [subtitlesByStreamId]);

  return {
    loadSubtitle,
    subtitlesByStreamId,
    setSubtitlesByStreamId,
  };
};
