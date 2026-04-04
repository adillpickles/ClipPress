import type { MenuItem, MenuItemConstructorOptions } from 'electron';
import { z } from 'zod';
import type { FFprobeChapter, FFprobeFormat, FFprobeStream } from '../../common/ffprobe';
import type {
  ExportEncodeMode,
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitCodec,
  SizeLimitControlMode,
  SizeLimitPreset,
  SizeLimitSimpleResolution,
} from '../../common/types.js';
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
  cutSegments: z.object({
    start: z.number(),
    end: z.number().optional(),
    name: z.string(),
    tags: segmentTagsSchema.optional(),
    selected: z.boolean().optional(),
  }).array(),
});

export type LlcProject = z.infer<typeof llcProjectV2Schema>

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

export interface SizeLimitedExportOptions {
  mode: ExportEncodeMode,
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  simpleResolution: SizeLimitSimpleResolution,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
}

export interface SizeLimitedEncoderCapabilities {
  h264Nvenc: boolean,
  av1Nvenc: boolean,
  libx264: boolean,
  libsvtav1: boolean,
}

export type SizeLimitedStrategyId =
  | 'max_quality_av1_cpu_two_pass'
  | 'max_quality_av1_nvenc_two_pass'
  | 'max_quality_h264_cpu_two_pass'
  | 'max_quality_h264_nvenc_two_pass'
  | 'quality_av1_nvenc'
  | 'quality_av1_cpu'
  | 'quality_h264_cpu'
  | 'fast_av1_nvenc'
  | 'fast_h264_cpu'
  | 'advanced_av1_cpu_single_pass'
  | 'advanced_av1_cpu_two_pass'
  | 'advanced_av1_nvenc_single_pass'
  | 'advanced_av1_nvenc_two_pass'
  | 'advanced_h264_cpu_single_pass'
  | 'advanced_h264_cpu_two_pass'
  | 'advanced_h264_nvenc_single_pass'
  | 'advanced_h264_nvenc_two_pass';

export type SizeLimitedEncoderName = 'h264_nvenc' | 'av1_nvenc' | 'libx264' | 'libsvtav1';

export type SizeLimitedHardwareTarget = 'nvidia' | 'cpu';

export type SizeLimitedExecutionMode = 'single_pass' | 'ffmpeg_two_pass';

export type SizeLimitedTuningProfile = 'max_quality' | 'quality' | 'fast' | 'advanced';

export type SizeLimitedPlannerProfileId = SizeLimitedStrategyId;

export type SizeLimitedEncoderPreset = SizeLimitAdvancedAv1CpuPreset | SizeLimitAdvancedNvencPreset | SizeLimitAdvancedH264CpuPreset;

export interface SizeLimitedResolvedStrategy {
  controlMode: SizeLimitControlMode,
  preset?: SizeLimitPreset | undefined,
  requestedAdvancedEncoder?: SizeLimitAdvancedEncoder | undefined,
  requestedAdvancedTwoPass?: boolean | undefined,
  effectiveCodec: SizeLimitCodec,
  id: SizeLimitedStrategyId,
  plannerProfileId: SizeLimitedPlannerProfileId,
  encoder: SizeLimitedEncoderName,
  encoderPreset: SizeLimitedEncoderPreset,
  hardware: SizeLimitedHardwareTarget,
  usesGpu: boolean,
  executionMode: SizeLimitedExecutionMode,
  tuningProfile: SizeLimitedTuningProfile,
  fallbackReason?: 'av1_unavailable' | 'av1_nvenc_unavailable' | 'h264_nvenc_unavailable' | 'svt_av1_unavailable' | undefined,
}

export interface SizeLimitedRetryStep {
  attemptNumber: number,
  totalBitrate: number,
  videoBitrate: number,
  audioBitrate: number,
}

export interface SizeLimitedProgressMetadata {
  attemptNumber: number,
  maxAttempts: number,
  phaseNumber: number,
  phaseCount: number,
}

export interface SizeLimitedPlan {
  strategyId: SizeLimitedPlannerProfileId,
  hardTargetBytes: number,
  targetZoneMinBytes: number,
  targetZoneMaxBytes: number,
  firstAttemptTargetBytes: number,
  retryTargetBytes: number,
  duration: number,
  overheadBytes: number,
  hasAudio: boolean,
  maxAttempts: number,
  retryMinFactor: number,
  retryMaxFactor: number,
  minTotalBitrate: number,
  initialAttempt: SizeLimitedRetryStep,
}

export interface SizeLimitedExecutionResult {
  path: string,
  size: number,
  targetBytes: number,
  attemptCount: number,
  metTarget: boolean,
  created: boolean,
  strategy: SizeLimitedResolvedStrategy,
}

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

export interface StreamParams {
  customTags?: Record<string, string>,
  disposition?: string,
  bsfH264Mp4toannexb?: boolean,
  bsfHevcMp4toannexb?: boolean,
  bsfHevcAudInsert?: boolean,
  tag?: string | undefined,
}
export type ParamsByStreamId = Map<string, Map<number, StreamParams>>;

export interface BatchFile {
  path: string,
  name: string,
}

export type KeyboardLayoutMap = Map<string, string>;
