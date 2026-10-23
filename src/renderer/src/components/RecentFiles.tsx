import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilm, FiX } from 'react-icons/fi';

import type { RecentFile } from '../../../common/types';
import { getProjectLookupPaths, getProjectStoreEnv } from '../projectStore';
import styles from './RecentFiles.module.css';

const { stat } = window.require('fs/promises');
const { basename, dirname } = window.require('path');

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

interface FileState { missing: boolean, edited: boolean }

function useRelativeTime() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    return (ms: number) => {
      const seconds = (ms - Date.now()) / 1000;
      const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]];
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
      }
      return format.format(0, 'minute');
    };
  }, [i18n.language]);
}

/**
 * Recordings opened lately, on the welcome screen. Marks the ones with saved edits (in ClipPress's folder, next to
 * them or in the export folder), so it is easy to pick up where you left off (#64).
 */
function RecentFiles({ files, customOutDir, onOpen, onRemove, onClear }: {
  files: RecentFile[],
  customOutDir: string | undefined,
  onOpen: (path: string) => void,
  onRemove: (path: string) => void,
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
        const [mediaExists, ...projectsExist] = await Promise.all([exists(path), ...projectPaths.map((projectPath) => exists(projectPath))]);
        return [path, { missing: !mediaExists, edited: projectsExist.some(Boolean) }] as const;
      }));
      if (!cancelled) setStates(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [checkCount, customOutDir, files]);

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
              <button
                type="button"
                className={[styles['open'], ...(missing ? [styles['missing']] : [])].join(' ')}
                onClick={() => onOpen(path)}
                disabled={missing}
                title={missing ? t('This file has been moved or deleted: {{path}}', { path }) : path}
              >
                <FiFilm aria-hidden className={styles['icon']} />
                <span className={styles['text']}>
                  <span className={styles['name']}>{basename(path)}</span>
                  <span className={styles['meta']}>
                    {dirname(path)}
                  </span>
                </span>
                <span className={styles['side']}>
                  {missing && <span className={styles['badgeMissing']}>{t('Missing')}</span>}
                  {!missing && state?.edited && <span className={styles['badge']} title={t('Your edits to this clip are saved')}>{t('Edited')}</span>}
                  <span className={styles['when']}>{formatRelative(openedAt)}</span>
                </span>
              </button>
              <button type="button" className={styles['remove']} onClick={() => onRemove(path)} title={t('Remove from this list')} aria-label={t('Remove {{name}} from this list', { name: basename(path) })}>
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
