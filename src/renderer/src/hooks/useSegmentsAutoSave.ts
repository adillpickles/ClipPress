import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import isDev from '../isDev';
import { buildLlcProjectData, writeLlcProject } from '../edlStore';
import { encodeLlcProjectFile, getProjectSegmentsToSave, withMediaDuration } from '../llcProject';
import ProjectAutoSave from '../projectAutoSave';
import createProjectFilePathKey from '../projectFilePathKey';
import type { ProjectSession, ProjectSnapshot } from '../projectAutoSave';
import { getSuffixedOutPath, isWindows } from '../util';
import type { CustomTagsByFile, OverlayClip, ParamsByStreamId, StateSegment } from '../types';
import type { ProjectFileLocation } from '../../../common/types';
import { getProjectSavePaths, getProjectStoreEnv } from '../projectStore';
import { errorToast } from '../swal';
import i18n from '../i18n';

const path = window.require('path');
const { realpathSync, statSync } = window.require('fs');
const { lstat } = window.require('fs/promises');

/** Throws when it cannot tell, rather than saying that a file it cannot see is gone. */
async function fileExists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return false;
    throw err;
  }
}


export default ({ autoSaveProjectFile, projectFileLocation, filePath, projectSession, customOutDir, fileDuration, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  autoSaveProjectFile: boolean,
  projectFileLocation: ProjectFileLocation,
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
  // A project next to a file (or in the export folder): older versions, and the opt-in settings.
  const getEdlFilePath = useCallback((fp?: string, cod?: string) => getSuffixedOutPath({ customOutDir: cod, filePath: fp, nameSuffix: projectSuffix }), []);
  // By default in ClipPress's own folder, so recording folders stay clean (see projectStore.ts). "Both" also keeps a
  // copy next to the recording: the main place first.
  const getProjectFileSavePaths = useCallback((location: ProjectFileLocation) => (filePath != null ? getProjectSavePaths(filePath, location, customOutDir, getProjectStoreEnv()) : undefined), [filePath, customOutDir]);
  const projectFileSavePaths = useMemo(() => getProjectFileSavePaths(projectFileLocation), [getProjectFileSavePaths, projectFileLocation]);
  const projectFileSavePath = projectFileSavePaths?.[0];

  const [autoSave] = useState(() => new ProjectAutoSave({
    // Closing the file or the app saves at once (see `flushProject`), as does leaving the window.
    delayMs: isDev ? 2000 : 500,
    write: writeLlcProject,
    onError: (err) => {
      errorToast(i18n.t('Unable to save project file'));
      console.error('Failed to save project file', err);
    },
    pathKey: createProjectFilePathKey({ path, caseInsensitive: isWindows, realpath: (dir) => realpathSync.native(dir), identity: (dir) => statSync(dir, { bigint: true }) }),
  }));

  const snapshot = useMemo<ProjectSnapshot | undefined>(() => {
    if (projectSession == null || filePath == null || projectFileSavePaths == null || !projectFileSavePath) return undefined;
    const project = buildLlcProjectData({ mediaFilePath: filePath, cutSegments: getProjectSegmentsToSave(cutSegments), customTagsByFile, paramsByStreamId, overlayClips });
    return { session: projectSession, path: projectFileSavePath, copyPaths: projectFileSavePaths.slice(1), project, fileData: withMediaDuration(encodeLlcProjectFile(project, fileDuration), fileDuration) };
  }, [cutSegments, customTagsByFile, fileDuration, filePath, overlayClips, paramsByStreamId, projectFileSavePath, projectFileSavePaths, projectSession]);

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
  const hasSavedProject = useCallback((sessionId: number, projectPath: string) => autoSave.hasSaved(sessionId, projectPath), [autoSave]);
  const deleteProjectFile = useCallback((projectPath: string, remove: () => Promise<void>) => autoSave.deleteFile(projectPath, { remove, exists: fileExists }), [autoSave]);

  return {
    getEdlFilePath,
    projectFileSavePath,
    projectFileSavePaths,
    getProjectFileSavePaths,
    endProjectSession,
    whenProjectSaved,
    saveProjectNow,
    flushProject,
    hasUnsavedProjectChanges,
    hasSavedProject,
    deleteProjectFile,
  };
};
