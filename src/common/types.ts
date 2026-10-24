import type { SupportedLanguage } from './i18n.ts';

export type KeyboardAction = 'addSegment' | 'togglePlayResetSpeed' | 'togglePlayNoResetSpeed' | 'reducePlaybackRate' | 'reducePlaybackRateMore' | 'increasePlaybackRate' | 'increasePlaybackRateMore' | 'timelineToggleComfortZoom' | 'seekPreviousFrame' | 'seekNextFrame' | 'captureSnapshot' | 'captureSnapshotToClipboard' | 'setCutStart' | 'setCutEnd' | 'removeCurrentSegment' | 'removeCurrentCutpoint' | 'cleanupFilesDialog' | 'splitCurrentSegment' | 'focusSegmentAtCursor' | 'selectSegmentsAtCursor' | 'increaseRotation' | 'goToTimecode' | 'seekBackwards' | 'seekBackwards2' | 'seekBackwards3' | 'seekBackwardsPercent' | 'seekBackwardsPercent' | 'seekBackwardsKeyframe' | 'jumpCutStart' | 'seekForwards' | 'seekForwards2' | 'seekForwards3' | 'seekForwardsPercent' | 'seekForwardsPercent' | 'seekForwardsKeyframe' | 'jumpCutEnd' | 'jumpTimelineStart' | 'jumpTimelineEnd' | 'jumpFirstSegment' | 'jumpPrevSegment' | 'jumpSeekFirstSegment' | 'jumpSeekPrevSegment' | 'timelineZoomIn' | 'timelineZoomIn' | 'batchPreviousFile' | 'jumpLastSegment' | 'jumpNextSegment' | 'jumpSeekLastSegment' | 'jumpSeekNextSegment' | 'timelineZoomOut' | 'timelineZoomOut' | 'batchNextFile' | 'batchOpenSelectedFile' | 'batchOpenPreviousFile' | 'batchOpenNextFile' | 'undo' | 'undo' | 'redo' | 'redo' | 'copySegmentsToClipboard' | 'copySegmentsToClipboard' | 'toggleFullscreenVideo' | 'labelCurrentSegment' | 'export' | 'toggleKeyboardShortcuts' | 'increaseVolume' | 'decreaseVolume' | 'toggleMuted' | 'detectBlackScenes' | 'detectSilentScenes' | 'detectSceneChanges' | 'toggleLastCommands' | 'play' | 'pause' | 'reloadFile' | 'html5ify' | 'makeCursorTimeZero' | 'togglePlayOnlyCurrentSegment' | 'toggleLoopOnlyCurrentSegment' | 'toggleLoopStartEndOnlyCurrentSegment' | 'togglePlaySelectedSegments' | 'toggleLoopSelectedSegments' | 'editCurrentSegmentTags' | 'duplicateCurrentSegment' | 'reorderSegsByStartTime' | 'invertAllSegments' | 'fillSegmentsGaps' | 'shiftAllSegmentTimes' | 'alignSegmentTimesToKeyframes' | 'readAllKeyframes' | 'createSegmentsFromKeyframes' | 'createFixedDurationSegments' | 'createNumSegments' | 'createFixedByteSizedSegments' | 'createRandomSegments' | 'shuffleSegments' | 'combineOverlappingSegments' | 'combineSelectedSegments' | 'clearSegments' | 'toggleSegmentsList' | 'selectOnlyCurrentSegment' | 'deselectAllSegments' | 'selectAllSegments' | 'toggleCurrentSegmentSelected' | 'invertSelectedSegments' | 'removeSelectedSegments' | 'toggleStreamsSelector' | 'extractAllStreams' | 'showStreamsSelector' | 'showIncludeExternalStreamsDialog' | 'captureSnapshotAsCoverArt' | 'extractCurrentSegmentFramesAsImages' | 'extractSelectedSegmentsFramesAsImages' | 'convertFormatBatch' | 'convertFormatCurrentFile' | 'fixInvalidDuration' | 'closeBatch' | 'concatBatch' | 'toggleKeyframeCutMode' | 'toggleCaptureFormat' | 'toggleStripAudio' | 'toggleStripVideo' | 'toggleStripSubtitle' | 'toggleStripThumbnail' | 'toggleStripCurrentFilter' | 'toggleStripAll' | 'toggleDarkMode' | 'setStartTimeOffset' | 'toggleWaveformMode' | 'toggleShowThumbnails' | 'toggleShowKeyframes' | 'toggleSettings' | 'openSendReportDialog' | 'openFilesDialog' | 'openDirDialog' | 'exportYouTube' | 'closeCurrentFile' | 'quit' | 'selectAllMarkers' | 'generateOverviewWaveform' | 'selectSegmentsByLabel' | 'selectSegmentsByExpr' | 'labelSelectedSegments' | 'mutateSegmentsByExpr' | 'toggleSegmentSpeedControls' | 'addTextOverlay' | 'editCurrentSegmentCrop' | 'quickExport' | 'quickExportPreset1' | 'quickExportPreset2' | 'quickExportPreset3';

export interface KeyBinding {
  keys: string,
  action: KeyboardAction,
}

export type FfmpegHwAccel = 'none' | 'auto' | 'vdpau' | 'dxva2' | 'd3d11va' | 'vaapi' | 'qsv' | 'videotoolbox';

export type CaptureFormat = 'jpeg' | 'png' | 'webp';

export type TimecodeFormat = 'timecodeWithDecimalFraction' | 'frameCount' | 'seconds' | 'timecodeWithFramesFraction';

export type AvoidNegativeTs = 'make_zero' | 'auto' | 'make_non_negative' | 'disabled';

export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

export type PreserveMetadata = 'default' | 'nonglobal' | 'none'

export type WaveformMode = 'big-waveform' | 'waveform';

export type EnableImportChapters = 'always' | 'never' | 'ask'

export type ExportEncodeMode = 'lossless' | 'size_limited';

export type SizeLimitCodec = 'h264' | 'av1';

export type SizeLimitQuality = 'fast' | 'high_quality';

export type SizeLimitControlMode = 'simple' | 'advanced';

export type SizeLimitPreset = 'max_quality' | 'quality' | 'fast';

export type SizeLimitSimpleResolution = 'auto' | 'source' | '720p' | '1080p' | '1440p';

export type SizeLimitSimpleFps = 'auto' | 'source' | '30fps';

export type SizeLimitAdvancedEncoder = 'av1_cpu' | 'av1_nvenc' | 'h264_cpu' | 'h264_nvenc';

export type SizeLimitAdvancedAv1CpuPreset = number;

export type SizeLimitAdvancedNvencPreset = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';

export type SizeLimitAdvancedH264CpuPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';

export type SizeLimitNamingMode = 'auto' | 'custom_template';

/** A one-off export from a shortcut (Ctrl+1/2/3). It skips the export sheet and doesn't change the sheet's settings. */
export interface QuickExportPreset {
  /** Shown while it exports, e.g. "Discord". May be empty. */
  name: string,
  encodeMode: ExportEncodeMode,
  /** The size limit and preset, for `size_limited`. */
  sizeLimitMb: number,
  sizeLimitPreset: SizeLimitPreset,
}

export type ShelfOrder = 'date' | 'name';

/**
 * Where autosave keeps a recording's edits: ClipPress's own folder, next to the recording, both of those (a copy in
 * each), or the export folder.
 */
export type ProjectFileLocation = 'app' | 'recording' | 'both' | 'exportFolder';

/** An export the shelf remembers: the clip it came from, and the files it wrote. */
export interface ShelfExport {
  source: string,
  /** The source as it was when exported, so a new recording saved under the same name isn't taken for it. */
  sourceSize?: number | undefined,
  sourceModifiedAt?: number | undefined,
  outputs: string[],
  /** Milliseconds since the epoch. */
  exportedAt: number,
}

export interface RecentFile {
  path: string,
  /** Milliseconds since the epoch. */
  openedAt: number,
}

export interface Config {
  version: number,
  lastAppVersion: string,
  captureFormat: CaptureFormat,
  enableCustomOutDir: boolean,
  recentCustomOutDirs: string[],
  /** Recordings opened lately, newest first, for the welcome screen. */
  recentFiles: RecentFile[],
  /** The shelf of clips in a folder: its order, and the exports it remembers (newest first). */
  shelfOrder: ShelfOrder,
  shelfExports: ShelfExport[],
  keyframeCut: boolean,
  autoMerge: boolean,
  autoDeleteMergedSegments: boolean,
  segmentsToChaptersOnly: boolean,
  enableSmartCut: boolean,
  timecodeFormat: TimecodeFormat,
  invertCutSegments: boolean,
  autoExportExtraStreams: boolean,
  exportConfirmEnabled: boolean,
  /** After a checked, complete export, move the source recording to the Recycle Bin (never a permanent delete). */
  trashSourceAfterExport: boolean,
  /** When ClipPress moves the source recording to the Recycle Bin after an export, move every copy of its edits there too. */
  trashProjectWithSource: boolean,
  askBeforeClose: boolean,
  enableImportChapters: EnableImportChapters,
  enableAskForFileOpenAction: boolean,
  playbackVolume: number,
  autoSaveProjectFile: boolean,
  wheelSensitivity: number,
  waveformHeight: number,
  language: SupportedLanguage | null,
  ffmpegExperimental: boolean,
  preserveChapters: boolean,
  preserveMetadata: PreserveMetadata,
  preserveMetadataOnMerge: boolean,
  preserveMovData: boolean,
  movFastStart: boolean,
  avoidNegativeTs: AvoidNegativeTs,
  hideNotifications: 'all' | undefined,
  hideOsNotifications: 'all' | undefined,
  autoLoadTimecode: boolean,
  segmentsToChapters: boolean,
  simpleMode: boolean,
  /** Shows the Simple/Advanced switch. While off, the app runs the new editor whatever simpleMode says. */
  enableAdvancedMode: boolean,
  /** todo: rename to cutFileTemplate */
  outSegTemplate: string | undefined
  /** todo: rename to cutMergedFileTemplate */
  mergedFileTemplate: string | undefined,
  /** todo: rename to mergedFileTemplate */
  mergedFilesTemplate: string | undefined,
  keyboardSeekAccFactor: number,
  keyboardNormalSeekSpeed: number,
  keyboardSeekSpeed2: number,
  keyboardSeekSpeed3: number,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | undefined | null,
  outFormatLocked: string | undefined,
  safeOutputFileName: boolean,
  windowBounds: { x: number, y: number, width: number, height: number, isMaximized?: boolean } | undefined,
  storeWindowBounds: boolean,
  enableAutoHtml5ify: boolean,
  keyBindings: KeyBinding[],
  customFfPath: string | undefined,
  storeProjectInWorkingDir: boolean,
  projectFileLocation: ProjectFileLocation,
  enableOverwriteOutput: boolean,
  mouseWheelZoomModifierKey: ModifierKey,
  mouseWheelFrameSeekModifierKey: ModifierKey,
  mouseWheelKeyframeSeekModifierKey: ModifierKey,
  segmentMouseModifierKey: ModifierKey,
  captureFrameMethod: 'videotag' | 'ffmpeg',
  captureFrameQuality: number,
  captureFrameFileNameFormat: 'timestamp' | 'index',
  enableNativeHevc: boolean,
  enableUpdateCheck: boolean,
  updateMode: 'automatic' | 'ask',
  cleanupChoices: {
    trashTmpFiles: boolean, askForCleanup: boolean, closeFile: boolean, cleanupAfterExport?: boolean | undefined,
  },
  allowMultipleInstances: boolean,
  darkMode: boolean,
  preferStrongColors: boolean,
  outputFileNameMinZeroPadding: number,
  cutFromAdjustmentFrames: number,
  cutToAdjustmentFrames: number,
  invertTimelineScroll: boolean | undefined,
  waveformMode: WaveformMode | undefined,
  thumbnailsEnabled: boolean,
  keyframesEnabled: boolean,
  reducedMotion: 'always' | 'never' | 'user',
  ffmpegHwaccel: FfmpegHwAccel,
  /** Decode exports on the GPU and encode re-encoded regular exports with its H.264 encoder. */
  exportGpuAcceleration: boolean,
  exportEncodeMode: ExportEncodeMode,
  sizeLimitMb: number,
  sizeLimitCodec: SizeLimitCodec,
  sizeLimitQuality: SizeLimitQuality,
  sizeLimitControlMode: SizeLimitControlMode,
  sizeLimitPreset: SizeLimitPreset,
  sizeLimitSimpleResolution: SizeLimitSimpleResolution,
  sizeLimitSimpleResolutionTouched: boolean,
  sizeLimitSimpleFps: SizeLimitSimpleFps,
  sizeLimitSimpleFpsTouched: boolean,
  sizeLimitAdvancedResolution: SizeLimitSimpleResolution,
  sizeLimitAdvancedFps: SizeLimitSimpleFps,
  sizeLimitAdvancedEncoder: SizeLimitAdvancedEncoder,
  sizeLimitAdvancedTwoPass: boolean,
  sizeLimitAdvancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  sizeLimitAdvancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  sizeLimitAdvancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  sizeLimitAdvancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  sizeLimitSeparateNamingMode: SizeLimitNamingMode,
  sizeLimitMergedNamingMode: SizeLimitNamingMode,
  /**
   * Size-limited exports keep their own name templates. They used to share
   * `outSegTemplate`/`mergedFileTemplate` with lossless exports, which meant customising
   * the name in one mode silently rewrote the other mode's template.
   */
  sizeLimitCutFileTemplate: string | undefined,
  sizeLimitCutMergedFileTemplate: string | undefined,
  /** Ctrl+1, Ctrl+2 and Ctrl+3, in that order. */
  quickExportPresets: QuickExportPreset[],
}

export interface Waveform {
  buffer: Buffer,
}

export interface ApiActionRequest {
  id: number
  action: string
  args?: unknown[] | undefined,
}

export type Html5ifyMode = 'fastest' | 'fast-audio-remux' | 'fast-audio' | 'fast' | 'slow' | 'slow-audio' | 'slowest';
