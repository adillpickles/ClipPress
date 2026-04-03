import type { SupportedLanguage } from './i18n.ts';

export type KeyboardAction = 'addSegment' | 'togglePlayResetSpeed' | 'togglePlayNoResetSpeed' | 'reducePlaybackRate' | 'reducePlaybackRateMore' | 'increasePlaybackRate' | 'increasePlaybackRateMore' | 'timelineToggleComfortZoom' | 'seekPreviousFrame' | 'seekNextFrame' | 'captureSnapshot' | 'captureSnapshotToClipboard' | 'setCutStart' | 'setCutEnd' | 'removeCurrentSegment' | 'removeCurrentCutpoint' | 'cleanupFilesDialog' | 'splitCurrentSegment' | 'focusSegmentAtCursor' | 'selectSegmentsAtCursor' | 'increaseRotation' | 'goToTimecode' | 'seekBackwards' | 'seekBackwards2' | 'seekBackwards3' | 'seekBackwardsPercent' | 'seekBackwardsPercent' | 'seekBackwardsKeyframe' | 'jumpCutStart' | 'seekForwards' | 'seekForwards2' | 'seekForwards3' | 'seekForwardsPercent' | 'seekForwardsPercent' | 'seekForwardsKeyframe' | 'jumpCutEnd' | 'jumpTimelineStart' | 'jumpTimelineEnd' | 'jumpFirstSegment' | 'jumpPrevSegment' | 'jumpSeekFirstSegment' | 'jumpSeekPrevSegment' | 'timelineZoomIn' | 'timelineZoomIn' | 'batchPreviousFile' | 'jumpLastSegment' | 'jumpNextSegment' | 'jumpSeekLastSegment' | 'jumpSeekNextSegment' | 'timelineZoomOut' | 'timelineZoomOut' | 'batchNextFile' | 'batchOpenSelectedFile' | 'batchOpenPreviousFile' | 'batchOpenNextFile' | 'undo' | 'undo' | 'redo' | 'redo' | 'copySegmentsToClipboard' | 'copySegmentsToClipboard' | 'toggleFullscreenVideo' | 'labelCurrentSegment' | 'export' | 'toggleKeyboardShortcuts' | 'increaseVolume' | 'decreaseVolume' | 'toggleMuted' | 'detectBlackScenes' | 'detectSilentScenes' | 'detectSceneChanges' | 'toggleLastCommands' | 'play' | 'pause' | 'reloadFile' | 'html5ify' | 'makeCursorTimeZero' | 'togglePlayOnlyCurrentSegment' | 'toggleLoopOnlyCurrentSegment' | 'toggleLoopStartEndOnlyCurrentSegment' | 'togglePlaySelectedSegments' | 'toggleLoopSelectedSegments' | 'editCurrentSegmentTags' | 'duplicateCurrentSegment' | 'reorderSegsByStartTime' | 'invertAllSegments' | 'fillSegmentsGaps' | 'shiftAllSegmentTimes' | 'alignSegmentTimesToKeyframes' | 'readAllKeyframes' | 'createSegmentsFromKeyframes' | 'createFixedDurationSegments' | 'createNumSegments' | 'createFixedByteSizedSegments' | 'createRandomSegments' | 'shuffleSegments' | 'combineOverlappingSegments' | 'combineSelectedSegments' | 'clearSegments' | 'toggleSegmentsList' | 'selectOnlyCurrentSegment' | 'deselectAllSegments' | 'selectAllSegments' | 'toggleCurrentSegmentSelected' | 'invertSelectedSegments' | 'removeSelectedSegments' | 'toggleStreamsSelector' | 'extractAllStreams' | 'showStreamsSelector' | 'showIncludeExternalStreamsDialog' | 'captureSnapshotAsCoverArt' | 'extractCurrentSegmentFramesAsImages' | 'extractSelectedSegmentsFramesAsImages' | 'convertFormatBatch' | 'convertFormatCurrentFile' | 'fixInvalidDuration' | 'closeBatch' | 'concatBatch' | 'toggleKeyframeCutMode' | 'toggleCaptureFormat' | 'toggleStripAudio' | 'toggleStripVideo' | 'toggleStripSubtitle' | 'toggleStripThumbnail' | 'toggleStripCurrentFilter' | 'toggleStripAll' | 'toggleDarkMode' | 'setStartTimeOffset' | 'toggleWaveformMode' | 'toggleShowThumbnails' | 'toggleShowKeyframes' | 'toggleSettings' | 'openSendReportDialog' | 'openFilesDialog' | 'openDirDialog' | 'exportYouTube' | 'closeCurrentFile' | 'quit' | 'selectAllMarkers' | 'generateOverviewWaveform' | 'selectSegmentsByLabel' | 'selectSegmentsByExpr' | 'labelSelectedSegments' | 'mutateSegmentsByExpr';

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

export type SizeLimitAdvancedEncoder = 'av1_cpu' | 'av1_nvenc' | 'h264_cpu' | 'h264_nvenc';

export type SizeLimitAdvancedAv1CpuPreset = number;

export type SizeLimitAdvancedNvencPreset = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';

export type SizeLimitAdvancedH264CpuPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';

export type SizeLimitNamingMode = 'auto' | 'custom_template';

export interface Config {
  version: number,
  lastAppVersion: string,
  captureFormat: CaptureFormat,
  enableCustomOutDir: boolean,
  recentCustomOutDirs: string[],
  keyframeCut: boolean,
  autoMerge: boolean,
  autoDeleteMergedSegments: boolean,
  segmentsToChaptersOnly: boolean,
  enableSmartCut: boolean,
  timecodeFormat: TimecodeFormat,
  invertCutSegments: boolean,
  autoExportExtraStreams: boolean,
  exportConfirmEnabled: boolean,
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
  exportEncodeMode: ExportEncodeMode,
  sizeLimitMb: number,
  sizeLimitCodec: SizeLimitCodec,
  sizeLimitQuality: SizeLimitQuality,
  sizeLimitControlMode: SizeLimitControlMode,
  sizeLimitPreset: SizeLimitPreset,
  sizeLimitAdvancedEncoder: SizeLimitAdvancedEncoder,
  sizeLimitAdvancedTwoPass: boolean,
  sizeLimitAdvancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  sizeLimitAdvancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  sizeLimitAdvancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  sizeLimitAdvancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  sizeLimitSeparateNamingMode: SizeLimitNamingMode,
  sizeLimitMergedNamingMode: SizeLimitNamingMode,
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
