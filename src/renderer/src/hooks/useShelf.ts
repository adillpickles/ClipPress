import { useCallback, useEffect, useMemo, useState } from 'react';
import pMap from 'p-map';

import { buildShelfQueue, isShelfVideo, pickNextClip, shelfThumbnailKey } from '../shelf';
import type { ShelfFile } from '../shelf';
import type { ShelfExport, ShelfOrder } from '../../../common/types';
import type { ThumbnailStore } from './useThumbnailStore';
import { getProjectsDir, getProjectStoreEnv, getStoredProjectFileName, projectSuffix } from '../projectStore';

const { join, parse } = window.require('path');
const { readdir, stat } = window.require('fs/promises');

/** The videos directly inside a folder (not its subfolders). */
export async function listShelfFolder(folder: string): Promise<ShelfFile[]> {
  const entries: { name: string, isFile: () => boolean }[] = await readdir(folder, { withFileTypes: true });
  const videos = entries.filter((entry) => entry.isFile() && isShelfVideo(entry.name));
  // Which have saved edits: one listing of ClipPress's projects folder, and project files next to the videos.
  const storeEnv = getProjectStoreEnv();
  const storedProjects = new Set<string>((await readdir(getProjectsDir(storeEnv)).catch(() => [])).map((name: string) => name.toLowerCase()));
  const folderNames = new Set(entries.map((entry) => entry.name.toLowerCase()));
  const hasEdits = (path: string, name: string) => storedProjects.has(getStoredProjectFileName(path, storeEnv.caseInsensitive).toLowerCase())
    || folderNames.has(`${parse(name).name}-${projectSuffix}`.toLowerCase());
  const files = await pMap(videos, async (entry): Promise<ShelfFile[]> => {
    const path: string = join(folder, entry.name);
    try {
      const info = await stat(path);
      return [{ path, name: entry.name, modifiedAt: info.mtimeMs, size: info.size, edited: hasEdits(path, entry.name) }];
    } catch {
      return [];
    }
  }, { concurrency: 8 });
  return files.flat();
}

/**
 * The shelf: the videos in a folder, in the order to work through them, and the clip after the open one.
 * Thumbnails come from the app's one store (useThumbnailStore, shared with the start screen's lists): made when a
 * row first shows, and for the rest of the folder in the background while `prefetch` says the editor is done with
 * FFmpeg for now.
 */
export default function useShelf({ folder, order, exports, caseInsensitive, currentPath, prefetch, unopenable, thumbnailStore }: {
  folder: string | undefined,
  order: ShelfOrder,
  exports: ShelfExport[],
  caseInsensitive: boolean,
  currentPath: string | undefined,
  prefetch: boolean,
  /** Recordings that couldn't be opened (`shelfThumbnailKey`): Next clip passes them by. */
  unopenable: ReadonlySet<string>,
  thumbnailStore: ThumbnailStore,
}) {
  const [listing, setListing] = useState<{ folder: string, files: ShelfFile[] }>();
  const [refreshCount, setRefreshCount] = useState(0);
  const { thumbnails, requestThumbnail, storeRef, publish } = thumbnailStore;
  // The shelf is about to show: list the folder again, and show the thumbnails made in the background meanwhile.
  const refresh = useCallback(() => {
    setRefreshCount((count) => count + 1);
    publish();
  }, [publish]);

  // Listed again on request (the shelf opening) and after each export: the clip moves down, and may have gone
  // to the Recycle Bin.
  useEffect(() => {
    if (folder == null) return undefined;
    let cancelled = false;
    listShelfFolder(folder)
      .catch((err) => {
        console.warn('Could not list the shelf folder', err);
        return [];
      })
      .then((files) => {
        if (!cancelled) setListing({ folder, files });
      });
    return () => {
      cancelled = true;
    };
  }, [exports, folder, refreshCount]);

  const files = useMemo(() => (listing != null && listing.folder === folder ? listing.files : []), [folder, listing]);
  const queue = useMemo(() => buildShelfQueue(files, { order, exports, caseInsensitive }), [caseInsensitive, exports, files, order]);
  const nextClip = useMemo(() => pickNextClip(queue, currentPath, caseInsensitive, unopenable), [caseInsensitive, currentPath, queue, unopenable]);

  // Top of the shelf first; started again (without what's made) when the folder is listed again.
  useEffect(() => {
    const store = storeRef.current;
    if (store == null) return;
    if (prefetch) store.prefetch(queue.map(({ file }) => ({ key: shelfThumbnailKey(file), path: file.path })));
    else store.stopPrefetch();
  }, [prefetch, queue, storeRef]);

  return { queue, nextClip, refresh, thumbnails, requestThumbnail };
}
