import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';

import type { RecentFile } from '../../../common/types';
import { getProjectLookupPaths, getProjectStoreEnv } from '../projectStore';
import { shelfThumbnailKey } from '../shelf';
import type { ShelfFile } from '../shelf';
import type { ShelfThumbnail } from '../shelfThumbnails';
import { ShelfThumb } from './Shelf';
import formatRelativeTime from '../util/relativeTime';
import styles from './RecentFiles.module.css';

const { stat } = window.require('fs/promises');
const { basename, dirname, extname, parse } = window.require('path');

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function statFile(path: string): Promise<{ size: number, mtimeMs: number } | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

/** `file`: the recording as the clip lists know it (its picture's key), while it's there. */
interface FileState { missing: boolean, edited: boolean, file?: ShelfFile | undefined }

/** A row's picture from the app's one store (useThumbnailStore), asked for when the row shows. */
function RecentThumb({ file, thumbnails, requestThumbnail }: {
  file: ShelfFile | undefined,
  thumbnails: ReadonlyMap<string, ShelfThumbnail>,
  requestThumbnail: (forFile: ShelfFile) => void,
}) {
  // A recording that's gone has no picture to make: the film icon.
  const thumbnail = file != null ? thumbnails.get(shelfThumbnailKey(file)) : null;
  useEffect(() => {
    if (file != null && thumbnail === undefined) requestThumbnail(file);
  }, [file, requestThumbnail, thumbnail]);
  return <ShelfThumb thumbnail={thumbnail} />;
}

function useRelativeTime() {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    const justNow = t('Just now');
    return (ms: number) => formatRelativeTime(ms, Date.now(), format, justNow);
  }, [i18n.language, t]);
}

/** The file's name as the shelf shows it, without the extension. */
function displayName(path: string) {
  return basename(path, extname(path));
}

/**
 * Recordings opened lately, on the welcome screen. Marks the ones with saved edits (in ClipPress's folder, next to
 * them or in the export folder), so it is easy to pick up where you left off (#64).
 */
function RecentFiles({ files, customOutDir, wasExported, thumbnails, requestThumbnail, onOpen, onRemove, onForget, onClear }: {
  files: RecentFile[],
  customOutDir: string | undefined,
  /** ClipPress exported this recording (the shelf's export list). */
  wasExported: (path: string) => boolean,
  thumbnails: ReadonlyMap<string, ShelfThumbnail>,
  requestThumbnail: (file: ShelfFile) => void,
  onOpen: (path: string) => void,
  onRemove: (path: string) => void,
  /** Recordings gone with nothing left to come back for: they leave the list rather than show as Missing. */
  onForget: (paths: string[]) => void,
  onClear: () => void,
}) {
  const { t } = useTranslation();
  const formatRelative = useRelativeTime();
  const [states, setStates] = useState<Record<string, FileState>>({});
  const [checkCount, setCheckCount] = useState(0);

  // A drive can be reconnected, or a project saved, while this list is showing, so check again when the window regains focus.
  useEffect(() => {
    const onFocus = () => setCheckCount((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(files.map(async ({ path }) => {
        const projectPaths = getProjectLookupPaths(path, 'app', customOutDir, getProjectStoreEnv());
        const [media, ...projectsExist] = await Promise.all([statFile(path), ...projectPaths.map((projectPath) => exists(projectPath))]);
        const edited = projectsExist.some(Boolean);
        const file = media != null ? { path, name: basename(path), modifiedAt: media.mtimeMs, size: media.size, edited } : undefined;
        return [path, { missing: media == null, edited, file }] as const;
      }));
      // Recent keeps a recording that's gone only when there's something to come back for: edits never exported
      // (shown as Missing, to find it again). Gone and exported, or gone without edits, it leaves the list. A drive
      // that isn't there (unplugged; its edits may be on it too) isn't a deletion: those stay, as Missing.
      const done = (await Promise.all(entries.map(async ([path, state]) => (
        state.missing && (wasExported(path) || !state.edited) && await exists(parse(path).root) ? [path] : []
      )))).flat();
      if (cancelled) return;
      setStates(Object.fromEntries(entries));
      if (done.length > 0) onForget(done);
    })();
    return () => { cancelled = true; };
  }, [checkCount, customOutDir, files, onForget, wasExported]);

  if (files.length === 0) return null;

  return (
    <section className={styles['recent']} aria-label={t('Recent clips')}>
      <div className={styles['header']}>
        <span className={styles['title']}>{t('Recent')}</span>
        <button type="button" className={styles['clear']} onClick={onClear}>{t('Clear list')}</button>
      </div>

      <ul className={styles['list']}>
        {files.map(({ path, openedAt }) => {
          const state = states[path];
          const missing = state?.missing === true;
          return (
            <li key={path} className={styles['item']}>
              {/* A missing one opens "Can't find the recording", to find it again with its edits. */}
              <button
                type="button"
                className={[styles['open'], ...(missing ? [styles['missing']] : [])].join(' ')}
                onClick={() => onOpen(path)}
                title={missing ? `${t('This file has been moved or deleted: {{path}}', { path })}\n${t('Click to find it.')}` : path}
                // The path only when the name or folder is cut short; a missing one always says what's wrong.
                data-tip-if-cut={missing ? undefined : ''}
              >
                <RecentThumb file={state?.file} thumbnails={thumbnails} requestThumbnail={requestThumbnail} />
                <span className={styles['text']}>
                  <span className={styles['name']} data-cuttable="">{displayName(path)}</span>
                  <span className={styles['meta']} data-cuttable="">
                    {dirname(path)}
                  </span>
                </span>
                <span className={styles['side']}>
                  {missing && <span className={styles['badgeMissing']}>{t('Missing')}</span>}
                  {!missing && state?.edited && <span className={styles['badge']} title={t('Your edits to this clip are saved')}>{t('Edited')}</span>}
                  <span className={styles['when']}>{formatRelative(openedAt)}</span>
                </span>
              </button>
              <button type="button" className={styles['remove']} onClick={() => onRemove(path)} title={t('Remove from this list')} aria-label={t('Remove {{name}} from this list', { name: displayName(path) })}>
                <FiX aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(RecentFiles);
