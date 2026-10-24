import { memo, useEffect, useRef } from 'react';
import { FiArrowUp, FiCheck, FiFilm, FiFolder } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import prettyBytes from 'pretty-bytes';

import type { ShelfFile, ShelfItem } from '../shelf';
import { parseShelfOrder, shelfPathKey, toggleShelfOrder } from '../shelf';
import type { ShelfOrder } from '../../../common/types';
import styles from './Shelf.module.css';

const { basename, extname } = window.require('path');

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function ShelfRowInner({ item, state, thumbnail, requestThumbnail, onOpen }: {
  item: ShelfItem,
  state: 'open' | 'next' | undefined,
  thumbnail: string | undefined,
  requestThumbnail: (path: string) => void,
  onOpen: (path: string) => void,
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const { file, exported } = item;

  // Make the thumbnail once the row scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (el == null || thumbnail != null) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        requestThumbnail(file.path);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [file.path, requestThumbnail, thumbnail]);

  return (
    <button
      ref={ref}
      type="button"
      className={[styles['row'], ...(state === 'open' ? [styles['rowOpen']] : []), ...(exported ? [styles['rowExported']] : [])].join(' ')}
      onClick={() => onOpen(file.path)}
      disabled={state === 'open'}
      aria-current={state === 'open' ? 'true' : undefined}
      title={file.name}
    >
      <span className={styles['thumb']}>
        {thumbnail != null ? <img src={thumbnail} alt="" draggable={false} /> : <FiFilm aria-hidden />}
      </span>
      <span className={styles['text']}>
        <span className={styles['name']}>{basename(file.name, extname(file.name))}</span>
        <span className={styles['meta']}>
          {dateFormat.format(file.modifiedAt)} · {prettyBytes(file.size, { maximumFractionDigits: 0 })}
          {file.edited && !exported && <span className={styles['edited']}> · {t('Edited')}</span>}
        </span>
      </span>
      {/* A status, not an action, so it isn't worded or drawn like a button. */}
      {state === 'open' && <span className={[styles['tag'], styles['tagCurrent']].join(' ')}>{t('Editing')}</span>}
      {state === 'next' && <span className={[styles['tag'], styles['tagNext']].join(' ')}>{t('Up next')}</span>}
      {state == null && exported && <span className={styles['done']} title={t('Exported')}><FiCheck aria-label={t('Exported')} /></span>}
    </button>
  );
}
const ShelfRow = memo(ShelfRowInner);

/**
 * The shelf: the videos in the open clip's folder, oldest recording first (or newest first, or by name either
 * way). Clips already exported sink to the bottom; ClipPress's own exports aren't listed.
 */
function Shelf({ folder, queue, currentPath, nextPath, caseInsensitive, order, onOrderChange, onOpen, onChooseFolder, thumbnails, requestThumbnail, autoFocus = false }: {
  folder: string | undefined,
  queue: ShelfItem[],
  currentPath: string | undefined,
  nextPath: string | undefined,
  caseInsensitive: boolean,
  order: ShelfOrder,
  onOrderChange: (newOrder: ShelfOrder) => void,
  onOpen: (path: string) => void,
  onChooseFolder: () => void,
  thumbnails: ReadonlyMap<string, string>,
  requestThumbnail: (path: string) => void,
  /** Move focus to the first clip that can be opened (opened from the keyboard or a click). */
  autoFocus?: boolean,
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLButtonElement>(`.${styles['row']}:not(:disabled)`) ?? root?.querySelector<HTMLButtonElement>('button');
    target?.focus();
  }, [autoFocus]);
  const currentKey = currentPath != null ? shelfPathKey(currentPath, caseInsensitive) : undefined;
  const nextKey = nextPath != null ? shelfPathKey(nextPath, caseInsensitive) : undefined;
  const remaining = queue.filter((item) => !item.exported).length;
  const { by, reversed } = parseShelfOrder(order);

  return (
    <div ref={rootRef} className={styles['shelf']}>
      <div className={styles['header']}>
        <button type="button" className={styles['folder']} onClick={onChooseFolder} title={folder ?? t('Choose a folder')}>
          <FiFolder aria-hidden />
          <span className={styles['folderName']}>{folder != null ? basename(folder) || folder : t('Choose a folder')}</span>
        </button>
        {queue.length > 0 && (
          <div className={styles['order']} role="radiogroup" aria-label={t('Order')}>
            {(['date', 'name'] as const).map((value) => {
              const on = by === value;
              // The one that's on says which way round it is, and that clicking it again turns it round.
              let ariaLabel: string | undefined;
              let title = value === 'date' ? t('Oldest recording first') : t('By name');
              if (on && value === 'date') {
                ariaLabel = reversed ? t('Date, newest first') : t('Date, oldest first');
                title = reversed ? t('Newest first. Click again for oldest first.') : t('Oldest first. Click again for newest first.');
              } else if (on) {
                ariaLabel = reversed ? t('Name, Z to A') : t('Name, A to Z');
                title = reversed ? t('Z to A. Click again for A to Z.') : t('A to Z. Click again for Z to A.');
              }
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={ariaLabel}
                  className={[styles['orderOption'], ...(on ? [styles['orderOptionOn']] : [])].join(' ')}
                  onClick={() => onOrderChange(toggleShelfOrder(order, value))}
                  title={title}
                >
                  {value === 'date' ? t('Date') : t('Name')}
                  {on && <FiArrowUp aria-hidden className={[styles['orderArrow'], ...(reversed ? [styles['orderArrowDown']] : [])].join(' ')} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {folder != null && queue.length > 0 && (
        <div className={styles['summary']}>{t('{{count}} clips to go', { count: remaining })}</div>
      )}

      {queue.length > 0 ? (
        <div className={styles['list']}>
          {queue.map((item) => {
            const key = shelfPathKey(item.file.path, caseInsensitive);
            const state = key === currentKey ? 'open' : (key === nextKey ? 'next' : undefined);
            return (
              <ShelfRow
                key={item.file.path}
                item={item}
                state={state}
                thumbnail={thumbnails.get(item.file.path)}
                requestThumbnail={requestThumbnail}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      ) : (
        <div className={styles['empty']}>
          {folder != null ? t('No videos in this folder') : t('Open a clip or choose a folder to see its videos here.')}
        </div>
      )}
    </div>
  );
}

/** The welcome screen's way back in: the next clip from the shelf, one click away. */
function ShelfUpNextInner({ file, thumbnail, requestThumbnail, onOpen }: {
  file: ShelfFile,
  thumbnail: string | undefined,
  requestThumbnail: (path: string) => void,
  onOpen: (path: string) => void,
}) {
  const { t } = useTranslation();
  useEffect(() => requestThumbnail(file.path), [file.path, requestThumbnail]);
  return (
    <button type="button" className={styles['upNext']} onClick={() => onOpen(file.path)} title={file.name}>
      <span className={styles['thumb']}>
        {thumbnail != null ? <img src={thumbnail} alt="" draggable={false} /> : <FiFilm aria-hidden />}
      </span>
      <span className={styles['text']}>
        <span className={styles['upNextLabel']}>{t('Up next')}</span>
        <span className={styles['name']}>{basename(file.name, extname(file.name))}</span>
      </span>
      <span className={styles['upNextOpen']}>{t('Open')}</span>
    </button>
  );
}
export const ShelfUpNext = memo(ShelfUpNextInner);

export default memo(Shelf);
