import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import askToFindRecording from '../components/MissingRecordingDialog';
import type { ShowGenericDialog, useDialog } from '../components/GenericDialog';
import { showOpenDialog } from '../dialogs';
import { readFileFfprobeMeta } from '../ffmpeg';
import mainApi from '../mainApi';
import { getDurationMismatch } from '../missingRecording';
import { filterNotNewerThan } from '../projectFilesIo';
import { getProjectStoreEnv, getRelocatedProjectCopies } from '../projectStore';
import { videoExtensions } from '../shelf';
import type { LlcProject } from '../types';
import { formatDuration } from '../util/duration';
import { parseFfprobeDuration } from '../../../common/util.js';

const { basename, dirname } = window.require('path');

/** A recording opened from a new place, with the edits it had at the old one. */
export interface RelocatedRecording {
  /** Where it was. */
  mediaPath: string,
  /** Its edits left at the old place, to move to the Recycle Bin once they are saved for the new one. */
  projectCopies: string[],
}

async function probeDuration(path: string) {
  try {
    return parseFfprobeDuration((await readFileFfprobeMeta(path)).format.duration);
  } catch (err) {
    // Not a recording ffprobe can read: opening it says so.
    console.warn('Could not read the length of the recording found', path, err);
    return undefined;
  }
}

/**
 * A recording that isn't where its edits say (#16): asks the user to find it, and returns the file picked, with what
 * to retire from the old place. The edits then belong to the new place. Undefined when the user cancels.
 */
export default function useRelocateRecording({ showGenericDialog, confirmDialog, customOutDir }: {
  showGenericDialog: ShowGenericDialog,
  confirmDialog: ReturnType<typeof useDialog>['confirmDialog'],
  customOutDir: string | undefined,
}) {
  const { t } = useTranslation();

  return useCallback(async ({ oldMediaPath, project, projectPath }: {
    /** Where the recording was. */
    oldMediaPath: string,
    /** Its edits, if it has any, and the file they are loaded from. */
    project?: LlcProject | undefined,
    projectPath?: string | undefined,
  }): Promise<{ mediaPath: string, relocatedFrom: RelocatedRecording } | undefined> => {
    const folder = dirname(oldMediaPath);
    if (!(await askToFindRecording(showGenericDialog, { name: basename(oldMediaPath), folder }))) return undefined;

    const { canceled, filePaths } = await showOpenDialog({
      title: t('Find the recording'),
      properties: ['openFile'],
      // Starting where it was, while that folder is still there.
      ...((await mainApi.pathExists(folder)) ? { defaultPath: folder } : {}),
      filters: [{ name: t('Videos'), extensions: [...videoExtensions] }, { name: t('All Files'), extensions: ['*'] }],
    });
    const [mediaPath] = filePaths;
    if (canceled || mediaPath == null) return undefined;

    // Another recording can be picked on purpose (a re-encoded copy, say), but not by accident.
    if (project != null) {
      const duration = await probeDuration(mediaPath);
      const mismatch = getDurationMismatch(project, duration);
      if (mismatch != null && duration != null) {
        const format = (seconds: number) => formatDuration({ seconds, shorten: true, showFraction: false });
        const description = mismatch.kind === 'length'
          ? t('Your edits were made on a recording {{expected}} long, and this one is {{actual}} long. Open it with your edits anyway?', { expected: format(mismatch.expected), actual: format(duration) })
          : t('Your edits go up to {{expected}}, but this recording is only {{actual}} long. Open it with your edits anyway?', { expected: format(mismatch.expected), actual: format(duration) });
        if (!(await confirmDialog({ title: t('This recording is a different length'), description, confirmButtonText: t('Open anyway') }))) return undefined;
      }
    }

    const env = getProjectStoreEnv();
    // The old place's copies the opened edits supersede: not one saved later than them.
    const projectCopies = projectPath != null ? await filterNotNewerThan(getRelocatedProjectCopies(oldMediaPath, mediaPath, customOutDir, env), projectPath) : [];
    return { mediaPath, relocatedFrom: { mediaPath: oldMediaPath, projectCopies } };
  }, [confirmDialog, customOutDir, showGenericDialog, t]);
}
