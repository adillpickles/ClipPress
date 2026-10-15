import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

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
    // NOTE: Could lose a save if the app quits this soon after an edit (closing the file saves at once)
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

  const endProjectSession = useCallback(() => autoSave.endSession(), [autoSave]);
  const whenProjectSaved = useCallback(() => autoSave.whenSaved(), [autoSave]);

  return {
    getEdlFilePath,
    projectFileSavePath,
    getProjectFileSavePath,
    endProjectSession,
    whenProjectSaved,
  };
};
