import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pMap from 'p-map';

import { buildShelfQueue, isShelfVideo, pickNextClip } from '../shelf';
import type { ShelfFile } from '../shelf';
import type { ShelfExport, ShelfOrder } from '../../../common/types';
import { renderShelfThumbnail } from '../ffmpeg';
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

const thumbnailConcurrency = 2;

interface ThumbnailJobs {
  controller: AbortController,
  pending: string[],
  requested: Set<string>,
  urls: string[],
  running: number,
}

function pumpThumbnails(jobs: ThumbnailJobs, onThumbnail: (path: string, url: string) => void) {
  while (jobs.running < thumbnailConcurrency && jobs.pending.length > 0) {
    const path = jobs.pending.shift()!;
    // eslint-disable-next-line no-param-reassign
    jobs.running += 1;
    const { signal } = jobs.controller;
    renderShelfThumbnail(path, signal)
      .then((url) => {
        if (url == null) return;
        if (signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        jobs.urls.push(url);
        onThumbnail(path, url);
      })
      .catch(() => undefined)
      .finally(() => {
        // eslint-disable-next-line no-param-reassign
        jobs.running -= 1;
        if (!signal.aborted) pumpThumbnails(jobs, onThumbnail);
      });
  }
}

/**
 * The shelf: the videos in a folder, in the order to work through them, and the clip after the open one.
 * Thumbnails are made when a row first shows and live only in memory, dropped when the folder changes.
 */
export default function useShelf({ folder, order, exports, caseInsensitive, currentPath }: {
  folder: string | undefined,
  order: ShelfOrder,
  exports: ShelfExport[],
  caseInsensitive: boolean,
  currentPath: string | undefined,
}) {
  const [listing, setListing] = useState<{ folder: string, files: ShelfFile[] }>();
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

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
  const nextClip = useMemo(() => pickNextClip(queue, currentPath, caseInsensitive), [caseInsensitive, currentPath, queue]);

  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(new Map());
  const thumbnailJobs = useRef<ThumbnailJobs>();

  useEffect(() => {
    const jobs: ThumbnailJobs = { controller: new AbortController(), pending: [], requested: new Set(), urls: [], running: 0 };
    thumbnailJobs.current = jobs;
    return () => {
      jobs.controller.abort();
      jobs.urls.forEach((url) => URL.revokeObjectURL(url));
      setThumbnails(new Map());
    };
  }, [folder]);

  const requestThumbnail = useCallback((path: string) => {
    const jobs = thumbnailJobs.current;
    if (jobs == null || jobs.requested.has(path)) return;
    jobs.requested.add(path);
    jobs.pending.push(path);
    pumpThumbnails(jobs, (donePath, url) => setThumbnails((existing) => new Map(existing).set(donePath, url)));
  }, []);

  return { queue, nextClip, refresh, thumbnails, requestThumbnail };
}
