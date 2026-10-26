import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { streamFilmstripFrames } from '../ffmpeg';
import { getFilmstripFrameHeight } from '../filmstrip';
import type { FilmstripView } from '../filmstrip';
import FilmstripSession from '../filmstripSession';
import type { FilmstripSnapshot } from '../filmstripSession';
import type { CachedStrip } from '../timelineCache';
import { loadStripFromDisk, saveStrip, stripMemory } from '../timelineCacheIo';

export interface Filmstrip extends FilmstripSnapshot {
  /** The timeline tells what it shows: stretches in view are made first, and zoomed in, denser frames. */
  setView: (view: FilmstripView) => void,
}

const empty: FilmstripSnapshot = { frames: [], covered: [], aspect: undefined, done: false };

/**
 * Frames for the timeline filmstrip of the open recording (FilmstripSession): they show up as they're made,
 * at most once per display frame. A complete strip goes to the timeline cache, so the recording shows it at once
 * the next time it opens; denser frames for zooming in are freed when it closes.
 */
export default function useFilmstrip({ filePath, duration, enabled, timeOffset, cacheKey, aspect }: {
  filePath: string | undefined,
  duration: number | undefined,
  enabled: boolean,
  /** The recording's start time, subtracted from FFmpeg's timestamps (the player starts at 0). */
  timeOffset: number,
  /** The recording as it is now (getTimelineCacheKey), once its size and time are known. */
  cacheKey: string | undefined,
  /** The video's displayed width / height, from probing it: the tiles have their shape before any frame comes. */
  aspect: number | undefined,
}): Filmstrip {
  const owner = enabled && filePath != null && duration != null && duration > 0 ? `${filePath}|${duration}|${timeOffset}|${cacheKey}` : undefined;
  // Whose strip it is: until the new recording's session has shown something, the last one's isn't shown.
  const [state, setState] = useState<{ owner: string | undefined, snapshot: FilmstripSnapshot }>({ owner: undefined, snapshot: empty });
  const sessionRef = useRef<FilmstripSession>();
  // What the timeline last said it shows, and for which recording: a view of the last one would plan the new one's
  // coarse pass for the wrong tiles.
  const viewRef = useRef<{ view: FilmstripView, owner: string | undefined }>();
  const ownerRef = useRef(owner);
  // Before the timeline's effects say what it shows for the new recording (layout effects run first).
  useLayoutEffect(() => {
    ownerRef.current = owner;
  }, [owner]);
  // Frames dropped from the strip, revoked once the timeline has re-rendered without them.
  const retiredRef = useRef<string[]>([]);

  useEffect(() => {
    if (owner == null || filePath == null || duration == null) return undefined;

    const frameHeight = getFilmstripFrameHeight(window.devicePixelRatio || 1);
    const stripKey = cacheKey != null ? `${cacheKey}|${frameHeight}` : undefined;
    let frame = 0;
    let markedFirst = false;
    let markedDone = false;
    let disposed = false;
    let inUse = false;
    let session: FilmstripSession | undefined;

    const show = () => {
      if (session == null) return;
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
      setState({ owner, snapshot: next });
    };

    const begin = (cached: CachedStrip | undefined) => {
      if (disposed) return;
      if (cached != null && stripKey != null) {
        stripMemory.acquire(stripKey);
        inUse = true;
      }
      session = new FilmstripSession({
        filePath,
        duration,
        timeOffset,
        frameHeight,
        aspect,
        cached,
        viewWaitMs: 80,
        run: streamFilmstripFrames,
        revoke: (url) => URL.revokeObjectURL(url),
        onChange: () => {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            show();
          });
        },
        onComplete: stripKey != null ? (strip) => {
          // In use from now on (the cache owns its frames), so it isn't evicted while it's on screen.
          stripMemory.acquire(stripKey);
          inUse = true;
          saveStrip(stripKey, strip);
        } : undefined,
      });
      sessionRef.current = session;
      if (viewRef.current != null && viewRef.current.owner === owner) session.setView(viewRef.current.view);
      session.start();
      // From the cache: shown with this render rather than the next display frame.
      if (session.done) show();
    };

    const inMemory = stripKey != null ? stripMemory.get(stripKey) : undefined;
    if (stripKey == null || inMemory != null) begin(inMemory);
    else loadStripFromDisk(stripKey).catch(() => undefined).then(begin);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sessionRef.current = undefined;
      session?.dispose();
      if (inUse && stripKey != null) stripMemory.release(stripKey);
      retiredRef.current.forEach((url) => URL.revokeObjectURL(url));
      retiredRef.current = [];
    };
  }, [aspect, cacheKey, duration, filePath, owner, timeOffset]);

  const snapshot = state.owner === owner && owner != null ? state.snapshot : empty;
  useEffect(() => {
    const retired = retiredRef.current;
    retiredRef.current = [];
    retired.forEach((url) => URL.revokeObjectURL(url));
  }, [snapshot]);

  const setView = useCallback((view: FilmstripView) => {
    viewRef.current = { view, owner: ownerRef.current };
    sessionRef.current?.setView(view);
  }, []);

  return useMemo(() => ({ ...snapshot, aspect: snapshot.aspect ?? aspect, setView }), [aspect, setView, snapshot]);
}
