import { useEffect, useRef, useState } from 'react';

import type { ShelfExport } from '../../../common/types';
import { clipsFolderDepth, findRecorderFolders, listNewestClips } from '../clipsFolder';
import type { RecorderFolder } from '../clipsFolder';
import type { ShelfFile } from '../shelf';

const { watch } = window.require('fs');
const remote = window.require('@electron/remote');

/** How many of the newest clips the start screen lists. */
export const clipsFolderLimit = 5;

/** After a change in the folder: a recorder saving a clip writes for a moment, so wait for it to settle. */
const settleMs = 1500;
/** But not for ever: a recording being written into the folder (OBS) changes it all the time. */
const maxSettleMs = 5000;

/**
 * The clips folder's newest clips while the start screen shows them: listed again when the folder changes (a clip
 * saved while ClipPress is open joins at once) and when the window comes back to the front. Thumbnails come from the
 * app's one store (useThumbnailStore).
 */
export function useClipsFolder({ folder, exports, caseInsensitive, active }: {
  folder: string | undefined,
  exports: readonly ShelfExport[],
  caseInsensitive: boolean,
  /** The start screen is showing: nothing is listed or watched while a recording is open. */
  active: boolean,
}) {
  const [listing, setListing] = useState<{ folder: string, clips: ShelfFile[] }>();
  const [listCount, setListCount] = useState(0);
  // Listings run one at a time, and only the latest asked for runs (the ones before it are outdated). One that
  // finishes always shows, even while the next is asked for: a long listing during a recording (refreshes every 5 s)
  // would otherwise never show. A listing of another folder is never shown for this one (`listing.folder`).
  const listQueueRef = useRef(Promise.resolve());
  const latestListRef = useRef(0);
  // A watch that failed (a drive unplugged) is tried again when the window comes back to the front.
  const [watchAttempt, setWatchAttempt] = useState(0);
  const watchFailedRef = useRef(false);

  useEffect(() => {
    if (folder == null || !active) return;
    latestListRef.current += 1;
    const asked = latestListRef.current;
    listQueueRef.current = listQueueRef.current.then(async () => {
      if (asked !== latestListRef.current) return;
      const clips = await listNewestClips(folder, { limit: clipsFolderLimit, exports, caseInsensitive }).catch((err) => {
        console.warn('Could not list the clips folder', err);
        return [];
      });
      setListing({ folder, clips });
    });
  }, [active, caseInsensitive, exports, folder, listCount]);

  useEffect(() => {
    if (folder == null || !active) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstChangeAt: number | undefined;
    // Hidden (minimized, or behind a full-screen game while OBS records into the folder): nothing to show, so no
    // listing or thumbnails every few seconds; it's listed once when the window shows again.
    let changedWhileHidden = false;
    const listAgain = (_event: string, fileName: string | null) => {
      // Deeper than the listing looks: nothing it shows changed.
      if (fileName != null && fileName.split(/[\\/]/).length > clipsFolderDepth + 1) return;
      const now = Date.now();
      firstChangeAt ??= now;
      clearTimeout(timer);
      timer = setTimeout(() => {
        firstChangeAt = undefined;
        if (document.hidden) {
          changedWhileHidden = true;
          return;
        }
        setListCount((count) => count + 1);
      }, Math.min(settleMs, Math.max(0, firstChangeAt + maxSettleMs - now)));
    };
    let watcher: { close: () => void } | undefined;
    watchFailedRef.current = false;
    try {
      watcher = watch(folder, { recursive: true }, listAgain);
      // A folder that goes away (a drive unplugged) stops the watch; it's tried again when the window is focused.
      (watcher as unknown as { on: (event: string, listener: () => void) => void }).on('error', () => {
        watcher?.close();
        watchFailedRef.current = true;
      });
    } catch (err) {
      console.warn('Could not watch the clips folder', err);
      watchFailedRef.current = true;
    }
    const onFocus = () => {
      setListCount((count) => count + 1);
      if (watchFailedRef.current) setWatchAttempt((attempt) => attempt + 1);
    };
    const onVisibilityChange = () => {
      if (document.hidden || !changedWhileHidden) return;
      changedWhileHidden = false;
      setListCount((count) => count + 1);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(timer);
      watcher?.close();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, folder, watchAttempt]);

  const clips = listing != null && listing.folder === folder ? listing.clips : undefined;
  return { clips };
}

/**
 * The recorder folder to offer on the start screen while no clips folder is linked (and the offer wasn't turned
 * down): looked for once, a moment after the start, so it never slows the first picture.
 */
export function useRecorderFolderOffer({ enabled, exports, caseInsensitive }: {
  enabled: boolean,
  exports: readonly ShelfExport[],
  caseInsensitive: boolean,
}) {
  const [offer, setOffer] = useState<RecorderFolder | null>();
  const exportsRef = useRef(exports);
  useEffect(() => {
    exportsRef.current = exports;
  }, [exports]);
  useEffect(() => {
    if (!enabled || offer !== undefined) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      findRecorderFolders({ videosFolder: remote.app.getPath('videos'), appDataFolder: remote.app.getPath('appData'), exports: exportsRef.current, caseInsensitive })
        .then((folders) => {
          if (!cancelled) setOffer(folders[0] ?? null);
        })
        .catch((err) => {
          console.warn('Could not look for recorder folders', err);
          if (!cancelled) setOffer(null);
        });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [caseInsensitive, enabled, offer]);
  return enabled ? offer ?? undefined : undefined;
}
