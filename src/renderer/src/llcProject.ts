import { isDurationValid, mapSaveableSegments } from './segments';
import type { CustomTagsByFile, LlcProject, OverlayClip, ParamsByStreamId, StateSegment, StreamParams } from './types';

/** Stream params as stored: unset values (e.g. gain reset to 0 dB) are left out. */
function getSetStreamParams(params: StreamParams) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as StreamParams;
}

function serializeProjectStreamEdits({ mediaFilePath, customTagsByFile, paramsByStreamId }: {
  mediaFilePath: string,
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
}): LlcProject['streamEdits'] {
  const customTags = customTagsByFile?.[mediaFilePath];
  const hasCustomTags = customTags != null && Object.keys(customTags).length > 0;
  const fileStreamParams = paramsByStreamId?.get(mediaFilePath);
  const streamParams = fileStreamParams != null
    ? [...fileStreamParams.entries()]
      .map(([streamId, params]) => ({ streamId, params: getSetStreamParams(params) }))
      .filter(({ params }) => Object.keys(params).length > 0)
      .sort(({ streamId: streamIdA }, { streamId: streamIdB }) => streamIdA - streamIdB)
    : [];

  if (!hasCustomTags && streamParams.length === 0) return undefined;

  return {
    ...(hasCustomTags ? { customTags } : {}),
    ...(streamParams.length > 0 ? { streamParams } : {}),
  };
}

/**
 * A project's contents. No segments means the whole file, untouched: see `encodeLlcProjectFile`
 * for how that is stored.
 */
export function buildLlcProjectData({ mediaFileName, mediaFilePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  mediaFileName: string,
  mediaFilePath: string,
  cutSegments: StateSegment[],
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
  overlayClips?: OverlayClip[] | undefined,
}): LlcProject {
  return {
    version: 3,
    mediaFileName,
    mediaFilePath,
    cutSegments: mapSaveableSegments(cutSegments),
    streamEdits: serializeProjectStreamEdits({ mediaFilePath, customTagsByFile, paramsByStreamId }),
    ...(overlayClips != null && overlayClips.length > 0 ? { overlayClips } : {}),
  };
}

/** The full-file segment a file opens with, before the user changes or deselects it. */
export function isUntouchedInitialSegment(segments: readonly StateSegment[]) {
  return segments.length === 1 && segments[0]!.initial === true && segments[0]!.selected;
}

/**
 * The segments a project's contents hold. The untouched full-file segment is left out, the same
 * as no segments at all: both mean the whole file, and opening the media recreates the segment.
 */
export function getProjectSegmentsToSave(segments: StateSegment[]) {
  return isUntouchedInitialSegment(segments) ? [] : segments;
}

/**
 * A project as written to its file.
 *
 * Every version 3 reader, including released ClipPress versions, rejects a project without
 * segments before reading the rest of it (text, gain). So the whole file is stored as one
 * full-length segment, which those readers load as an ordinary segment. The `initial` flag, which
 * they ignore, tells newer readers that it is the untouched whole file rather than a segment the
 * user made (see `getProjectSegmentsToLoad`). The format stays version 3: older readers still read
 * everything in it.
 */
export function encodeLlcProjectFile(project: LlcProject, fileDuration: number | undefined): LlcProject {
  if (project.cutSegments.length > 0) return project;
  return {
    ...project,
    cutSegments: [{ start: 0, ...(isDurationValid(fileDuration) ? { end: fileDuration } : {}), name: '', selected: true, initial: true }],
  };
}

/**
 * The file also notes the recording's length (`mediaDuration`), so that edits opened with a recording found somewhere
 * else can be checked against it. Not part of the project's contents: a change of it alone is not saved.
 */
export function withMediaDuration(file: LlcProject, fileDuration: number | undefined): LlcProject {
  return isDurationValid(fileDuration) ? { ...file, mediaDuration: fileDuration } : file;
}

/** The segments to load from a project file. None for the whole file: opening the media creates its segment. */
export function getProjectSegmentsToLoad(project: LlcProject) {
  const [first, ...rest] = project.cutSegments;
  const isWholeFile = first == null || (rest.length === 0 && first.initial === true && first.selected !== false);
  return isWholeFile ? [] : project.cutSegments;
}

/** Whether a project holds anything that opening its media file would not produce by itself. */
export function hasProjectEdits(project: LlcProject) {
  return project.cutSegments.length > 0 || project.streamEdits != null || (project.overlayClips?.length ?? 0) > 0;
}
