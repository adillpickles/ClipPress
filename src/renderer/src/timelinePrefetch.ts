import { readFileFfprobeMetaCached, renderAudioPeaks, streamFilmstripFrames } from './ffmpeg';
import { getFilmstripFrameHeight, getVideoDisplayAspect } from './filmstrip';
import FilmstripSession from './filmstripSession';
import { isDurationValid } from './segments';
import { getTimelineCacheDir, getTimelineCacheFileName, peaksMemory, savePeaks, saveStrip, stripMemory } from './timelineCacheIo';
import { getAudioStreams, getRealVideoStreams } from './util/streams';
import { readFileStats } from './util';

const { access } = window.require('fs/promises');
const { join } = window.require('path');

const isOnDisk = async (key: string, kind: 'strip' | 'peaks') => {
  try {
    await access(join(getTimelineCacheDir(), getTimelineCacheFileName(key, kind)));
    return true;
  } catch {
    return false;
  }
};

/**
 * Makes the filmstrip and the waveform of a recording that isn't open (the shelf's next clip) into the timeline cache,
 * exactly as opening it would, so it shows them at once when it opens. Stops when `signal` says so.
 */
export default async function prefetchTimeline({ path, cacheKey, signal }: { path: string, cacheKey: string, signal: AbortSignal }) {
  const stripKey = `${cacheKey}|${getFilmstripFrameHeight(window.devicePixelRatio || 1)}`;
  // Kept for when it opens (Next clip), which then skips its own probe.
  const meta = await readFileFfprobeMetaCached(path, await readFileStats(path));
  if (signal.aborted) return;
  const duration = Number.parseFloat(meta.format.duration);
  if (!isDurationValid(duration)) return;
  const start = Number.parseFloat(meta.format.start_time ?? '0');
  const [videoStream] = getRealVideoStreams(meta.streams);
  const [audioStream] = getAudioStreams(meta.streams);
  const peaksKey = audioStream != null ? `${cacheKey}|${audioStream.index}` : undefined;

  const makeStrip = async () => {
    if (videoStream == null || stripMemory.has(stripKey) || await isOnDisk(stripKey, 'strip') || signal.aborted) return;
    await new Promise<void>((resolve) => {
      let finished = false;
      let session: FilmstripSession | undefined;
      const finish = () => {
        if (finished) return;
        finished = true;
        session?.dispose();
        resolve();
      };
      session = new FilmstripSession({
        filePath: path,
        duration,
        timeOffset: Number.isFinite(start) ? start : 0,
        frameHeight: getFilmstripFrameHeight(window.devicePixelRatio || 1),
        aspect: getVideoDisplayAspect(videoStream),
        run: streamFilmstripFrames,
        revoke: (url) => URL.revokeObjectURL(url),
        onChange: () => {
          if (!session?.done) return;
          // Once it has handed the strip to the cache (right after this): its frames are the cache's then, or, if it
          // couldn't be made whole, freed with the session.
          setTimeout(finish, 0);
        },
        onComplete: (strip) => saveStrip(stripKey, strip),
      });
      signal.addEventListener('abort', finish, { once: true });
      session.start();
    });
  };

  const makePeaks = async () => {
    if (peaksKey == null || peaksMemory.has(peaksKey) || await isOnDisk(peaksKey, 'peaks') || signal.aborted) return;
    let last: Parameters<typeof savePeaks>[1] | undefined;
    try {
      await renderAudioPeaks({ filePath: path, streamIndex: audioStream!.index, duration, signal, onPeaks: (peaks) => { last = peaks; } });
    } catch {
      return;
    }
    if (!signal.aborted && last != null) await savePeaks(peaksKey, last);
  };

  await Promise.all([makeStrip(), makePeaks()]);
}
