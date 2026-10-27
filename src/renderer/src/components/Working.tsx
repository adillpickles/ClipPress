import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import useInterval from 'react-use/lib/useInterval';

import Button from './Button';
import formatClockTime from '../util/clockTime';
import { getExportTitleLines, pickExportTitleLine } from '../exportTitleLines';
import type { ExportPhase } from '../exportTitleLines';
import styles from './Working.module.css';


/** A quiet task (opening a clip) shows nothing for this long, and offers Cancel only after the next. */
const quietShowAfterMs = 500;
const quietCancelAfterMs = 4000;

/**
 * Opening a clip: usually done before anything would show. If it takes a while (a slow drive, a big file), a small
 * card says so at the top, with a soft moving bar, and leaves the app as it is underneath; Cancel comes later.
 * Clicks on the app wait meanwhile (an invisible layer), as they do while it works on anything else.
 */
function QuietWorking({ text, onAbortClick }: { text: string, onAbortClick: () => void }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'hidden' | 'shown' | 'cancellable'>('hidden');
  useEffect(() => {
    const show = setTimeout(() => setStage('shown'), quietShowAfterMs);
    const cancellable = setTimeout(() => setStage('cancellable'), quietCancelAfterMs);
    return () => {
      clearTimeout(show);
      clearTimeout(cancellable);
    };
  }, []);

  return (
    <div className={styles['quietWrapper']}>
      {stage !== 'hidden' && (
        <motion.div
          className={styles['quietCard']}
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          <div className={styles['quietRow']}>
            <span className={styles['quietText']}>{text}</span>
            {stage === 'cancellable' && (
              <button type="button" className={styles['quietCancel']} onClick={onAbortClick}>{t('Cancel')}</button>
            )}
          </div>
          <div className={styles['indeterminate']} aria-hidden />
        </motion.div>
      )}
    </div>
  );
}

/**
 * How long each line stays: about a third of the export's expected length (from how fast the bar fills), so a quick
 * export rolls through a few lines and a long one changes now and then. Near the end of the bar, the finishing lines.
 */
const minLineMs = 600;
const maxLineMs = 5000;
const firstLineMs = 3500;
const finishingFrom = 0.92;

function getLineMs(elapsedMs: number, progress: number | undefined) {
  if (progress == null || progress < 0.05 || elapsedMs < 300) return undefined;
  return Math.min(maxLineMs, Math.max(minLineMs, elapsedMs / progress / 3));
}

interface TitleLine { phase: ExportPhase, text: string, at: number }

/**
 * The simple editor's export title: a random line for the phase (exportTitleLines.ts), then another as each has been
 * up long enough, none twice in an export until every one was shown. A new phase only changes where the next line
 * comes from. Never holds up the result: the export ends when it ends.
 */
function useExportTitle(phase: ExportPhase | undefined, progress: number | undefined, elapsedMs: number) {
  const { t } = useTranslation();
  // The lines this export has shown (kept for the card's life, changed in place).
  const [shown] = useState(() => new Set<string>());
  const shownPhase = phase != null && phase !== 'starting' && progress != null && progress >= finishingFrom ? 'finishing' : phase;
  const pick = useCallback((linePhase: ExportPhase, current: string | undefined): TitleLine => ({
    phase: linePhase,
    text: pickExportTitleLine(getExportTitleLines(linePhase, (key) => t(key)), shown, current),
    at: Date.now(),
  }), [shown, t]);
  // Picked as the card first renders, so the plain step's words never show first.
  const [line, setLine] = useState(() => (shownPhase != null ? pick(shownPhase, undefined) : undefined));
  // While the bar can't say (a second encode, a step without progress), the pace it last had.
  const lineMsRef = useRef<number>();

  // Rescheduled on the card's own clock (it ticks for the time shown anyway); the state changes only with the line.
  useEffect(() => {
    if (shownPhase == null) return undefined;
    const known = getLineMs(elapsedMs, progress);
    if (known != null) lineMsRef.current = known;
    const lineMs = known ?? lineMsRef.current ?? firstLineMs;
    const timer = setTimeout(() => setLine((previous) => pick(shownPhase, previous?.text)), Math.max(0, (line?.at ?? 0) + lineMs - Date.now()));
    return () => clearTimeout(timer);
  }, [elapsedMs, line, pick, progress, shownPhase]);

  // Steps without lines of their own (e.g. moving the original to the Recycle Bin) say what they do.
  return shownPhase != null ? line?.text : undefined;
}

function WorkingCard({ text, detailText, phase, progress, onAbortClick }: {
  text: string,
  detailText?: string | undefined,
  phase?: ExportPhase | undefined,
  progress?: number | undefined,
  onAbortClick: () => void
}) {
  const { t } = useTranslation();
  // The app's own Reduce motion setting as well as Windows': the bar's shimmer stops.
  const reduceMotion = useReducedMotionConfig() === true;
  const [startedAt] = useState(() => new Date());
  const [elapsedMs, setElapsedMs] = useState(0);
  const title = useExportTitle(phase, progress, elapsedMs) ?? text;
  // A second encode starts its own progress from 0: the bar sweeps instead of jumping back, and the line says why.
  const shownProgress = phase === 'sharper' || phase === 'smaller' ? undefined : progress;
  // Whole percents: a decimal changing several times a second only flickers. Rounded down, so it never reads
  // 100% before it's done.
  const progressPercent = shownProgress != null ? `${Math.floor(shownProgress * 100)}%` : undefined;

  // Reassure the user that the app is not frozen
  // This is because some ffmpeg operations can take a long time without giving any progress updates, which might make the user think that the app is frozen
  // https://github.com/mifi/lossless-cut/issues/2746

  useInterval(() => {
    setElapsedMs(Date.now() - startedAt.getTime());
  }, 100);

  return (
    <div className={styles['wrapper']} style={{ position: 'absolute', bottom: 0, top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <motion.div
        className={styles['card']}
        data-working-card=""
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
      >
        {/* What it's doing now, in plain words; each new line rolls up in as the old one rolls away. No spinner: the
            bar below always moves. */}
        <div className={styles['title']} role="status">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={title}
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '-100%' }}
              transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
            >
              {title}
            </motion.span>
          </AnimatePresence>
        </div>

        {detailText != null && (
          <div className={styles['detail']}>
            {detailText}
          </div>
        )}

        <div className={styles['metaRow']}>
          <div className={styles['elapsed']}>
            {t('{{time}} elapsed', { time: formatClockTime(elapsedMs / 1000) })}
          </div>
          {progressPercent != null && (
            <div className={styles['progressValue']}>
              {progressPercent}
            </div>
          )}
        </div>

        {/* A soft shimmer runs along the bar, so it's clear work goes on while the percent moves slowly; with no
            percent yet, a sweep. */}
        {shownProgress != null ? (
          <div className={styles['progressTrack']}>
            <div className={[styles['progressFill'], ...(reduceMotion ? [styles['still']] : [])].join(' ')} style={{ width: `${Math.max(shownProgress * 100, 4)}%` }} />
          </div>
        ) : (
          <div className={[styles['indeterminate'], styles['indeterminateTall'], ...(reduceMotion ? [styles['still']] : [])].join(' ')} aria-hidden />
        )}

        <div className={styles['actions']}>
          <Button onClick={onAbortClick}>{t('Cancel')}</Button>
        </div>
      </motion.div>
    </div>
  );
}

function Working({ text, detailText, phase, progress, quiet = false, onAbortClick }: {
  text: string,
  detailText?: string | undefined,
  /** An export in the simple editor: its title is a playful line for this phase rather than `text`. */
  phase?: ExportPhase | undefined,
  progress?: number | undefined,
  quiet?: boolean | undefined,
  onAbortClick: () => void
}) {
  if (quiet) return <QuietWorking text={text} onAbortClick={onAbortClick} />;
  return <WorkingCard text={text} detailText={detailText} phase={phase} progress={progress} onAbortClick={onAbortClick} />;
}

/**
 * The dialog that follows an export (its result) grows out of the progress card, which hands over to it: called as
 * the dialog's element mounts, before it paints. Does nothing when no progress card is showing.
 */
export function morphFromWorkingCard(dialog: HTMLElement, { reduceMotion }: { reduceMotion: boolean }) {
  const card = document.querySelector<HTMLElement>('[data-working-card]');
  if (card == null) return;
  card.dataset['handedOver'] = '';
  if (reduceMotion) return;
  // Its own opening animation would scale it: the morph replaces it.
  dialog.classList.add(styles['morphIn']!, styles['morphing']!);
  const from = card.getBoundingClientRect();
  const to = dialog.getBoundingClientRect();
  const inset = [from.top - to.top, to.right - from.right, to.bottom - from.bottom, from.left - to.left].map((px) => `${Math.max(0, px)}px`).join(' ');
  const radius = getComputedStyle(dialog).borderTopLeftRadius;
  const morph = dialog.animate([
    { clipPath: `inset(${inset} round ${getComputedStyle(card).borderTopLeftRadius})` },
    { clipPath: `inset(0 round ${radius})` },
  ], { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)' });
  const done = () => dialog.classList.remove(styles['morphing']!);
  morph.addEventListener('finish', done);
  morph.addEventListener('cancel', done);
}

export default memo(Working);
