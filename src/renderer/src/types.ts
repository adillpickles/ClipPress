import type { MenuItem, MenuItemConstructorOptions } from 'electron';
import { z } from 'zod';
import type { FFprobeChapter, FFprobeFormat, FFprobeStream } from '../../common/ffprobe';
import type { FileStream } from './ffmpeg';


export interface ChromiumHTMLVideoElement extends HTMLVideoElement {
  videoTracks?: { id: string, selected: boolean }[]
}
export interface ChromiumHTMLAudioElement extends HTMLAudioElement {
  audioTracks?: { id: string, enabled: boolean }[]
}

export const openFilesActionArgsSchema = z.tuple([z.string().array()]);
export type OpenFilesActionArgs = z.infer<typeof openFilesActionArgsSchema>

export const goToTimecodeDirectArgsSchema = z.tuple([z.object({ time: z.string() })]);
export type GoToTimecodeDirectArgs = z.infer<typeof goToTimecodeDirectArgsSchema>

export const awaitEventArgsSchema = z.tuple([z.object({ eventName: z.string() })]);
export type AwaitEventArgs = z.infer<typeof awaitEventArgsSchema>;

export const segmentTagsSchema = z.record(z.string(), z.string());

export type SegmentTags = z.infer<typeof segmentTagsSchema>

export type EditingSegmentTags = Record<string, SegmentTags>

export const llcProjectSaveableSegmentSchema = z.object({
  start: z.number(),
  end: z.number().optional(),
  name: z.string(),
  tags: segmentTagsSchema.optional(),
  selected: z.boolean().optional(),
});

export const streamParamsSchema = z.object({
  customTags: z.record(z.string(), z.string()).optional(),
  disposition: z.string().optional(),
  bsfH264Mp4toannexb: z.boolean().optional(),
  bsfHevcMp4toannexb: z.boolean().optional(),
  bsfHevcAudInsert: z.boolean().optional(),
  tag: z.string().optional(),
  audioGainDb: z.number().optional(),
});

export type StreamParams = z.infer<typeof streamParamsSchema>;

export const llcProjectStreamEditSchema = z.object({
  streamId: z.number(),
  params: streamParamsSchema,
});

export type ProjectStreamEdit = z.infer<typeof llcProjectStreamEditSchema>;

export const overlayBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type OverlayBox = z.infer<typeof overlayBoxSchema>;

export const textOverlayClipSchema = z.object({
  overlayId: z.string(),
  type: z.literal('text'),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  box: overlayBoxSchema,
});

export type TextOverlayClip = z.infer<typeof textOverlayClipSchema>;
export type OverlayClip = TextOverlayClip;

// todo remove some time in the future
export const llcProjectV1Schema = z.object({
  version: z.literal(1),
  mediaFileName: z.string().optional(),
  cutSegments: z.object({
    start: z.number().optional(),
    end: z.number().optional(),
    name: z.string(),
    tags: segmentTagsSchema.optional(),
  }).array(),
});

export const llcProjectV2Schema = z.object({
  version: z.literal(2),
  mediaFileName: z.string().optional(),
  cutSegments: llcProjectSaveableSegmentSchema.array(),
});

export const llcProjectV3Schema = z.object({
  version: z.literal(3),
  mediaFileName: z.string().optional(),
  cutSegments: llcProjectSaveableSegmentSchema.array(),
  streamEdits: z.object({
    customTags: z.record(z.string(), z.string()).optional(),
    streamParams: llcProjectStreamEditSchema.array().optional(),
  }).optional(),
  overlayClips: textOverlayClipSchema.array().optional(),
});

export type LlcProject = z.infer<typeof llcProjectV3Schema>

export interface SegmentBase {
  start: number,
  end?: number | undefined,
  name?: string | undefined,
}

export interface DefiniteSegmentBase {
  start: number,
  end: number,
}

export interface SegmentColorIndex {
  segColorIndex: number,
}

export interface StateSegment extends SegmentBase, SegmentColorIndex {
  name: string;
  segId: string;
  tags?: SegmentTags | undefined;
  initial?: true,
  selected: boolean,
}

export interface SegmentToExport extends DefiniteSegmentBase {
  originalIndex: number,
  name?: string | undefined;
  tags?: SegmentTags | undefined;
}

export interface InverseCutSegment extends DefiniteSegmentBase {
  segId: string;
}


export type PlaybackMode = 'loop-segment-start-end' | 'loop-segment' | 'play-segment-once' | 'play-selected-segments' | 'loop-selected-segments';

export type EdlFileType = 'llc' | 'csv' | 'csv-frames' | 'cutlist' | 'xmeml' | 'fcpxml' | 'dv-analyzer-summary-txt' | 'cue' | 'pbf' | 'edl' | 'srt' | 'otio';

export type EdlImportType = 'youtube' | EdlFileType;

export type EdlExportType = 'csv' | 'tsv-human' | 'csv-human' | 'csv-frames' | 'srt' | 'llc';

export type TunerType = 'wheelSensitivity' | 'waveformHeight' | 'keyboardNormalSeekSpeed' | 'keyboardSeekSpeed2' | 'keyboardSeekSpeed3' | 'keyboardSeekAccFactor';

export interface WaveformBase {
  createdAt: Date,
}

export interface WaveformSlice extends WaveformBase {
  from: number,
  to: number,
  duration: number,
  url?: string, // undefined while rendering
  failed?: true, // if failed to render
}

export interface OverviewWaveform extends WaveformBase {
  url: string,
}

export type RenderableWaveform = WaveformSlice | OverviewWaveform;

export type FfmpegCommandLog = { command: string, time: Date }[];

export type {
  SizeLimitedEncoderCapabilities,
  SizeLimitedEncoderName,
  SizeLimitedEncoderPreset,
  SizeLimitedExecutionMode,
  SizeLimitedExecutionResult,
  SizeLimitedExportOptions,
  SizeLimitedHardwareTarget,
  SizeLimitedPlan,
  SizeLimitedPlannerProfileId,
  SizeLimitedProgressMetadata,
  SizeLimitedResolvedStrategy,
  SizeLimitedRetryStep,
  SizeLimitedStrategyId,
  SizeLimitedTuningProfile,
} from './sizeLimitedTypes';

export interface Thumbnail {
  time: number
  url: string
}

export type FormatTimecode = (a: { seconds: number, shorten?: boolean | undefined, fileNameFriendly?: boolean | undefined }) => string;
export type ParseTimecode = (val: string) => number | undefined;

export type GetFrameCount = (sec: number) => number | undefined;

export type UpdateSegAtIndex = (index: number, newProps: Partial<StateSegment>) => void;

export type ContextMenuTemplate = (MenuItemConstructorOptions | MenuItem)[];

export type ExportMode = 'segments_to_chapters' | 'merge' | 'merge+separate' | 'separate';

export type FilesMeta = Record<string, {
  streams: FileStream[];
  format: FFprobeFormat;
  chapters: FFprobeChapter[];
}>

export type CopyfileStreams = {
  path: string;
  streamIds: number[];
}[]

export interface Chapter { start: number, end: number, name?: string | undefined }

export type LiteFFprobeStream = Pick<FFprobeStream, 'index' | 'codec_type' | 'codec_tag' | 'codec_name' | 'disposition' | 'tags' | 'sample_rate' | 'time_base'>;

export interface FileStats {
  size: number | bigint,
  atime: number,
  mtime: number,
  ctime: number,
  birthtime: number,
}

export type AllFilesMeta = Record<string, {
  streams: LiteFFprobeStream[];
  format: FFprobeFormat;
  chapters: FFprobeChapter[];
}>

export type CustomTagsByFile = Record<string, Record<string, string>>;

export type ParamsByStreamId = Map<string, Map<number, StreamParams>>;

export interface BatchFile {
  path: string,
  name: string,
}

export type KeyboardLayoutMap = Map<string, string>;
