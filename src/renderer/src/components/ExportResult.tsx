import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode, SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiChevronDown, FiChevronRight, FiCopy, FiFilm, FiFolder } from 'react-icons/fi';

import mainApi from '../mainApi';
import { getDuration, renderShelfThumbnail } from '../ffmpeg';
import { readFileSize, showItemInFolder } from '../util';
import { runSelfFileDrag } from '../selfFileDrag';
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
 * a chat or a folder), its copy icon turning into a check mark for a moment, and it can be dragged out of the window.
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
    runSelfFileDrag(() => mainApi.startFileDrag([path], dragIconRef.current)).catch((err: unknown) => console.warn('Unable to drag the exported file', err));
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
      {/* Both icons are there, so one turns into the other (and the check stays while the badge fades out). */}
      {onCopy != null && (
        <span className={styles['copyBadge']} aria-hidden>
          <FiCopy className={styles['copyIcon']} />
          <FiCheck className={styles['checkIcon']} />
        </span>
      )}
    </button>
  );
}

/** The file's name: a click shows it in its folder, which the small folder after it says. */
function FileName({ path }: { path: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={styles['name']} onClick={() => showItemInFolder(path)} title={t('Show in folder')}>
      <span className={styles['nameText']}>{getResultFileName(path)}</span>
      <FiFolder aria-hidden className={styles['nameIcon']} />
    </button>
  );
}

/** How long a copy's outcome shows. */
const copiedShowMs = 1600;
const autoCopiedShowMs = 2200;
const copyFailedShowMs = 3500;

function getShowMs({ auto, ok }: { auto: boolean, ok: boolean }) {
  if (!ok) return copyFailedShowMs;
  return auto ? autoCopiedShowMs : copiedShowMs;
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
  /** Settings > Export's copy after exporting, already running: the user asked for it, so it only shows in a few words. */
  autoCopied?: Promise<boolean> | undefined,
  /** The dialog's buttons, bottom right, with Details tucked away at the left of the same row. */
  actions: ReactNode,
}) {
  const { t } = useTranslation();
  const facts = useFileFacts(files);
  const [canCopy, setCanCopy] = useState(false);
  // The last copy's outcome, for a moment: its files (as one key), and whether it was a click (or Ctrl+C), which
  // shows on the pictures it took, or the copy after exporting, which only shows in a few words.
  const [outcome, setOutcome] = useState<{ key: string, auto: boolean, ok: boolean, id: number }>();
  const outcomeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    mainApi.canCopyFiles().then(setCanCopy, () => setCanCopy(false));
  }, []);
  useEffect(() => () => clearTimeout(outcomeTimer.current), []);

  const setOutcomeFor = useCallback((next: { key: string, auto: boolean, ok: boolean }) => {
    setOutcome({ ...next, id: Date.now() });
    clearTimeout(outcomeTimer.current);
    outcomeTimer.current = setTimeout(() => setOutcome(undefined), getShowMs(next));
  }, []);

  const showOutcome = useCallback((key: string, auto: boolean, copying: Promise<boolean>) => {
    copying.then((ok) => setOutcomeFor({ key, auto, ok }));
  }, [setOutcomeFor]);

  // A click or Ctrl+C shows its check at once; a copy that then fails swaps it for "Couldn't copy", unless a later
  // copy has been asked for since (its own outcome stands) or the dialog has gone.
  const lastCopyRef = useRef(0);
  useEffect(() => () => { lastCopyRef.current = -1; }, []);
  const copyPaths = useCallback((paths: string[]) => {
    const key = paths.join('\n');
    lastCopyRef.current += 1;
    const copy = lastCopyRef.current;
    setOutcomeFor({ key, auto: false, ok: true });
    mainApi.copyFilesToClipboard(paths).catch((err: unknown) => {
      console.warn('Unable to copy the exported file', err);
      if (copy === lastCopyRef.current) setOutcomeFor({ key, auto: false, ok: false });
    });
  }, [setOutcomeFor]);

  // The copy helper stays ready while the result is up (an export started it).
  useEffect(() => {
    if (canCopy) mainApi.warmCopyHelper().catch((err: unknown) => console.warn('Unable to start the copy helper', err));
  }, [canCopy]);

  const mainKey = copyFiles.join('\n');
  useEffect(() => {
    if (autoCopied != null) showOutcome(mainKey, true, autoCopied);
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
  // A click or Ctrl+C ticks every picture it took.
  const isCopied = (path: string) => outcome != null && outcome.ok && !outcome.auto && outcome.key.split('\n').includes(path);
  // Words only for a copy the user didn't just click: the one after exporting, or one that failed.
  let statusText: string | undefined;
  if (outcome != null && !outcome.ok) statusText = t('Couldn\'t copy');
  else if (outcome?.auto) statusText = t('Copied to clipboard');

  return (
    <div className={styles['result']}>
      {single != null && (
        <div className={styles['single']}>
          <FileCard path={single} thumbnail={facts[single]?.thumbnail} copied={isCopied(single)} onCopy={canCopy ? () => copyPaths(copyFiles) : undefined} />
          <FileName path={single} />
          <div className={styles['facts']}>{formatFacts(facts[single] ?? {}) || ' '}</div>
        </div>
      )}

      {files.length > 1 && (
        <ul className={styles['list']}>
          {files.map((path) => (
            <li key={path} className={styles['row']}>
              <FileCard small path={path} thumbnail={facts[path]?.thumbnail} copied={isCopied(path)} onCopy={canCopy ? () => copyPaths([path]) : undefined} />
              <div className={styles['rowText']}>
                <FileName path={path} />
                <div className={styles['facts']}>{formatFacts(facts[path] ?? {}) || ' '}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

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
        <span className={styles['status']} aria-live="polite">
          {statusText != null && outcome != null && (
            <span
              key={outcome.id}
              className={[styles['statusText'], ...(outcome.ok ? [] : [styles['statusFailed']])].join(' ')}
              style={{ animationDuration: `${getShowMs(outcome)}ms` }}
            >
              {statusText}
            </span>
          )}
        </span>
        <div className={styles['actions']}>{actions}</div>
      </div>
      {details != null && detailsOpen && <div className={styles['detailsBody']}>{details}</div>}
    </div>
  );
}
