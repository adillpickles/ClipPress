import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode, SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiChevronDown, FiChevronRight, FiCopy, FiFilm } from 'react-icons/fi';

import mainApi from '../mainApi';
import { getDuration, renderShelfThumbnail } from '../ffmpeg';
import { readFileSize } from '../util';
import { formatClipLength } from '../util/clockTime';
import { bytesPerMb } from '../sizeLimitedPlanner';
import styles from './ExportResult.module.css';

/** The file name to show, without the folder it landed in. */
export function getResultFileName(filePath: string) {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

interface FileFacts {
  /** A blob URL, or null when none could be made. */
  thumbnail?: string | null | undefined,
  size?: number | undefined,
  duration?: number | undefined,
}

/** Each exported file's picture, size and length, read once the dialog shows them. */
function useFileFacts(paths: readonly string[]) {
  const [facts, setFacts] = useState<Record<string, FileFacts>>({});
  const key = paths.join('\n');
  useEffect(() => {
    const abort = new AbortController();
    const urls: string[] = [];
    const update = (path: string, value: FileFacts) => {
      if (!abort.signal.aborted) setFacts((previous) => ({ ...previous, [path]: { ...previous[path], ...value } }));
    };
    (async () => {
      for (const path of key.split('\n').filter(Boolean)) {
        readFileSize(path).then((size) => update(path, { size })).catch((err) => console.warn('Unable to read exported file size', err));
        getDuration(path).then((duration: number | undefined) => update(path, { duration })).catch((err: unknown) => console.warn('Unable to read exported file length', err));
        try {
          // One at a time: a list of clips shouldn't start an FFmpeg for each at once.
          // eslint-disable-next-line no-await-in-loop
          const url = await renderShelfThumbnail(path, abort.signal, 270);
          if (url != null) urls.push(url);
          update(path, { thumbnail: url ?? null });
        } catch (err) {
          if (abort.signal.aborted) return;
          console.warn('Unable to make a thumbnail of the exported file', err);
          update(path, { thumbnail: null });
        }
      }
    })();
    return () => {
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);
  return facts;
}

/** In the MB the size limits use (1024 × 1024 bytes), so a file made to fit 8 MB never reads as more. */
function formatSize(bytes: number) {
  const mb = bytes / bytesPerMb;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "7.9 MB · 12.6 s" */
function formatFacts({ size, duration }: FileFacts) {
  return [size != null ? formatSize(size) : undefined, duration != null ? formatClipLength(duration) : undefined].filter(Boolean).join(' · ');
}

/** A small copy of a thumbnail, the picture under the pointer while the file is dragged out. */
function makeDragIcon(img: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = Math.max(1, Math.round((120 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/**
 * A picture of an exported file: hovering shows it can be copied, a click copies the video file itself (to paste into
 * a chat or a folder), and it can be dragged out of the window.
 */
function FileCard({ path, thumbnail, copied, onCopy, small = false }: {
  path: string,
  thumbnail: string | null | undefined,
  copied: boolean,
  onCopy: (() => void) | undefined,
  small?: boolean,
}) {
  const { t } = useTranslation();
  const dragIconRef = useRef<string>();
  const name = getResultFileName(path);
  const onDragStart = (e: DragEvent) => {
    e.preventDefault();
    mainApi.startFileDrag([path], dragIconRef.current).catch((err: unknown) => console.warn('Unable to drag the exported file', err));
  };
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { dragIconRef.current = makeDragIcon(e.currentTarget); };
  return (
    <button
      type="button"
      className={[styles['thumb'], ...(small ? [styles['thumbSmall']] : []), ...(copied ? [styles['thumbCopied']] : [])].join(' ')}
      onClick={onCopy}
      disabled={onCopy == null}
      draggable
      onDragStart={onDragStart}
      title={onCopy != null ? t('Copy the video') : undefined}
      data-tip-keys={onCopy != null && !small ? 'ControlLeft+KeyC' : undefined}
      aria-label={onCopy != null ? t('Copy {{file}}', { file: name }) : name}
    >
      {thumbnail != null ? <img src={thumbnail} alt="" draggable={false} onLoad={onLoad} /> : <FiFilm aria-hidden className={styles['placeholder']} />}
      {onCopy != null && <span className={styles['copyBadge']} aria-hidden>{copied ? <FiCheck /> : <FiCopy />}</span>}
    </button>
  );
}

/**
 * The body of the dialog after an export: the exported video as a picture with its name, size and length; a click on
 * it copies the video file, and it can be dragged out. Real problems show plainly; everything else is under Details.
 */
export default function ExportResult({ files, copyFiles, warnings, highlight, details, autoCopied, actions }: {
  /** Every file the export made, the merged one last. Empty when nothing was written. */
  files: string[],
  /** What a click on the main picture or Ctrl+C copies: the merged file when there is one, else every file. */
  copyFiles: string[],
  warnings: string[],
  /** Something to see without opening Details (e.g. the original went to the Recycle Bin). */
  highlight?: ReactNode,
  details?: ReactNode,
  /** Settings > Export's copy after exporting, already running: its outcome shows as if the picture was clicked. */
  autoCopied?: Promise<boolean> | undefined,
  /** The dialog's buttons, bottom right, with Details tucked away at the left of the same row. */
  actions: ReactNode,
}) {
  const { t } = useTranslation();
  const facts = useFileFacts(files);
  const [canCopy, setCanCopy] = useState(false);
  // What was copied last (its files, as one key) and the short-lived message about it.
  const [copiedKey, setCopiedKey] = useState<string>();
  const [message, setMessage] = useState<'copied' | 'failed'>();
  const messageTimer = useRef<ReturnType<typeof setTimeout>>();
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    mainApi.canCopyFiles().then(setCanCopy, () => setCanCopy(false));
  }, []);
  useEffect(() => () => clearTimeout(messageTimer.current), []);

  const showOutcome = useCallback((key: string, outcome: Promise<boolean>) => {
    outcome.then((ok) => {
      if (ok) setCopiedKey(key);
      setMessage(ok ? 'copied' : 'failed');
      clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(undefined), 1800);
    });
  }, []);

  const copyPaths = useCallback((paths: string[]) => {
    showOutcome(paths.join('\n'), mainApi.copyFilesToClipboard(paths).then(() => true, (err: unknown) => {
      console.warn('Unable to copy the exported file', err);
      return false;
    }));
  }, [showOutcome]);

  const mainKey = copyFiles.join('\n');
  useEffect(() => {
    if (autoCopied != null) showOutcome(mainKey, autoCopied);
  }, [autoCopied, mainKey, showOutcome]);

  // Ctrl+C in the dialog copies the video, unless some text is selected.
  useEffect(() => {
    if (!canCopy || copyFiles.length === 0) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyC' || e.shiftKey || e.altKey) return;
      if ((window.getSelection()?.toString() ?? '') !== '') return;
      e.preventDefault();
      copyPaths(copyFiles);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canCopy, copyFiles, copyPaths]);

  const single = files.length === 1 ? files[0] : undefined;
  // A copy of everything (Ctrl+C, or after exporting) ticks every picture it took.
  const isCopied = (path: string) => copiedKey != null && copiedKey.split('\n').includes(path);

  return (
    <div className={styles['result']}>
      {single != null && (
        <div className={styles['single']}>
          <FileCard path={single} thumbnail={facts[single]?.thumbnail} copied={isCopied(single)} onCopy={canCopy ? () => copyPaths(copyFiles) : undefined} />
          <div className={styles['name']} title={single}>{getResultFileName(single)}</div>
          <div className={styles['facts']}>{formatFacts(facts[single] ?? {}) || ' '}</div>
        </div>
      )}

      {files.length > 1 && (
        <ul className={styles['list']}>
          {files.map((path) => (
            <li key={path} className={styles['row']}>
              <FileCard small path={path} thumbnail={facts[path]?.thumbnail} copied={isCopied(path)} onCopy={canCopy ? () => copyPaths([path]) : undefined} />
              <div className={styles['rowText']}>
                <div className={styles['name']} title={path}>{getResultFileName(path)}</div>
                <div className={styles['facts']}>{formatFacts(facts[path] ?? {}) || ' '}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles['status']} aria-live="polite">
        {message === 'copied' && <span className={styles['copiedPill']}>{t('Copied')}</span>}
        {message === 'failed' && <span className={[styles['copiedPill'], styles['failedPill']].join(' ')}>{t('Couldn\'t copy')}</span>}
      </div>

      {highlight != null && <div className={styles['highlight']}>{highlight}</div>}

      {warnings.length > 0 && (
        <ul className={styles['warnings']}>
          {warnings.map((warning) => <li key={warning}><FiAlertTriangle aria-hidden />{warning}</li>)}
        </ul>
      )}

      <div className={styles['footer']}>
        {details != null && (
          <button type="button" className={styles['detailsToggle']} aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
            {detailsOpen ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
            {t('Details')}
          </button>
        )}
        <div className={styles['actions']}>{actions}</div>
      </div>
      {details != null && detailsOpen && <div className={styles['detailsBody']}>{details}</div>}
    </div>
  );
}
