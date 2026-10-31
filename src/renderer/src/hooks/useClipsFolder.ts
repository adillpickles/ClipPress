import { useCallback, useEffect, useRef, useState } from 'react';

import type { ShelfExport } from '../../../common/types';
import { findRecorderFolders, listNewestClips } from '../clipsFolder';
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
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ShelfThumbnail>>(new Map());
  const thumbnailsRef = useRef<ShelfThumbnails>();

  useEffect(() => {
    if (folder == null || !active) return undefined;
    let cancelled = false;
    listNewestClips(folder, { limit: clipsFolderLimit, exports, caseInsensitive })
      .catch((err) => {
        console.warn('Could not list the clips folder', err);
        return [];
      })
      .then((clips) => {
        if (!cancelled) setListing({ folder, clips });
      });
    return () => {
      cancelled = true;
    };
  }, [active, caseInsensitive, exports, folder, listCount]);

  useEffect(() => {
    if (folder == null || !active) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listAgain = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setListCount((count) => count + 1), settleMs);
    };
    let watcher: { close: () => void } | undefined;
    try {
      watcher = watch(folder, { recursive: true }, listAgain);
      // A folder that goes away (a drive unplugged) stops the watch; focusing the window lists it again.
      (watcher as unknown as { on: (event: string, listener: () => void) => void }).on('error', () => watcher?.close());
    } catch (err) {
      console.warn('Could not watch the clips folder', err);
    }
    const onFocus = () => setListCount((count) => count + 1);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      watcher?.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [active, folder]);

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
