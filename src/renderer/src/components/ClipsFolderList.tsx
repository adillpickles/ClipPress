import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFolder, FiX } from 'react-icons/fi';

import type { RecorderFolder } from '../clipsFolder';
import type { ShelfFile } from '../shelf';
import { shelfThumbnailKey } from '../shelf';
import type { ShelfThumbnail } from '../shelfThumbnails';
import formatRelativeTime from '../util/relativeTime';
import Button from './Button';
import { ShelfThumb } from './Shelf';
import recentStyles from './RecentFiles.module.css';
import styles from './ClipsFolderList.module.css';

const { basename, dirname, extname, relative } = window.require('path');

function ClipRow({ clip, folder, thumbnail, requestThumbnail, onOpen, formatRelative }: {
  clip: ShelfFile,
  folder: string,
  thumbnail: ShelfThumbnail | undefined,
  requestThumbnail: (file: ShelfFile) => void,
  onOpen: (path: string) => void,
  formatRelative: (ms: number) => string,
}) {
  useEffect(() => {
    if (thumbnail === undefined) requestThumbnail(clip);
  }, [clip, requestThumbnail, thumbnail]);
  // The game's folder, where the recorder keeps one per game (NVIDIA): "Valorant".
  const subfolder = relative(folder, dirname(clip.path));
  return (
    <li className={recentStyles['item']}>
      {/* No remove button on these rows, so no room kept for one on the right. */}
      <button type="button" className={recentStyles['open']} style={{ paddingRight: '.8rem' }} onClick={() => onOpen(clip.path)} title={clip.path}>
        <ShelfThumb thumbnail={thumbnail} />
        <span className={recentStyles['text']}>
          <span className={recentStyles['name']}>{basename(clip.name, extname(clip.name))}</span>
          {subfolder !== '' && <span className={recentStyles['meta']}>{subfolder}</span>}
        </span>
        <span className={recentStyles['side']}>
          <span className={recentStyles['when']}>{formatRelative(clip.modifiedAt)}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The start screen's "Your clips": the newest clips in the clips folder (Settings > General), one click to open.
 * With no folder linked, it offers the one a recorder on this PC saves to, once, until it's taken or turned down.
 */
function ClipsFolderList({ folder, clips, thumbnails, requestThumbnail, onOpen, offer, onTakeOffer, onDismissOffer }: {
  folder: string | undefined,
  clips: ShelfFile[] | undefined,
  thumbnails: ReadonlyMap<string, ShelfThumbnail>,
  requestThumbnail: (file: ShelfFile) => void,
  onOpen: (path: string) => void,
  offer: RecorderFolder | undefined,
  onTakeOffer: () => void,
  onDismissOffer: () => void,
}) {
  const { t, i18n } = useTranslation();
  const formatRelative = useMemo(() => {
    const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    const justNow = t('Just now');
    return (ms: number) => formatRelativeTime(ms, Date.now(), format, justNow);
  }, [i18n.language, t]);

  if (folder == null) {
    if (offer == null) return null;
    return (
      <section className={recentStyles['recent']} aria-label={t('Your clips')}>
        <div className={styles['offer']}>
          <FiFolder aria-hidden className={recentStyles['icon']} />
          <span className={recentStyles['text']}>
            <span className={recentStyles['name']}>{t('Show your {{recorder}} clips here?', { recorder: offer.recorder })}</span>
            <span className={recentStyles['meta']}>{offer.path}</span>
          </span>
          <Button size="sm" onClick={onTakeOffer}>{t('Show them')}</Button>
          <button type="button" className={styles['dismiss']} onClick={onDismissOffer} title={t('Not now')} aria-label={t('Not now')}>
            <FiX aria-hidden />
          </button>
        </div>
      </section>
    );
  }

  if (clips == null || clips.length === 0) return null;
  return (
    <section className={recentStyles['recent']} aria-label={t('Your clips')}>
      <div className={recentStyles['header']}>
        <span className={recentStyles['title']}>{t('Your clips')}</span>
      </div>
      <ul className={recentStyles['list']}>
        {clips.map((clip) => (
          <ClipRow key={clip.path} clip={clip} folder={folder} thumbnail={thumbnails.get(shelfThumbnailKey(clip))} requestThumbnail={requestThumbnail} onOpen={onOpen} formatRelative={formatRelative} />
        ))}
      </ul>
    </section>
  );
}

export default memo(ClipsFolderList);
