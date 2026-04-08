import JSON5 from 'json5';
import i18n from 'i18next';
import invariant from 'tiny-invariant';
import { ZodError } from 'zod';

import { parseSrtToSegments, formatSrt, parseCuesheet, parseXmeml, parseFcpXml, parseCsv, parseCutlist, parsePbf, parseEdl, formatCsvHuman, formatTsvHuman, formatCsvFrames, formatCsvSeconds, parseCsvTime, getFrameValParser, parseDvAnalyzerSummaryTxt, parseOtio } from './edlFormats';
import { askForYouTubeInput, showOpenDialog } from './dialogs';
import { getOutPath } from './util';
import type { CustomTagsByFile, EdlExportType, EdlFileType, EdlImportType, GetFrameCount, LlcProject, OverlayClip, ParamsByStreamId, SegmentBase, StateSegment } from './types';
import { llcProjectV1Schema, llcProjectV2Schema, llcProjectV3Schema } from './types';
import { mapSaveableSegments } from './segments';
import isDev from './isDev';

const { readFile, writeFile } = window.require('fs/promises');
const cueParser = window.require('cue-parser');
const { basename } = window.require('path');

const { dialog } = window.require('@electron/remote');


// When readFile is used with 'utf8', ef bb bf is its UTF-8 representation of BOM. As BOM is considered white-space, it can be stripped by .trim(). Node.js does not strip BOM, it is a userland task.
// https://github.com/nodejs/node/issues/20649#issuecomment-388016410
const trimBom = (text: string) => text.trim();

async function loadCsv(path: string, parseTimeFn: (a: string) => number | undefined) {
  return parseCsv(trimBom(await readFile(path, 'utf8')), parseTimeFn);
}

async function loadCutlistSeconds(path: string) {
  return parseCutlist(trimBom(await readFile(path, 'utf8')));
}

async function loadXmeml(path: string) {
  return parseXmeml(await readFile(path, 'utf8'));
}

async function loadFcpXml(path: string) {
  return parseFcpXml(await readFile(path, 'utf8'));
}

async function loadDvAnalyzerSummaryTxt(path: string) {
  return parseDvAnalyzerSummaryTxt(trimBom(await readFile(path, 'utf8')));
}

async function loadPbf(path: string) {
  return parsePbf(await readFile(path));
}

async function loadEdl(path: string, fps: number) {
  return parseEdl(trimBom(await readFile(path, 'utf8')), fps);
}

async function loadCue(path: string) {
  return parseCuesheet(cueParser.parse(path));
}

async function loadSrt(path: string) {
  return parseSrtToSegments(await readFile(path, 'utf8'));
}

export async function saveCsv(path: string, cutSegments: SegmentBase[]) {
  await writeFile(path, formatCsvSeconds(cutSegments));
}

export async function saveCsvHuman(path: string, cutSegments: SegmentBase[]) {
  await writeFile(path, formatCsvHuman(cutSegments));
}

export async function saveCsvFrames({ path, cutSegments, getFrameCount }: {
  path: string,
  cutSegments: SegmentBase[],
  getFrameCount: GetFrameCount,
}) {
  await writeFile(path, formatCsvFrames({ cutSegments, getFrameCount }));
}

export async function saveTsv(path: string, cutSegments: SegmentBase[]) {
  await writeFile(path, formatTsvHuman(cutSegments));
}

export async function saveSrt(path: string, cutSegments: SegmentBase[]) {
  await writeFile(path, formatSrt(cutSegments));
}

function serializeProjectStreamEdits({ mediaFilePath, customTagsByFile, paramsByStreamId }: {
  mediaFilePath: string,
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
}): LlcProject['streamEdits'] {
  const customTags = customTagsByFile?.[mediaFilePath];
  const fileStreamParams = paramsByStreamId?.get(mediaFilePath);
  const streamParams = fileStreamParams != null
    ? [...fileStreamParams.entries()]
      .filter(([, params]) => Object.keys(params).length > 0)
      .sort(([streamIdA], [streamIdB]) => streamIdA - streamIdB)
      .map(([streamId, params]) => ({ streamId, params: { ...params } }))
    : undefined;

  if (customTags == null && (streamParams == null || streamParams.length === 0)) return undefined;

  return {
    ...(customTags != null ? { customTags } : {}),
    ...(streamParams != null && streamParams.length > 0 ? { streamParams } : {}),
  };
}

export function buildLlcProjectData({ mediaFilePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  mediaFilePath: string,
  cutSegments: StateSegment[],
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
  overlayClips?: OverlayClip[] | undefined,
}): LlcProject {
  return {
    version: 3,
    mediaFileName: basename(mediaFilePath),
    cutSegments: mapSaveableSegments(cutSegments),
    streamEdits: serializeProjectStreamEdits({ mediaFilePath, customTagsByFile, paramsByStreamId }),
    ...(overlayClips != null && overlayClips.length > 0 ? { overlayClips } : {}),
  };
}

export async function saveLlcProject({ savePath, mediaFilePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips }: {
  savePath: string,
  mediaFilePath: string,
  cutSegments: StateSegment[],
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
  overlayClips?: OverlayClip[] | undefined,
}) {
  const projectData = buildLlcProjectData({ mediaFilePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips });
  await writeFile(savePath, JSON5.stringify(projectData, null, 2));
}

export async function loadLlcProject(path: string) {
  const json = JSON5.parse(await readFile(path, 'utf8'));

  async function doLoad(): Promise<LlcProject> {
    // todo probably remove migration in future
    try {
      return llcProjectV3Schema.parse(json);
    } catch (err) {
      if (err instanceof ZodError) {
        try {
          const project = llcProjectV2Schema.parse(json);
          console.log('Converting v2 project to v3');
          return {
            ...project,
            version: 3,
          };
        } catch (v2Err) {
          if (v2Err instanceof ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { cutSegments, version: _ignored, ...restProject } = llcProjectV1Schema.parse(json);
            console.log('Converting v1 project to v3');
            return {
              ...restProject,
              version: 3,
              cutSegments: cutSegments.map(({ start, ...restSeg }) => ({
                ...restSeg,
                start: start ?? 0, // v1 allowed undefined for "start", which we no longer allow as of v2
              })),
            };
          }
          throw v2Err;
        }
      }
      throw err;
    }
  }

  const project = await doLoad();
  console.log(`Loaded LLC project v${project.version}, mediaFileName: ${project.mediaFileName}, ${project.cutSegments.length} segments`);
  if (isDev) console.log(project);
  return project;
}

export async function loadOtio(path: string) {
  return parseOtio(JSON.parse(await readFile(path, 'utf8')));
}

export async function readEdlFile({ type, path, fps }: {
  type: EdlFileType,
  path: string,
  fps: number | undefined,
}) {
  if (type === 'csv') return loadCsv(path, parseCsvTime);
  if (type === 'csv-frames' || type === 'edl') {
    invariant(fps != null, 'The loaded media has an unknown framerate');
    if (type === 'csv-frames') return loadCsv(path, getFrameValParser(fps));
    if (type === 'edl') return loadEdl(path, fps);
  }
  if (type === 'cutlist') return loadCutlistSeconds(path);
  if (type === 'xmeml') return loadXmeml(path);
  if (type === 'fcpxml') return loadFcpXml(path);
  if (type === 'dv-analyzer-summary-txt') return loadDvAnalyzerSummaryTxt(path);
  if (type === 'cue') return loadCue(path);
  if (type === 'pbf') return loadPbf(path);
  if (type === 'srt') return loadSrt(path);
  if (type === 'otio') return loadOtio(path);
  if (type === 'llc') {
    const project = await loadLlcProject(path);
    return project.cutSegments;
  }
  throw new Error('Invalid EDL type');
}

export async function askForEdlImport({ type, fps, fileDuration }: { type: EdlImportType, fps?: number | undefined, fileDuration?: number | undefined }) {
  if (type === 'youtube') return askForYouTubeInput({ fileDuration });

  let filters;
  // eslint-disable-next-line unicorn/prefer-switch
  if (type === 'csv' || type === 'csv-frames') filters = [{ name: i18n.t('CSV files'), extensions: ['csv'] }];
  else if (type === 'xmeml') filters = [{ name: i18n.t('XML files'), extensions: ['xml'] }];
  else if (type === 'fcpxml') filters = [{ name: i18n.t('FCPXML files'), extensions: ['fcpxml'] }];
  else if (type === 'cue') filters = [{ name: i18n.t('CUE files'), extensions: ['cue'] }];
  else if (type === 'pbf') filters = [{ name: i18n.t('PBF files'), extensions: ['pbf'] }];
  else if (type === 'edl') filters = [{ name: i18n.t('EDL'), extensions: ['*'] }];
  else if (type === 'dv-analyzer-summary-txt') filters = [{ name: i18n.t('DV Analyzer Summary.txt'), extensions: ['txt'] }];
  else if (type === 'srt') filters = [{ name: i18n.t('Subtitles (SRT)'), extensions: ['srt'] }];
  else if (type === 'llc') filters = [{ name: i18n.t('ClipPress project'), extensions: ['llc'] }];

  const { canceled, filePaths } = await showOpenDialog({
    properties: ['openFile'],
    title: i18n.t('Import project'),
    ...(filters && { filters }),
  });
  const [firstFilePath] = filePaths;
  if (canceled || firstFilePath == null) return [];
  return readEdlFile({ type, path: firstFilePath, fps });
}

export async function exportEdlFile({ type, cutSegments, customOutDir, filePath, getFrameCount, customTagsByFile, paramsByStreamId, overlayClips }: {
  type: EdlExportType,
  cutSegments: StateSegment[],
  customOutDir?: string | undefined,
  filePath?: string | undefined,
  getFrameCount: GetFrameCount,
  customTagsByFile?: CustomTagsByFile | undefined,
  paramsByStreamId?: ParamsByStreamId | undefined,
  overlayClips?: OverlayClip[] | undefined,
}) {
  invariant(filePath != null);

  let filters: { name: string, extensions: string[] }[] | undefined;
  let ext: string | undefined;
  // eslint-disable-next-line unicorn/prefer-switch
  if (type === 'csv') {
    ext = 'csv';
    filters = [{ name: i18n.t('CSV files'), extensions: [ext, 'txt'] }];
  } else if (type === 'tsv-human') {
    ext = 'tsv';
    filters = [{ name: i18n.t('TXT files'), extensions: [ext, 'txt'] }];
  } else if (type === 'csv-human') {
    ext = 'csv';
    filters = [{ name: i18n.t('TXT files'), extensions: [ext, 'txt'] }];
  } else if (type === 'csv-frames') {
    ext = 'csv';
    filters = [{ name: i18n.t('TXT files'), extensions: [ext, 'txt'] }];
  } else if (type === 'srt') {
    ext = 'srt';
    filters = [{ name: i18n.t('Subtitles (SRT)'), extensions: [ext, 'txt'] }];
  } else if (type === 'llc') {
    ext = 'llc';
    filters = [{ name: i18n.t('ClipPress project'), extensions: [ext, 'llc'] }];
  }

  const defaultPath = getOutPath({ filePath, customOutDir, fileName: `${basename(filePath)}.${ext}` });

  const { canceled, filePath: savePath } = await dialog.showSaveDialog({ defaultPath, title: i18n.t('Export project'), ...(filters != null ? { filters } : {}) });
  if (canceled || !savePath) return;
  console.log('Saving', type, savePath);
  // eslint-disable-next-line unicorn/prefer-switch
  if (type === 'csv') await saveCsv(savePath, cutSegments);
  else if (type === 'tsv-human') await saveTsv(savePath, cutSegments);
  else if (type === 'csv-human') await saveCsvHuman(savePath, cutSegments);
  else if (type === 'csv-frames') await saveCsvFrames({ path: savePath, cutSegments, getFrameCount });
  else if (type === 'llc') await saveLlcProject({ savePath, mediaFilePath: filePath, cutSegments, customTagsByFile, paramsByStreamId, overlayClips });
  else if (type === 'srt') await saveSrt(savePath, cutSegments);
}
