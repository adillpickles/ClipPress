import { useCallback, useEffect, useRef, useState } from 'react';

import type { ShelfExport } from '../../../common/types';
import { clipsFolderDepth, findRecorderFolders, listNewestClips } from '../clipsFolder';
import type { RecorderFolder } from '../clipsFolder';
import { shelfThumbnailKey } from '../shelf';
import type { ShelfFile } from '../shelf';
import { renderShelfThumbnail } from '../ffmpeg';
import ShelfThumbnails from '../shelfThumbnails';
import type { ShelfThumbnail } from '../shelfThumbnails';

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
 * saved while ClipPress is open joins at once) and when the window comes back to the front. Thumbnails as the
 * shelf makes them, in memory only.
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
  // Listings run one at a time; one asked for again meanwhile skips the outdated one.
  const listQueueRef = useRef(Promise.resolve());
  // A watch that failed (a drive unplugged) is tried again when the window comes back to the front.
  const [watchAttempt, setWatchAttempt] = useState(0);
  const watchFailedRef = useRef(false);
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ShelfThumbnail>>(new Map());
  const thumbnailsRef = useRef<ShelfThumbnails>();

  useEffect(() => {
    if (folder == null || !active) return undefined;
    let cancelled = false;
    listQueueRef.current = listQueueRef.current.then(async () => {
      if (cancelled) return;
      const clips = await listNewestClips(folder, { limit: clipsFolderLimit, exports, caseInsensitive }).catch((err) => {
        console.warn('Could not list the clips folder', err);
        return [];
      });
      if (!cancelled) setListing({ folder, clips });
    });
    return () => {
      cancelled = true;
    };
  }, [active, caseInsensitive, exports, folder, listCount]);

  useEffect(() => {
    if (folder == null || !active) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstChangeAt: number | undefined;
    const listAgain = (_event: string, fileName: string | null) => {
      // Deeper than the listing looks: nothing it shows changed.
      if (fileName != null && fileName.split(/[\\/]/).length > clipsFolderDepth + 1) return;
      const now = Date.now();
      firstChangeAt ??= now;
      clearTimeout(timer);
      timer = setTimeout(() => {
        firstChangeAt = undefined;
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
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      watcher?.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [active, folder, watchAttempt]);

  useEffect(() => {
    const store = new ShelfThumbnails({
      render: renderShelfThumbnail,
      revoke: (url) => URL.revokeObjectURL(url),
      onChange: () => setThumbnails(store.snapshot()),
    });
    thumbnailsRef.current = store;
    return () => {
      store.dispose();
      setThumbnails(new Map());
    };
  }, [folder]);

  const requestThumbnail = useCallback((file: ShelfFile) => thumbnailsRef.current?.request({ key: shelfThumbnailKey(file), path: file.path }), []);

  const clips = listing != null && listing.folder === folder ? listing.clips : undefined;
  return { clips, thumbnails, requestThumbnail };
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
