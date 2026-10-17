import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import isDev from '../isDev';
import { buildLlcProjectData, writeLlcProject } from '../edlStore';
import { encodeLlcProjectFile, getProjectSegmentsToSave } from '../llcProject';
import ProjectAutoSave from '../projectAutoSave';
import type { ProjectSession, ProjectSnapshot } from '../projectAutoSave';
import { getSuffixedOutPath } from '../util';
import type { CustomTagsByFile, OverlayClip, ParamsByStreamId, StateSegment } from '../types';
import { errorToast } from '../swal';
import i18n from '../i18n';


export default ({ autoSaveProjectFile, storeProjectInWorkingDir, filePath, projectSession, customOutDir, fileDuration, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  autoSaveProjectFile: boolean,
  storeProjectInWorkingDir: boolean,
  filePath: string | undefined,
  /** The open of `filePath` the state belongs to. */
  projectSession: ProjectSession | undefined,
  customOutDir: string | undefined,
  fileDuration: number | undefined,
  cutSegments: StateSegment[],
  customTagsByFile: CustomTagsByFile,
  paramsByStreamId: ParamsByStreamId,
  overlayClips: OverlayClip[],
}) => {
  const projectSuffix = 'proj.llc';
  // New LLC format can be stored along with input file or in working dir (customOutDir)
  const getEdlFilePath = useCallback((fp?: string, cod?: string) => getSuffixedOutPath({ customOutDir: cod, filePath: fp, nameSuffix: projectSuffix }), []);
  const getProjectFileSavePath = useCallback((storeProjectInWorkingDirIn: boolean) => getEdlFilePath(filePath, storeProjectInWorkingDirIn ? customOutDir : undefined), [getEdlFilePath, filePath, customOutDir]);
  const projectFileSavePath = useMemo(() => getProjectFileSavePath(storeProjectInWorkingDir), [getProjectFileSavePath, storeProjectInWorkingDir]);

  const [autoSave] = useState(() => new ProjectAutoSave({
    // Closing the file or the app saves at once (see `flushProject`), as does leaving the window.
    delayMs: isDev ? 2000 : 500,
    write: writeLlcProject,
    onError: (err) => {
      errorToast(i18n.t('Unable to save project file'));
      console.error('Failed to save project file', err);
    },
  }));

  const snapshot = useMemo<ProjectSnapshot | undefined>(() => {
    if (projectSession == null || filePath == null || !projectFileSavePath) return undefined;
    const project = buildLlcProjectData({ mediaFilePath: filePath, cutSegments: getProjectSegmentsToSave(cutSegments), customTagsByFile, paramsByStreamId, overlayClips });
    return { session: projectSession, path: projectFileSavePath, project, fileData: encodeLlcProjectFile(project, fileDuration) };
  }, [cutSegments, customTagsByFile, fileDuration, filePath, overlayClips, paramsByStreamId, projectFileSavePath, projectSession]);

  // A layout effect, so autosave has every committed state before any later event can close the file.
  useLayoutEffect(() => {
    autoSave.update(snapshot, { enabled: autoSaveProjectFile });
  }, [autoSave, autoSaveProjectFile, snapshot]);

  // Losing focus or being hidden often comes right before the app is terminated without closing
  // normally: an installer or Task Manager ending it, or the session ending. Save a waiting change now.
  useEffect(() => {
    const saveNow = () => autoSave.saveNow();
    const saveNowIfHidden = () => { if (document.visibilityState === 'hidden') autoSave.saveNow(); };
    window.addEventListener('blur', saveNow);
    document.addEventListener('visibilitychange', saveNowIfHidden);
    return () => {
      window.removeEventListener('blur', saveNow);
      document.removeEventListener('visibilitychange', saveNowIfHidden);
    };
  }, [autoSave]);

  const endProjectSession = useCallback(() => autoSave.endSession(), [autoSave]);
  const whenProjectSaved = useCallback(() => autoSave.whenSaved(), [autoSave]);
  const saveProjectNow = useCallback(() => autoSave.saveNow(), [autoSave]);
  const flushProject = useCallback(() => autoSave.flush(), [autoSave]);
  const hasUnsavedProjectChanges = useCallback(() => autoSave.hasUnsavedChanges(), [autoSave]);
  const discardFailedProjectSave = useCallback((path: string) => autoSave.discardFailedSave(path), [autoSave]);

  return {
    getEdlFilePath,
    projectFileSavePath,
    getProjectFileSavePath,
    endProjectSession,
    whenProjectSaved,
    saveProjectNow,
    flushProject,
    hasUnsavedProjectChanges,
    discardFailedProjectSave,
  };
};
