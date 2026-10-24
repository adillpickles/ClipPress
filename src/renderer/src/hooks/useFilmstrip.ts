import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { streamFilmstripFrames } from '../ffmpeg';
import { getFilmstripFrameHeight } from '../filmstrip';
import type { FilmstripView } from '../filmstrip';
import FilmstripSession from '../filmstripSession';
import type { FilmstripSnapshot } from '../filmstripSession';

export interface Filmstrip extends FilmstripSnapshot {
  /** The timeline tells what it shows: stretches in view are made first, and zoomed in, denser frames. */
  setView: (view: FilmstripView) => void,
}

const empty: FilmstripSnapshot = { frames: [], covered: [], aspect: undefined, done: false };

/**
 * Frames for the timeline filmstrip of the open recording (FilmstripSession): they show up as they're made,
 * at most once per display frame. Everything is freed when the recording closes; nothing outlives it.
 */
export default function useFilmstrip({ filePath, duration, enabled, timeOffset }: {
  filePath: string | undefined,
  duration: number | undefined,
  enabled: boolean,
  /** The recording's start time, subtracted from FFmpeg's timestamps (the player starts at 0). */
  timeOffset: number,
}): Filmstrip {
  const [snapshot, setSnapshot] = useState(empty);
  const sessionRef = useRef<FilmstripSession>();
  const viewRef = useRef<FilmstripView>();
  // Frames dropped from the strip, revoked once the timeline has re-rendered without them.
  const retiredRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled || filePath == null || duration == null || !(duration > 0)) return undefined;

    let frame = 0;
    let markedFirst = false;
    let markedDone = false;
    const session: FilmstripSession = new FilmstripSession({
      filePath,
      duration,
      timeOffset,
      frameHeight: getFilmstripFrameHeight(window.devicePixelRatio || 1),
      run: streamFilmstripFrames,
      revoke: (url) => URL.revokeObjectURL(url),
      onChange: () => {
        if (frame !== 0) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          retiredRef.current.push(...session.takeRetired());
          const next = session.snapshot();
          // For measuring how fast the strip shows up (read by tests; costs nothing).
          if (!markedFirst && next.frames.length > 0) {
            markedFirst = true;
            performance.mark('clippress:filmstrip-first');
          }
          if (!markedDone && next.done) {
            markedDone = true;
            performance.mark('clippress:filmstrip-done');
          }
          setSnapshot(next);
        });
      },
    });
    sessionRef.current = session;
    if (viewRef.current != null) session.setView(viewRef.current);
    session.start();

    return () => {
      cancelAnimationFrame(frame);
      sessionRef.current = undefined;
      session.dispose();
      retiredRef.current.forEach((url) => URL.revokeObjectURL(url));
      retiredRef.current = [];
      setSnapshot(empty);
    };
  }, [duration, enabled, filePath, timeOffset]);

  useEffect(() => {
    const retired = retiredRef.current;
    retiredRef.current = [];
    retired.forEach((url) => URL.revokeObjectURL(url));
  }, [snapshot]);

  const setView = useCallback((view: FilmstripView) => {
    viewRef.current = view;
    sessionRef.current?.setView(view);
  }, []);

  return useMemo(() => ({ ...snapshot, setView }), [setView, snapshot]);
}
