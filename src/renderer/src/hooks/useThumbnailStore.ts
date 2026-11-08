import { useCallback, useEffect, useRef, useState } from 'react';

import { renderShelfThumbnail } from '../ffmpeg';
import { shelfThumbnailKey } from '../shelf';
import type { ShelfFile } from '../shelf';
import ShelfThumbnails from '../shelfThumbnails';
import type { ShelfThumbnail } from '../shelfThumbnails';

export interface ThumbnailStore {
  thumbnails: ReadonlyMap<string, ShelfThumbnail>,
  requestThumbnail: (file: ShelfFile) => void,
  /** The store itself, for the clips panel's background making (`prefetch`). */
  storeRef: { readonly current: ShelfThumbnails | undefined },
  /** Shows the pictures made in the background since the last time (they aren't shown one by one). */
  publish: () => void,
}

/**
 * One store of clip pictures for the start screen's Your clips and Recent and the clips panel, so a clip in two of
 * them is made once: in memory only (never on disk), made when its row first shows, the least used dropped beyond
 * the store's limit.
 */
export default function useThumbnailStore(): ThumbnailStore {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ShelfThumbnail>>(new Map());
  const storeRef = useRef<ShelfThumbnails>();

  useEffect(() => {
    const store = new ShelfThumbnails({
      render: renderShelfThumbnail,
      revoke: (url) => URL.revokeObjectURL(url),
      onChange: () => setThumbnails(store.snapshot()),
    });
    storeRef.current = store;
    return () => {
      store.dispose();
      storeRef.current = undefined;
      setThumbnails(new Map());
    };
  }, []);

  const requestThumbnail = useCallback((file: ShelfFile) => storeRef.current?.request({ key: shelfThumbnailKey(file), path: file.path }), []);
  const publish = useCallback(() => {
    if (storeRef.current != null) setThumbnails(storeRef.current.snapshot());
  }, []);

  return { thumbnails, requestThumbnail, storeRef, publish };
}
