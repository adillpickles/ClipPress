import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDebounce } from 'use-debounce';
import isEqual from 'lodash/isEqual';

import isDev from '../isDev';
import { buildLlcProjectData, saveLlcProject } from '../edlStore';
import { getSuffixedOutPath } from '../util';
import type { CustomTagsByFile, OverlayClip, ParamsByStreamId, StateSegment } from '../types';
import { errorToast } from '../swal';
import i18n from '../i18n';


export default ({ autoSaveProjectFile, storeProjectInWorkingDir, filePath, customOutDir, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  autoSaveProjectFile: boolean,
  storeProjectInWorkingDir: boolean,
  filePath: string | undefined,
  customOutDir: string | undefined,
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

  const currentSaveOperation = useMemo(() => {
    if (!projectFileSavePath || filePath == null) return undefined;
    return {
      cutSegments,
      customTagsByFile,
      paramsByStreamId,
      overlayClips,
      projectFileSavePath,
      filePath,
      projectData: buildLlcProjectData({ mediaFilePath: filePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }),
    };
  }, [cutSegments, customTagsByFile, filePath, overlayClips, paramsByStreamId, projectFileSavePath]);

  // NOTE: Could lose a save if user closes too fast, but not a big issue I think
  const [debouncedSaveOperation] = useDebounce(currentSaveOperation, isDev ? 2000 : 500);

  const lastSaveOperation = useRef<{ projectData: ReturnType<typeof buildLlcProjectData>, projectFileSavePath: string }>();

  useEffect(() => {
    async function save() {
      try {
        if (!autoSaveProjectFile
          || !debouncedSaveOperation
          || debouncedSaveOperation.filePath == null
          // Don't create llc file if no segments yet
          || debouncedSaveOperation.cutSegments.length === 0
          // or if initial segment (and not deselected): https://github.com/mifi/lossless-cut/issues/2745#issuecomment-3979480707
          || (debouncedSaveOperation.cutSegments[0]?.initial && debouncedSaveOperation.cutSegments[0].selected)
        ) {
          return;
        }

        if (lastSaveOperation.current && lastSaveOperation.current.projectFileSavePath === debouncedSaveOperation.projectFileSavePath && isEqual(lastSaveOperation.current.projectData, debouncedSaveOperation.projectData)) {
          console.log('Project unchanged, skipping save');
          return;
        }

        console.log('Saving project file', debouncedSaveOperation.projectFileSavePath, debouncedSaveOperation.cutSegments);
        await saveLlcProject({
          savePath: debouncedSaveOperation.projectFileSavePath,
          mediaFilePath: debouncedSaveOperation.filePath,
          cutSegments: debouncedSaveOperation.cutSegments,
          customTagsByFile: debouncedSaveOperation.customTagsByFile,
          paramsByStreamId: debouncedSaveOperation.paramsByStreamId,
          overlayClips: debouncedSaveOperation.overlayClips,
        });
        lastSaveOperation.current = {
          projectData: debouncedSaveOperation.projectData,
          projectFileSavePath: debouncedSaveOperation.projectFileSavePath,
        };
      } catch (err) {
        errorToast(i18n.t('Unable to save project file'));
        console.error('Failed to save project file', err);
      }
    }
    save();
  }, [debouncedSaveOperation, autoSaveProjectFile]);

  return {
    getEdlFilePath,
    projectFileSavePath,
    getProjectFileSavePath,
  };
};
