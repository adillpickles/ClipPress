import { useEffect, useRef } from 'react';

import { logProjectFiles, runProjectCleanup } from '../projectFilesIo';
import { trashFile } from '../util';
import type { RecentFile } from '../../../common/types';

/** Well after the start, so it never slows down starting or opening the first clip. */
const startDelayMs = 20_000;
/** How often to look again while ClipPress is busy (opening a clip, exporting). */
const busyRetryMs = 2000;

/**
 * Tidies ClipPress's projects folder, and old backups beside recordings, in the background after the start (#91, see
 * projectCleanup.ts): at most once a day, one file at a time and only while ClipPress is idle. Anything that fails is
 * logged and left as it is.
 */
export default function useProjectCleanup({ isBusy, deleteProjectFile, recentFiles, customOutDir }: {
  /** Whether ClipPress is opening a clip, exporting or otherwise busy. */
  isBusy: () => boolean,
  /** Deletes a project file between autosave's saves (see `ProjectAutoSave.deleteFile`). */
  deleteProjectFile: (path: string, remove: () => Promise<void>) => Promise<void>,
  recentFiles: readonly RecentFile[],
  customOutDir: string | undefined,
}) {
  // The latest ones, for the run that started with earlier ones.
  const isBusyRef = useRef(isBusy);
  const deleteRef = useRef(deleteProjectFile);
  const foldersRef = useRef({ recentFiles, customOutDir });
  useEffect(() => {
    isBusyRef.current = isBusy;
    deleteRef.current = deleteProjectFile;
    foldersRef.current = { recentFiles, customOutDir };
  });

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };

    const whenIdle = () => new Promise<void>((resolve) => {
      const check = () => {
        if (cancelled) resolve();
        else if (isBusyRef.current()) later(check, busyRetryMs);
        else requestIdleCallback(() => (!cancelled && isBusyRef.current() ? check() : resolve()), { timeout: busyRetryMs });
      };
      check();
    });

    later(() => {
      runProjectCleanup({
        trash: (path) => deleteRef.current(path, () => trashFile(path)),
        whenIdle,
        isCancelled: () => cancelled,
        recentMediaPaths: foldersRef.current.recentFiles.map(({ path }) => path),
        customOutDir: foldersRef.current.customOutDir,
      }).catch((err) => logProjectFiles('warn', `Project clean-up failed: ${err instanceof Error ? err.message : String(err)}`));
    }, startDelayMs);

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);
}
