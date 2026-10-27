import type {
  CSSProperties,
  ReactEventHandler,
  FocusEventHandler,
  DragEventHandler,
} from 'react';
import { lazy, memo, Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { FaRegTimesCircle } from 'react-icons/fa';
import { MdRotate90DegreesCcw } from 'react-icons/md';
import { AnimatePresence, MotionConfig } from 'motion/react';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { produce } from 'immer';
import screenfull from 'screenfull';
import type { IpcRendererEvent } from 'electron';
import { FiDownload } from 'react-icons/fi';
import fromPairs from 'lodash/fromPairs';
import sum from 'lodash/sum';
import omit from 'lodash/omit';
import invariant from 'tiny-invariant';
import type { SweetAlertOptions } from 'sweetalert2';
import { nanoid } from 'nanoid';

import useTimelineScroll from './hooks/useTimelineScroll';
import useUserSettingsRoot from './hooks/useUserSettingsRoot';
import useFfmpegOperations, {
  maybeMkDeepOutDir,
  OutputNotWritableError,
} from './hooks/useFfmpegOperations';
import useKeyframes from './hooks/useKeyframes';
import useWaveform from './hooks/useWaveform';
import useKeyboard from './hooks/useKeyboard';
import useFileFormatState from './hooks/useFileFormatState';
import useFrameCapture from './hooks/useFrameCapture';
import useSegments from './hooks/useSegments';
import useDirectoryAccess from './hooks/useDirectoryAccess';

import type {
  UserSettingsContextType,
  AppContextType,
  SegColorsContextType,
} from './contexts';
import { UserSettingsContext, SegColorsContext, AppContext } from './contexts';

import NoFileLoaded from './NoFileLoaded';
import RecentFiles from './components/RecentFiles';
import AppChrome from './AppChrome';
import MediaSourcePlayer from './MediaSourcePlayer';
import PreviewFailedCard from './components/PreviewFailedCard';
import TopMenu from './TopMenu';
import LastCommands from './LastCommands';
import StreamsSelector from './StreamsSelector';
import SegmentList from './SegmentList';
import Settings from './components/Settings';
import type { SettingsCategory } from './components/Settings';
import Timeline from './Timeline';
import BottomBar from './BottomBar';
import ExportConfirm from './components/ExportConfirm';
import TextOverlayEditor from './components/TextOverlayEditor';
import SegmentSpeedDialog from './components/SegmentSpeedDialog';
import { getPreviewSegment, getPreviewSegmentSpeed, getSegmentSpeed, isSegmentSpeedValid } from './segmentSpeed';
import SegmentCropPreview from './components/SegmentCropPreview';
import { getSegmentCrop, hasSegmentCrop } from './segmentCrop';
import type { SegmentCrop } from './segmentCrop';
import VolumeControl from './components/VolumeControl';
import PlaybackStreamSelector from './components/PlaybackStreamSelector';
import BatchFilesList from './components/BatchFilesList';
import ConcatDialog from './components/ConcatDialog';
import Working from './components/Working';
import OutputFormatSelect from './components/OutputFormatSelect';
import * as Dialog from './components/Dialog';

import runStartupCheck from './startupCheck';
import { darkModeTransition } from './colors';
import {
  exportSizeLimitedMerge,
  exportSizeLimitedSegment,
  pickSizeLimitedStreams,
  prefetchEncoderCapabilities,
} from './sizeLimitedExport';
import { bytesPerMb } from './sizeLimitedPlanner';
import { gpuEncoderLabels } from './gpuEncoders';
import {
  buildSizeLimitedAutoFileNames as buildSizeLimitedAutoFileNamesRaw,
  createReservedFileNames,
  findAvailableSizeLimitedAutoFileName,
  getSizeLimitedMergedSuffixLabel,
  getSizeLimitedSeparateSuffixLabel,
  sizeLimitedFinalSizePlaceholder,
  type SizeLimitedAutoNameItem,
} from './sizeLimitedNaming';
import { resolveEffectiveSizeLimitedTransformSettings } from './sizeLimitedResolution';
import { getSegColor } from './util/colors';
import formatClockTime from './util/clockTime';
import { parseDuration } from './util/duration';
import type { FileFfprobeMeta } from './ffmpeg';
import {
  getStreamFps,
  isCuttingStart,
  isCuttingEnd,
  readFileFfprobeMeta,
  readFileFfprobeMetaCached,
  getDefaultOutFormat,
  setCustomFfPath as ffmpegSetCustomFfPath,
  isIphoneHevc,
  isProblematicAvc1,
  tryMapChaptersToEdl,
  getTimecodeFromStreams,
  createChaptersFromSegments,
  RefuseOverwriteError,
  extractSubtitleTrackToSegments,
  mapRecommendedDefaultFormat,
  getFfCommandLine,
} from './ffmpeg';
import {
  shouldCopyStreamByDefault,
  getAudioStreams,
  getRealVideoStreams,
  isAudioDefinitelyNotSupported,
  willPlayerProperlyHandleVideo,
  doesPlayerSupportHevcPlayback,
  getSubtitleStreams,
  enableVideoTrack,
  enableAudioTrack,
  canHtml5PlayerPlayStreams,
  isMatroska,
  isNeutralAudioGain,
  defaultAudioGainDb,
} from './util/streams';
import {
  exportEdlFile,
  readEdlFile,
  loadLlcProject,
  askForEdlImport,
} from './edlStore';
import { formatYouTube, getFrameCountRaw, formatTsvHuman } from './edlFormats';
import {
  getOutPath,
  getOutDir,
  dragPreventer,
  havePermissionToReadFile,
  resolvePathIfNeeded,
  getPathReadAccessError,
  findExistingHtml5FriendlyFile,
  filenamify,
  isOutOfSpaceError,
  readFileSize,
  readFileSizes,
  checkFileSizes,
  setDocumentTitle,
  readVideoTs,
  readDirRecursively,
  getImportProjectType,
  calcShouldShowWaveform,
  calcShouldShowKeyframes,
  mediaSourceQualities,
  isExecaError,
  getStdioString,
  isMuxNotSupported,
  getDownloadMediaOutPath,
  isAbortedError,
  moveExportWithRetry,
  shootConfetti,
  isMasBuild,
  isMac,
  isWindows,
  readFileStats,
  makeSourceFileAccessError,
  trashFile,
} from './util';
import getSwal, { errorToast, showPlaybackFailedMessage } from './swal';
import { addRecentFile, removeRecentFile } from './util/recentFiles';
import { assertOutPathsNotSource, getMergeProtectedPaths, isSourcePath, makeSafeOutFileNames } from './util/sourceProtection';
import type { SourceSafeFileNameAdjustment } from './util/sourceProtection';
import { adjustRate } from './util/rate-calculator';
import { getWrittenExportPaths } from './util/exportResults';
import type { ExportedFile } from './util/exportResults';
import { askExtractFramesAsImages } from './dialogs/extractFrames';
import type { CleanupChoicesType } from './dialogs';
import {
  askForOutDir,
  askForImportChapters,
  askForFileOpenAction,
  askForFileOpenChoice,
  showDiskFull,
  showExportFailedDialog,
  showConcatFailedDialog,
  openYouTubeChaptersDialog,
  showRefuseToOverwrite,
  showOpenDialog,
  showMuxNotSupported,
  promptDownloadMediaUrl,
  showOutputNotWritable,
  deleteFiles,
  mustDisallowVob,
  toastError,
  showSavingBeforeClose,
  askAfterFailedSaveBeforeClose,
} from './dialogs';
import { openSendReportDialog } from './reporting';
import {
  sortSegments,
  convertSegmentsToChaptersWithGaps,
  hasAnySegmentOverlap,
  isDurationValid,
  getPlaybackAction,
  getSegmentTags,
  filterNonMarkers,
  isInitialSegment,
} from './segments';
import type {
  GenerateMergedOutFileNamesParams,
  GeneratedOutFileNames,
} from './util/outputNameTemplate';
import {
  generateCutFileNames as generateCutFileNamesRaw,
  generateCutMergedFileNames as generateCutMergedFileNamesRaw,
  generateMergedFileNames as generateMergedFileNamesRaw,
  defaultCutFileTemplate,
  defaultCutMergedFileTemplate,
  defaultMergedFileTemplate,
  defaultSizeLimitedCutFileTemplate,
  defaultSizeLimitedCutMergedFileTemplate,
  getOutputFileNameProblems,
} from './util/outputNameTemplate';
import {
  rightBarWidth,
  leftBarWidth,
  ffmpegExtractWindow,
  zoomMax,
} from './util/constants';
import BigWaveform from './components/BigWaveform';

import type {
  BatchFile,
  Chapter,
  CustomTagsByFile,
  EdlExportType,
  EdlFileType,
  EdlImportType,
  FfmpegCommandLog,
  FilesMeta,
  FileStats,
  OverlayClip,
  ParamsByStreamId,
  PlaybackMode,
  SegmentBase,
  SegmentColorIndex,
  SegmentTags,
  SegmentToExport,
  SizeLimitedExecutionResult,
  SizeLimitedProgressMetadata,
  StateSegment,
} from './types';
import {
  goToTimecodeDirectArgsSchema,
  openFilesActionArgsSchema,
} from './types';
import type {
  CaptureFormat,
  KeyboardAction,
  ApiActionRequest,
  SizeLimitControlMode,
  SizeLimitPreset,
} from '../../common/types.js';
import type { FFprobeChapter, FFprobeStream } from '../../common/ffprobe.js';
import { parseFfprobeDuration } from '../../common/util.js';

import useLoading from './hooks/useLoading';
import useVideo from './hooks/useVideo';
import usePreviewAudioGain, { getPreviewGainFactor } from './hooks/usePreviewAudioGain';
import type { PreviewClipVolume } from './hooks/usePreviewAudioGain';
import useUndoableState from './hooks/useUndoableState';
import EditHistoryOrder from './editHistoryOrder';
import type { EditDomainHistory } from './editHistoryOrder';
import useTimecode from './hooks/useTimecode';
import useSegmentsAutoSave from './hooks/useSegmentsAutoSave';
import { getProjectSegmentsToLoad } from './llcProject';
import type { ProjectSession } from './projectAutoSave';
import saveBeforeClose from './saveBeforeClose';
import { setCloseRequestHandlers } from './closeRequests';
import useThumbnails from './hooks/useThumbnails';
import useSubtitles from './hooks/useSubtitles';
import useStreamsMeta from './hooks/useStreamsMeta';
import { bottomStyle, videoStyle } from './styles';
import PreviewSpinner from './components/PreviewSpinner';
import useFilmstrip from './hooks/useFilmstrip';
import { getTimelineCacheKey } from './timelineCache';
import { getVideoDisplayAspect } from './filmstrip';
import { schedulePruneTimelineCache } from './timelineCacheIo';
import prefetchTimeline from './timelinePrefetch';
import TooltipLayer from './components/TooltipLayer';
import ClipsPanelTab from './components/ClipsPanelTab';
import MenuHost from './components/Menu';
import { pickHintKeyBindings } from './util/keyNames';
import useAudioPeaks from './hooks/useAudioPeaks';
import AudioTrackHeader from './components/AudioTrackHeader';
import ClipVolumePopover from './components/ClipVolumePopover';
import { ShelfUpNext } from './components/Shelf';
import useShelf, { listShelfFolder } from './hooks/useShelf';
import { buildShelfQueue, pickNextClip, rememberShelfExport, shelfThumbnailKey } from './shelf';
import formatSizeLimitedProgressText, { getSizeLimitedStageTitle } from './sizeLimitedProgressText';
import { findClipEdge, getEdgeSnapDistance } from './clipEdgeSnap';
import { isSelfFileDrag } from './selfFileDrag';
import type { ExportPhase } from './exportTitleLines';
import { findFreeFileName } from './util/clipFileNames';
import getMergePartNames from './mergePartNames';
import { getLastSettingsLabel, getQuickExportPresetLabel, isChaptersOnlyExport, resolveExportQuality } from './quickExport';
import type { QuickExport } from './quickExport';
import { normalizeQuickExportPresets } from '../../common/quickExport';
import { getProjectCopiesToRetire, getProjectLookupPaths, getProjectSavePaths, getProjectStoreEnv, isSameProjectPath } from './projectStore';
import { filterOwnProjectFiles, findProjectFiles, keepBackupCopies, keepCopiesAboutToBeReplaced, keepCopiesNotOpened, logProjectFiles, readNewestProjectCopy, recycleRecordingProjectCopies } from './projectFilesIo';
import { getClipsToRemove, pickClip, pickInBox } from './clipPicking';
import type { PickHow } from './clipPicking';
import { getProjectMediaCandidates, getProjectMediaOldPath } from './missingRecording';
import useProjectCleanup from './hooks/useProjectCleanup';
import useRelocateRecording from './hooks/useRelocateRecording';
import type { RelocatedRecording } from './hooks/useRelocateRecording';
import type { ProjectFileLocation } from '../../common/types';
import type { ClipVolumeChange } from './components/ClipVolumePopover';
import { combineAudioGain, isClipVolumeChanged, sanitizeClipGainDb } from './util/audioGain';
import { recycleOriginal, verifyExportedFiles } from './originalRecycling';
import type { FileIdentity } from './originalRecycling';
import { shouldRecycleEditsWithOriginal, shouldRecycleOriginalAfterExport } from './afterExportAction';
import { fileExists, identifyFile, probeOutput, statOutput } from './originalRecyclingIo';
import styles from './App.module.css';
import { DirectoryAccessDeclinedError, UnsupportedFileError, UserFacingError } from '../errors';
import SwalContainer from './components/SwalContainer';
import ErrorDialog from './components/ErrorDialog';
import useErrorHandling from './hooks/useErrorHandling';
import GenericDialog, { useDialog } from './components/GenericDialog';
import useHtml5ify from './hooks/useHtml5ify';
import WhatsNew from './components/WhatsNew';
import UpdateNotice from './components/UpdateNotice';
import mainApi from './mainApi.js';
import type { AppEvent } from '../../main/index.js';

import {
  createDefaultTextOverlayClip,
  getVideoStreamRotation,
  isOverlayActiveAtTime,
  sanitizeOverlayClip,
} from './textOverlays';
import type { UndoableSetOptions } from './undoableHistory';

const electron = window.require('electron');
const { lstat } = window.require('fs/promises');
const {
  parse: parsePath,
  join: pathJoin,
  basename,
  dirname,
} = window.require('path');

const { pathToFileURL, lossyMode, isLinux } = window
  .require('@electron/remote')
  .require('./index.js');

const hevcPlaybackSupportedPromise = doesPlayerSupportHevcPlayback();
// eslint-disable-next-line unicorn/prefer-top-level-await
hevcPlaybackSupportedPromise.catch((err) => console.error(err));

function emitEvent(appEvent: AppEvent) {
  electron.ipcRenderer.send('appEvent', appEvent satisfies AppEvent);
}

/**
 * Says out loud that an output name was rewritten to keep it off a source file.
 *
 * The rewrite is a successful outcome, not a failure, so it goes in with the notices
 * rather than the warnings — but the user asked for one file name and got another, and
 * silently handing back a different file is how someone ends up unable to find it.
 */
function addSourceSafetyNotice(
  adjustments: readonly SourceSafeFileNameAdjustment[] | undefined,
  notices: Set<string>,
) {
  const [first] = adjustments ?? [];
  if (first == null) return;
  notices.add(
    i18n.t('Output name adjusted to avoid replacing the source file. Saved as "{{fileName}}".', {
      fileName: first.to,
    }),
  );
}

type EditDomain = 'segments' | 'overlays' | 'streamParams' | 'speedControls';

// Loaded the first time the shortcuts open, not at every start.
const KeyboardShortcuts = lazy(() => import('./components/KeyboardShortcuts'));

// The export card's title while the clips are cut from the recording.
const getCuttingText = (clipCount: number) => (clipCount > 1 ? i18n.t('Cutting your clips') : i18n.t('Cutting your clip'));

function App() {
  // For measuring startup (read by tests; costs nothing).
  useEffect(() => {
    performance.mark('clippress:app-mounted');
  }, []);
  const { t } = useTranslation();

  // Per project state
  const [ffmpegCommandLog, setFfmpegCommandLog] = useState<FfmpegCommandLog>(
    [],
  );
  const [rotation, setRotation] = useState(360);
  const [progress, setProgress] = useState<number>();
  const [startTimeOffset, setStartTimeOffset] = useState(0);
  const [filePath, setFilePath] = useState<string>();
  // The open of filePath, for autosave. Set and cleared together with filePath.
  const [projectSession, setProjectSession] = useState<ProjectSession>();
  const [currentClipName, setCurrentClipName] = useState<string>();
  const [fileDuration, setFileDuration] = useState<number>();
  const [externalFilesMeta, setExternalFilesMeta] = useState<FilesMeta>({});
  const [customTagsByFile, setCustomTagsByFile] = useState<CustomTagsByFile>(
    {},
  );
  // Ctrl+Z undoes the latest edit across segments, text, stream params (gain) and speed bars.
  const [editHistoryOrder] = useState(() => new EditHistoryOrder<EditDomain>());
  const [paramsByStreamId, setParamsByStreamId, streamParamsHistory] = useUndoableState<ParamsByStreamId>(
    new Map(),
    { tracker: editHistoryOrder.tracker('streamParams') },
  );
  const [overlayClips, setOverlayClips, overlayClipsHistory] = useUndoableState<OverlayClip[]>([], {
    tracker: editHistoryOrder.tracker('overlays'),
  });
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>();
  const [detectedFps, setDetectedFps] = useState<number>();
  const [mainFileMeta, setMainFileMeta] = useState<{
    ffprobeMeta: FileFfprobeMeta;
    stats: FileStats;
  }>();
  const [streamsSelectorShown, setStreamsSelectorShown] = useState(false);
  const [concatDialogOpen, setConcatDialogOpen] = useState(false);
  const [zoomUnrounded, setZoom] = useState(1);
  const [shortestFlag, setShortestFlag] = useState(false);
  const [zoomWindowStartTime, setZoomWindowStartTime] = useState(0);
  const [activeVideoStreamIndex, setActiveVideoStreamIndex] = useState<number>();
  const [activeAudioStreamIndexes, setActiveAudioStreamIndexes] = useState<
    Set<number>
  >(new Set());
  const [activeSubtitleStreamIndex, setActiveSubtitleStreamIndex] = useState<number>();
  const [hideCompatPlayer, setHideCompatPlayer] = useState(false);
  const [compatPlayerFailed, setCompatPlayerFailed] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(0);
  const [currentFileExportCount, setCurrentFileExportCount] = useState(0);

  const {
    fileFormat,
    setFileFormat,
    detectedFileFormat,
    setDetectedFileFormat,
    isCustomFormatSelected,
  } = useFileFormatState();

  // State per application launch
  const [ffmpegInfo, setFfmpegInfo] = useState<Awaited<ReturnType<typeof runStartupCheck>>>();
  const lastOpenedPathRef = useRef<string>();
  const loadGenerationRef = useRef(0);
  const [showRightBar, setShowRightBar] = useState(true);
  // The clip being renamed in place in the Clips panel; here so "Rename clip…" in the menu can start it too.
  const [renamingSegId, setRenamingSegId] = useState<string>();
  const [lastCommandsVisible, setLastCommandsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('general');
  const [keyboardShortcutsVisible, setKeyboardShortcutsVisible] = useState(false);
  const [keyboardShortcutsView, setKeyboardShortcutsView] = useState<'all'>();
  const [alwaysConcatMultipleFiles, setAlwaysConcatMultipleFiles] = useState(false);
  const [editingSegmentTagsSegmentIndex, setEditingSegmentTagsSegmentIndex] = useState<number>();
  const [editingSegmentTags, setEditingSegmentTags] = useState<SegmentTags>();
  const [mediaSourceQuality, setMediaSourceQuality] = useState(0);
  const [encBitrate, setEncBitrate] = useState<number | undefined>();
  const [exportCount, setExportCount] = useState(0);
  const [maxKeyframes, setMaxKeyframes] = useState(10000);

  const incrementMediaSourceQuality = useCallback(
    () => setMediaSourceQuality((v) => (v + 1) % mediaSourceQualities.length),
    [],
  );

  // Batch state / concat files
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  // The shelf's folder: the open clip's, kept after it closes so the next clip is one click away.
  const [shelfFolder, setShelfFolder] = useState<string>();
  // The clip the shelf counts on from: the open one, and after it closes still that one, so "Up next" on the
  // welcome screen is the clip after it and never the one just closed.
  const [shelfAnchorPath, setShelfAnchorPath] = useState<string>();
  // Recordings from the shelf that couldn't be opened this session (`shelfThumbnailKey`), so they aren't offered again.
  const [unopenableShelfKeys, setUnopenableShelfKeys] = useState<ReadonlySet<string>>(new Set());
  const [selectedBatchFiles, setSelectedBatchFiles] = useState<string[]>([]);

  const allUserSettings = useUserSettingsRoot();
  const {
    captureFormat,
    keyframeCut,
    preserveMetadata,
    preserveMetadataOnMerge,
    preserveMovData,
    preserveChapters,
    movFastStart,
    avoidNegativeTs,
    autoMerge,
    timecodeFormat,
    invertCutSegments,
    autoExportExtraStreams,
    askBeforeClose,
    enableImportChapters,
    enableAskForFileOpenAction,
    playbackVolume,
    autoSaveProjectFile,
    wheelSensitivity,
    waveformHeight,
    invertTimelineScroll,
    language,
    ffmpegExperimental,
    hideNotifications,
    hideOsNotifications,
    autoLoadTimecode,
    autoDeleteMergedSegments,
    exportConfirmEnabled,
    trashSourceAfterExport,
    trashProjectWithSource,
    copyAfterExport,
    playOnOpen,
    segmentsToChapters,
    simpleMode,
    cutFileTemplate,
    cutMergedFileTemplate,
    mergedFileTemplate,
    keyboardSeekAccFactor,
    keyboardNormalSeekSpeed,
    keyboardSeekSpeed2,
    keyboardSeekSpeed3,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
    outFormatLocked,
    safeOutputFileName,
    enableAutoHtml5ify,
    segmentsToChaptersOnly,
    keyBindings,
    enableSmartCut,
    customFfPath,
    projectFileLocation,
    enableOverwriteOutput,
    mouseWheelZoomModifierKey,
    mouseWheelFrameSeekModifierKey,
    mouseWheelKeyframeSeekModifierKey,
    extraMouseModifierKeys,
    captureFrameMethod,
    captureFrameQuality,
    captureFrameFileNameFormat,
    enableNativeHevc,
    cleanupChoices,
    darkMode,
    preferStrongColors,
    outputFileNameMinZeroPadding,
    cutFromAdjustmentFrames,
    cutToAdjustmentFrames,
    waveformMode: waveformModePreference,
    thumbnailsEnabled,
    keyframesEnabled,
    reducedMotion,
    ffmpegHwaccel,
    exportGpuAcceleration,
    exportEncodeMode,
    sizeLimitMb,
    sizeLimitControlMode,
    sizeLimitPreset,
    sizeLimitSimpleResolution,
    sizeLimitSimpleResolutionTouched,
    sizeLimitSimpleFps,
    sizeLimitSimpleFpsTouched,
    sizeLimitAdvancedResolution,
    sizeLimitAdvancedFps,
    sizeLimitAdvancedEncoder,
    sizeLimitAdvancedTwoPass,
    sizeLimitAdvancedAv1CpuPreset,
    sizeLimitAdvancedAv1NvencPreset,
    sizeLimitAdvancedH264CpuPreset,
    sizeLimitAdvancedH264NvencPreset,
    sizeLimitSeparateNamingMode,
    sizeLimitMergedNamingMode,
    sizeLimitCutFileTemplate,
    sizeLimitCutMergedFileTemplate,
    quickExportPresets,
  } = allUserSettings.settings;
  const {
    setCaptureFormat,
    setCustomOutDir,
    setKeyframeCut,
    setPlaybackVolume,
    setExportConfirmEnabled,
    setSimpleMode,
    setOutFormatLocked,
    setSafeOutputFileName,
    setKeyBindings,
    resetKeyBindings,
    setProjectFileLocation,
    setCleanupChoices,
    setTrashSourceAfterExport,
    toggleDarkMode,
    setWaveformMode,
    setThumbnailsEnabled,
    setKeyframesEnabled,
    prefersReducedMotion,
    customOutDir,
    recentFiles,
    setRecentFiles,
    shelfExports,
    setShelfExports,
    shelfOrder,
    setShelfOrder,
  } = allUserSettings;

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(!simpleMode);

  const { withErrorHandling, handleError, genericError, setGenericError } = useErrorHandling();

  const {
    showGenericDialog,
    genericDialog,
    closeGenericDialog,
    closeExportResultDialog,
    confirmDialog,
    openExportFinishedDialog,
    openCutFinishedDialog,
    openSizeLimitedFinishedDialog,
    openConcatFinishedDialog,
    openCleanupFilesDialog,
  } = useDialog();

  const effectiveSizeLimitedTransformSettings = useMemo(
    () => resolveEffectiveSizeLimitedTransformSettings({
      controlMode: sizeLimitControlMode,
      preset: sizeLimitPreset,
      simpleResolution: sizeLimitSimpleResolution,
      simpleResolutionTouched: sizeLimitSimpleResolutionTouched,
      simpleFps: sizeLimitSimpleFps,
      simpleFpsTouched: sizeLimitSimpleFpsTouched,
      advancedResolution: sizeLimitAdvancedResolution,
      advancedFps: sizeLimitAdvancedFps,
    }),
    [
      sizeLimitAdvancedFps,
      sizeLimitAdvancedResolution,
      sizeLimitControlMode,
      sizeLimitPreset,
      sizeLimitSimpleFps,
      sizeLimitSimpleFpsTouched,
      sizeLimitSimpleResolution,
      sizeLimitSimpleResolutionTouched,
    ],
  );

  // The binding a shortcut hint shows, of each action's: the first, but on a Mac one with Cmd and elsewhere one without
  // the Windows key, where there's such a one (the defaults pair each Ctrl shortcut with a Cmd/Windows key one).
  const keyBindingByAction = useMemo(() => pickHintKeyBindings(keyBindings, isMac), [keyBindings]);
  // The timeline's own right-click menu shows the keys its items have.
  const timelineMenuKeys = useMemo(() => ({
    setCutStart: keyBindingByAction['setCutStart']?.keys,
    setCutEnd: keyBindingByAction['setCutEnd']?.keys,
    goToTimecode: keyBindingByAction['goToTimecode']?.keys,
  }), [keyBindingByAction]);
  const clipMenuKeys = useMemo(() => ({
    rename: keyBindingByAction['labelCurrentSegment']?.keys,
    duplicate: keyBindingByAction['duplicateCurrentSegment']?.keys,
    remove: keyBindingByAction['removeSelectedClips']?.keys,
  }), [keyBindingByAction]);

  const { working, setWorking, workingRef, abortWorking } = useLoading();
  const {
    videoRef,
    videoContainerRef,
    playbackRate,
    setPlaybackRate,
    setSegmentPreviewSpeed,
    outputPlaybackRate,
    setOutputPlaybackRate,
    commandedTime,
    seekAbs,
    playingRef,
    getRelevantTime,
    setPlaying,
    onSeeked,
    relevantTime,
    onStartPlaying,
    setCommandedTime,
    setOutputPlaybackRateState,
    commandedTimeRef,
    onStopPlaying,
    onVideoAbort,
    playerTime,
    setPlayerTime,
    playbackMode,
    setPlaybackMode,
    playbackModeRef,
    playing,
    play,
    pause,
    seekRel,
  } = useVideo({ filePath });

  // Dragging along the timeline pauses playback while it lasts and resumes it afterwards; a paused video stays paused.
  const resumeAfterScrubRef = useRef(false);
  const onTimelineScrubbingChange = useCallback((scrubbing: boolean) => {
    if (scrubbing) {
      resumeAfterScrubRef.current = playingRef.current;
      if (playingRef.current) pause();
      return;
    }
    if (resumeAfterScrubRef.current) {
      resumeAfterScrubRef.current = false;
      // The pause event may not have arrived yet on a very quick drag, so play() would think it's still playing.
      const video = videoRef.current;
      if (!playingRef.current) play();
      else if (video?.paused) video.play().catch((err) => console.error('Resuming after a scrub failed', err));
    }
  }, [pause, play, playingRef, videoRef]);

  const appDropRef = useRef<HTMLDivElement>(null);
  // The video is loading or waiting for data (shows a spinner over the preview after a short delay).
  const [videoBusy, setVideoBusy] = useState(false);
  // A recording's first frame comes before the work that reads the whole file again (its waveform), so the two don't
  // fight over the disk as it opens: that work waits for the video to load, 400 ms at most.
  const videoLoadedRef = useRef<{ path: string | undefined, waiters: { path: string, done: () => void }[] }>({ path: undefined, waiters: [] });
  const whenVideoLoaded = useCallback((path: string) => new Promise<void>((resolve) => {
    if (videoLoadedRef.current.path === path) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waiter = { path, done: () => { clearTimeout(timer); resolve(); } };
    timer = setTimeout(() => {
      videoLoadedRef.current.waiters = videoLoadedRef.current.waiters.filter((w) => w !== waiter);
      resolve();
    }, 400);
    videoLoadedRef.current.waiters.push(waiter);
  }), []);
  // Settings > Editing > Start playing when a clip opens: the file it last started, so a reload doesn't start it again.
  const autoPlayedPathRef = useRef<string>();
  useEffect(() => {
    if (filePath == null) autoPlayedPathRef.current = undefined;
  }, [filePath]);
  const onVideoLoaded = useCallback((path: string | undefined) => {
    const loaded = videoLoadedRef.current;
    loaded.path = path;
    const ready = loaded.waiters.filter((w) => w.path === path);
    loaded.waiters = loaded.waiters.filter((w) => w.path !== path);
    ready.forEach((w) => w.done());
  }, []);
  // A file is being dragged over the window while a clip is open.
  const [fileDragActive, setFileDragActive] = useState(false);
  const {
    timecodePlaceholder,
    formatTimecode,
    formatTimeAndFrames,
    parseTimecode,
    getFrameCount,
    promptTimecode,
  } = useTimecode({ detectedFps, timecodeFormat, showGenericDialog });
  const { loadSubtitle, subtitlesByStreamId, setSubtitlesByStreamId } = useSubtitles();

  const fileDurationNonZero = isDurationValid(fileDuration) ? fileDuration : 1;
  const zoom = Math.floor(zoomUnrounded);
  const zoomedDuration = isDurationValid(fileDuration)
    ? fileDuration / zoom
    : undefined;
  const zoomWindowEndTime = useMemo(
    () => (zoomedDuration != null ? zoomWindowStartTime + zoomedDuration : undefined),
    [zoomedDuration, zoomWindowStartTime],
  );

  // The simple editor: I and O lock onto a clip edge the playhead is just next to, so clips sit back to back. The
  // playhead goes to the edge (unless playing), and a short blue line on the timeline shows where.
  const getEdgeSnapDistanceNow = useCallback(() => (
    simpleMode && isDurationValid(fileDuration)
      ? getEdgeSnapDistance({ duration: fileDuration, zoom: zoomUnrounded, fps: detectedFps, laneWidthPx: document.querySelector('[data-timeline-scroller]')?.clientWidth })
      : undefined
  ), [detectedFps, fileDuration, simpleMode, zoomUnrounded]);
  const [edgeSnapCue, setEdgeSnapCue] = useState<{ time: number, id: number }>();
  const onEdgeSnap = useCallback((time: number) => {
    setEdgeSnapCue((previous) => ({ time, id: (previous?.id ?? 0) + 1 }));
    if (!playingRef.current) seekAbs(time);
  }, [playingRef, seekAbs]);
  useEffect(() => {
    if (edgeSnapCue == null) return undefined;
    const timer = setTimeout(() => setEdgeSnapCue(undefined), 900);
    return () => clearTimeout(timer);
  }, [edgeSnapCue]);

  useEffect(
    () => setDocumentTitle({ filePath, working: working?.text, progress }),
    [progress, filePath, working?.text],
  );

  useEffect(() => {
    mainApi.setProgressBar(progress ?? -1);
  }, [progress]);

  useEffect(() => {
    ffmpegSetCustomFfPath(customFfPath);
  }, [customFfPath]);

  const cutFileTemplateOrDefault = cutFileTemplate ?? defaultCutFileTemplate;
  const cutMergedFileTemplateOrDefault = cutMergedFileTemplate ?? defaultCutMergedFileTemplate;
  // Deliberately not cutFileTemplate: the lossless and size-limited templates are
  // separate settings, so editing one mode's name never rewrites the other's.
  const sizeLimitedCutFileTemplateOrDefault = sizeLimitCutFileTemplate ?? defaultSizeLimitedCutFileTemplate;
  const sizeLimitedCutMergedFileTemplateOrDefault = sizeLimitCutMergedFileTemplate ?? defaultSizeLimitedCutMergedFileTemplate;
  const mergedFileTemplateOrDefault = mergedFileTemplate ?? defaultMergedFileTemplate;

  useEffect(() => {
    i18n.changeLanguage(language ?? undefined).catch(console.error);
    electron.ipcRenderer.send('setLanguage', language);
  }, [language]);

  // The menus differ between simple and advanced mode.
  useEffect(() => {
    electron.ipcRenderer.send('setSimpleMode', simpleMode);
  }, [simpleMode]);

  const isFileOpened = !!filePath;

  const onOutputFormatUserChange = useCallback(
    (newFormat: string) => {
      setFileFormat(newFormat);
      if (outFormatLocked) {
        setOutFormatLocked(
          newFormat === detectedFileFormat ? undefined : newFormat,
        );
      }
    },
    [detectedFileFormat, outFormatLocked, setFileFormat, setOutFormatLocked],
  );

  const previousPlaybackVolume = useRef(playbackVolume);
  const toggleMuted = useCallback(() => {
    setPlaybackVolume((volume) => {
      if (volume === 0) {
        return previousPlaybackVolume.current || 1;
      }
      previousPlaybackVolume.current = volume;
      return 0;
    });
  }, [setPlaybackVolume]);

  const toggleShowThumbnails = useCallback(
    () => setThumbnailsEnabled((v) => !v),
    [setThumbnailsEnabled],
  );

  const hideAllNotifications = hideNotifications === 'all';

  const showNotification = useCallback(
    (opts: SweetAlertOptions) => {
      if (!hideAllNotifications) {
        getSwal().toast.fire(opts);
      }
    },
    [hideAllNotifications],
  );

  const showOsNotification = useCallback(
    (text: string) => {
      // Only when ClipPress isn't in front: otherwise the app shows it already, and Windows can take a moment to
      // show one, holding up the main process right when the result appears.
      if (hideOsNotifications == null && !document.hasFocus()) {
        // on Linux app name is not shown in notification, see https://github.com/mifi/lossless-cut/issues/2794
        if (isLinux) mainApi.sendOsNotification({ title: 'ClipPress', body: text });
        else mainApi.sendOsNotification({ title: text });
      }
    },
    [hideOsNotifications],
  );

  const toggleExportConfirmEnabled = useCallback(
    () => setExportConfirmEnabled((v) => {
      const newVal = !v;
      showNotification({
        text: newVal
          ? i18n.t('Export options will be shown before exporting.')
          : i18n.t('Export options will not be shown before exporting.'),
      });
      return newVal;
    }),
    [setExportConfirmEnabled, showNotification],
  );

  const toggleShowKeyframes = useCallback(() => {
    setKeyframesEnabled((old) => {
      const enabled = !old;
      if (enabled && !calcShouldShowKeyframes(zoomedDuration)) {
        showNotification({
          text: i18n.t(
            'Key frames will show on the timeline. You need to zoom in to view them',
          ),
        });
      }
      return enabled;
    });
  }, [setKeyframesEnabled, showNotification, zoomedDuration]);

  const appendLastCommandsLog = useCallback((command: string) => {
    setFfmpegCommandLog((old) => [...old, { command, time: new Date() }]);
  }, []);
  const appendFfmpegCommandLog = useCallback(
    (args: string[]) => appendLastCommandsLog(getFfCommandLine('ffmpeg', args)),
    [appendLastCommandsLog],
  );

  // The Clips panel slides only when the user hides or shows it (not as a recording opens or closes); the tab that brings
  // it back shows once it has gone.
  const [clipsPanelAnimated, setClipsPanelAnimated] = useState(false);
  const [clipsPanelGone, setClipsPanelGone] = useState(false);
  useEffect(() => {
    if (!clipsPanelAnimated) return undefined;
    const timer = setTimeout(() => setClipsPanelAnimated(false), 600);
    return () => clearTimeout(timer);
  }, [clipsPanelAnimated, showRightBar]);
  const toggleSegmentsList = useCallback(() => {
    setClipsPanelAnimated(true);
    setShowRightBar((v) => !v);
    // A rename left open when the panel closed would otherwise start again when it reopens.
    setRenamingSegId(undefined);
  }, []);
  useEffect(() => {
    if (showRightBar) setClipsPanelGone(false);
  }, [showRightBar]);

  const toggleSafeOutputFileName = useCallback(
    () => setSafeOutputFileName((v) => {
      if (v) {
        showNotification({
          icon: 'info',
          text: i18n.t(
            'Output file name will not be sanitized, and any special characters will be preserved. This may cause the export to fail and can cause other funny issues. Use at your own risk!',
          ),
        });
      }
      return !v;
    }),
    [setSafeOutputFileName, showNotification],
  );

  // Also when a recording opens: the <video> is only there once one is.
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = playbackVolume;
  }, [playbackVolume, videoRef, filePath]);

  const mainStreams = useMemo(
    () => mainFileMeta?.ffprobeMeta.streams ?? [],
    [mainFileMeta?.ffprobeMeta.streams],
  );
  const mainFileFormat = useMemo(
    () => mainFileMeta?.ffprobeMeta.format,
    [mainFileMeta?.ffprobeMeta.format],
  );
  const mainFileChapters = useMemo(
    () => mainFileMeta?.ffprobeMeta.chapters,
    [mainFileMeta?.ffprobeMeta.chapters],
  );

  const subtitleStreams = useMemo(
    () => getSubtitleStreams(mainStreams),
    [mainStreams],
  );
  const videoStreams = useMemo(
    () => getRealVideoStreams(mainStreams),
    [mainStreams],
  );
  const audioStreams = useMemo(
    () => getAudioStreams(mainStreams),
    [mainStreams],
  );

  const mainVideoStream = useMemo(() => videoStreams[0], [videoStreams]);
  const mainAudioStream = useMemo(() => audioStreams[0], [audioStreams]);

  // Without the extension: this names the exports, and "clip.mp4" looked like renaming the recording itself.
  useEffect(() => {
    setCurrentClipName(filePath != null ? parsePath(filePath).name : undefined);
  }, [filePath]);

  const exportBaseName = useMemo(() => {
    if (filePath == null) return undefined;

    const fallbackBaseName = parsePath(filePath).name;
    const trimmedClipName = currentClipName?.trim();
    if (trimmedClipName == null || trimmedClipName.length === 0) return fallbackBaseName;

    const sourceExt = parsePath(filePath).ext;
    if (sourceExt !== '' && trimmedClipName.toLowerCase().endsWith(sourceExt.toLowerCase())) {
      const baseName = trimmedClipName.slice(0, -sourceExt.length).trim();
      return baseName.length > 0 ? baseName : fallbackBaseName;
    }

    return trimmedClipName;
  }, [currentClipName, filePath]);

  const exportNamingSourcePath = useMemo(() => {
    if (filePath == null) return undefined;
    const { dir, ext } = parsePath(filePath);
    return pathJoin(dir, `${exportBaseName ?? parsePath(filePath).name}${ext}`);
  }, [exportBaseName, filePath]);

  /**
   * Files the running export reads from, and which therefore may never be a destination.
   * `exportNamingSourcePath` tracks the editable clip name rather than the file on disk,
   * so both spellings have to be protected.
   */
  const exportProtectedPaths = useMemo(
    () => [filePath, exportNamingSourcePath],
    [exportNamingSourcePath, filePath],
  );

  const activeSubtitle = useMemo(
    () => (activeSubtitleStreamIndex != null
      ? subtitlesByStreamId[activeSubtitleStreamIndex]
      : undefined),
    [activeSubtitleStreamIndex, subtitlesByStreamId],
  );
  const activeVideoStream = useMemo(
    () => (activeVideoStreamIndex != null
      ? videoStreams.find((stream) => stream.index === activeVideoStreamIndex)
      : undefined) ?? mainVideoStream,
    [activeVideoStreamIndex, mainVideoStream, videoStreams],
  );
  const activeAudioStreams = useMemo(() => {
    let ret: FFprobeStream[] = [];
    if (activeAudioStreamIndexes.size > 0) ret = audioStreams.filter((stream) => activeAudioStreamIndexes.has(stream.index));
    if (ret.length === 0 && mainAudioStream != null) ret = [mainAudioStream];
    return ret;
  }, [activeAudioStreamIndexes, audioStreams, mainAudioStream]);
  const activeAudioGainByStreamId = useMemo<Record<number, number>>(
    () => Object.fromEntries(
      activeAudioStreams.flatMap((stream) => {
        const audioGainDb = (filePath != null
          ? paramsByStreamId.get(filePath)?.get(stream.index)?.audioGainDb
          : undefined) ?? 0;
        return isNeutralAudioGain(audioGainDb)
          ? []
          : [[stream.index, audioGainDb]];
      }),
    ),
    [activeAudioStreams, filePath, paramsByStreamId],
  );
  // The native player plays one audio track; with more, the FFmpeg-assisted player applies gain itself.
  const previewAudioGainControls = useMemo(
    () => activeAudioStreams.map((stream, index) => ({
      streamIndex: stream.index,
      label: activeAudioStreams.length === 1
        ? t('Main audio')
        : t('Audio {{index}}', { index: index + 1 }),
      audioGainDb: paramsByStreamId.get(filePath ?? '')?.get(stream.index)?.audioGainDb ?? defaultAudioGainDb,
    })),
    [activeAudioStreams, filePath, paramsByStreamId, t],
  );
  // The audio track's waveform is the first track's; a clip's popover says what it plays at when all tracks agree.
  const audioTrackGainDb = previewAudioGainControls[0]?.audioGainDb;
  const sharedTrackGainDb = previewAudioGainControls.every((control) => control.audioGainDb === audioTrackGainDb) ? audioTrackGainDb : undefined;
  const hasOverlayClips = overlayClips.length > 0;

  const updateOverlayClip = useCallback(
    (overlayId: string, updater: (clip: OverlayClip) => OverlayClip, undo?: UndoableSetOptions) => {
      // A burst of typing on one text box is one undo step; a drag passes its own gesture's key.
      setOverlayClips((existingClips) => existingClips.map((overlayClip) => (overlayClip.overlayId === overlayId
        ? sanitizeOverlayClip(updater(overlayClip), fileDuration)
        : overlayClip)), undo ?? { coalesceKey: `overlay:${overlayId}` });
    },
    [fileDuration, setOverlayClips],
  );

  const removeOverlayClip = useCallback((overlayId: string) => {
    setOverlayClips((existingClips) => existingClips.filter((overlayClip) => overlayClip.overlayId !== overlayId));
    setSelectedOverlayId((existingOverlayId) => (existingOverlayId === overlayId ? undefined : existingOverlayId));
  }, [setOverlayClips]);

  const addTextOverlay = useCallback(() => {
    if (mainVideoStream == null) return;
    const currentTime = getRelevantTime();
    const overlayClip = createDefaultTextOverlayClip({
      currentTime,
      fileDuration,
      overlayId: nanoid(),
      existingClips: overlayClips,
    });
    setOverlayClips((existingClips) => [...existingClips, overlayClip]);
    setSelectedOverlayId(overlayClip.overlayId);
    // Moved past a text already under the playhead: go to the new one, so it shows in the preview ready to edit.
    if (overlayClip.start !== currentTime) seekAbs(overlayClip.start);
  }, [fileDuration, getRelevantTime, mainVideoStream, overlayClips, seekAbs, setOverlayClips]);

  useEffect(() => {
    if (selectedOverlayId == null) return;
    if (
      overlayClips.some(
        (overlayClip) => overlayClip.overlayId === selectedOverlayId,
      )
    ) return;
    setSelectedOverlayId(undefined);
  }, [overlayClips, selectedOverlayId]);

  useEffect(() => {
    if (selectedOverlayId == null) return undefined;
    const overlayId = selectedOverlayId;

    function onKeyDown(event: KeyboardEvent) {
      if (exportConfirmOpen || streamsSelectorShown || settingsVisible || keyboardShortcutsVisible) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const { target } = event;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      // Keys pressed in a dialog or menu (e.g. on a sweetalert2 dialog's buttons) are theirs.
      if (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], .swal2-container') != null) return;

      event.preventDefault();
      event.stopPropagation();
      removeOverlayClip(overlayId);
    }

    // Capture on window, ahead of the editor's shortcuts (a bubbling listener on document), so the
    // key deletes the selected text and doesn't also remove a cut point (Backspace is bound to that).
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [exportConfirmOpen, keyboardShortcutsVisible, removeOverlayClip, selectedOverlayId, settingsVisible, streamsSelectorShown]);

  // 360 means we don't modify rotation gtrgt
  const isRotationSet = rotation !== 360;
  const effectiveRotation = useMemo(
    () => (isRotationSet
      ? rotation
      : getVideoStreamRotation(activeVideoStream)),
    [isRotationSet, activeVideoStream, rotation],
  );

  const zoomAbs = useCallback(
    (fn: (v: number) => number) => setZoom((z) => Math.min(Math.max(fn(z), 1), zoomMax)),
    [],
  );
  const zoomRel = useCallback(
    (rel: number) => zoomAbs((z) => z + rel * (1 + z / 10)),
    [zoomAbs],
  );

  const comfortZoom = isDurationValid(fileDuration)
    ? Math.max(fileDuration / 100, 1)
    : undefined;
  const timelineToggleComfortZoom = useCallback(() => {
    if (!comfortZoom) return;

    zoomAbs((prevZoom) => {
      if (prevZoom === 1) return comfortZoom;
      return 1;
    });
  }, [comfortZoom, zoomAbs]);

  const maxLabelLength = safeOutputFileName ? 100 : 500;

  const checkFileOpened = useCallback(() => {
    if (isFileOpened) return true;
    getSwal().toast.fire({
      icon: 'info',
      title: i18n.t('You need to open a media file first'),
    });
    return false;
  }, [isFileOpened]);

  const {
    cutSegments,
    cutSegmentsHistory,
    createSegmentsFromKeyframes,
    shuffleSegments,
    detectBlackScenes,
    detectSilentScenes,
    detectSceneChanges,
    removeSegment,
    removeSegments,
    resetToWholeRecording,
    invertAllSegments,
    fillSegmentsGaps,
    combineOverlappingSegments,
    combineSelectedSegments,
    shiftAllSegmentTimes,
    alignSegmentTimesToKeyframes,
    updateSegOrder,
    updateSegOrders,
    reorderSegsByStartTime,
    addSegment,
    setCutStart,
    setCutEnd,
    labelSegment,
    splitCurrentSegment,
    focusSegmentAtCursor,
    selectSegmentsAtCursor,
    createNumSegments,
    createFixedDurationSegments,
    createFixedByteSizedSegments,
    createRandomSegments,
    getSegEstimatedSize,
    haveInvalidSegs,
    currentSegIndexSafe,
    currentCutSeg,
    inverseCutSegments,
    clearSegments,
    clearSegColorCounter,
    loadCutSegments,
    setCutTime,
    setCurrentSegIndex,
    labelSelectedSegments,
    deselectAllSegments,
    selectAllSegments,
    selectOnlyCurrentSegment,
    toggleCurrentSegmentSelected,
    invertSelectedSegments,
    removeSelectedSegments,
    selectSegmentsByLabel,
    selectSegmentsByExpr,
    selectAllMarkers,
    mutateSegmentsByExpr,
    toggleSegmentSelected,
    selectOnlySegment,
    selectedSegments,
    segmentsOrInverse,
    segmentsToExport,
    duplicateCurrentSegment,
    duplicateSegment,
    updateSegAtIndex,
    findSegmentsAtCursor,
    maybeCreateFullLengthSegment,
    currentCutSegOrWholeTimeline,
    segColorCounter,
  } = useSegments({
    getEdgeSnapDistance: getEdgeSnapDistanceNow,
    onEdgeSnap,
    filePath,
    workingRef,
    setWorking,
    setProgress,
    videoStream: activeVideoStream,
    fileDuration,
    getRelevantTime,
    maxLabelLength,
    checkFileOpened,
    invertCutSegments,
    segmentsToChaptersOnly,
    timecodePlaceholder,
    parseTimecode,
    appendFfmpegCommandLog,
    fileDurationNonZero,
    mainFileMeta: mainFileMeta?.ffprobeMeta,
    seekAbs,
    activeVideoStreamIndex,
    activeAudioStreamIndexes,
    handleError,
    showGenericDialog,
    simpleMode,
    ffmpegHwaccel,
    editTracker: editHistoryOrder.tracker('segments'),
  });

  const [speedControlsBySegment, setSpeedControlsBySegment, speedControlsHistory] = useUndoableState<Record<string, boolean>>({}, {
    tracker: editHistoryOrder.tracker('speedControls'),
  });

  const editHistories = useMemo<Record<EditDomain, EditDomainHistory>>(() => ({
    segments: cutSegmentsHistory,
    overlays: overlayClipsHistory,
    streamParams: streamParamsHistory,
    speedControls: speedControlsHistory,
  }), [cutSegmentsHistory, overlayClipsHistory, speedControlsHistory, streamParamsHistory]);
  // Clips picked in the Clips panel (Ctrl or Shift+click, a selection box), for Delete; with none picked, Delete takes
  // the selected clip. Apart from a segment's own `selected`, which is whether it goes in the export.
  const [pickedClipIds, setPickedClipIds] = useState<readonly string[]>([]);
  const clipIds = useMemo(() => cutSegments.map((segment) => segment.segId), [cutSegments]);
  const pickedClips = useMemo(() => clipIds.filter((id) => pickedClipIds.includes(id)), [clipIds, pickedClipIds]);
  const onClipClick = useCallback((index: number, how: PickHow = 'one') => {
    const clicked = cutSegments[index];
    if (clicked == null) return;
    setSelectedOverlayId(undefined);
    // Advanced mode has its own selection (the export ticks).
    const next = pickClip({ ids: clipIds, picked: pickedClips, currentId: cutSegments[currentSegIndexSafe]?.segId, clickedId: clicked.segId, how: simpleMode ? how : 'one' });
    setPickedClipIds(next.picked);
    setCurrentSegIndex(Math.max(0, clipIds.indexOf(next.currentId)));
  }, [clipIds, currentSegIndexSafe, cutSegments, pickedClips, setCurrentSegIndex, simpleMode]);
  const onPickClipsInBox = useCallback((touched: readonly string[], additive: boolean, before: readonly string[]) => {
    setPickedClipIds(pickInBox({ ids: clipIds, before, touched, additive }));
  }, [clipIds]);
  const removeSelectedClips = useCallback(() => {
    if (invertCutSegments || workingRef.current) return;
    // The untouched whole recording is what's left with nothing to remove.
    if (cutSegments.length === 1 && cutSegments[0]!.initial) return;
    const ids = getClipsToRemove({ ids: clipIds, picked: pickedClips, currentId: cutSegments[currentSegIndexSafe]?.segId });
    if (ids.length === 0) return;
    removeSegments(ids);
    setPickedClipIds([]);
  }, [clipIds, currentSegIndexSafe, cutSegments, invertCutSegments, pickedClips, removeSegments, workingRef]);

  /**
   * Back to the recording as it opened: one clip of the whole recording, no text, the track volume as it was. App
   * settings and the recording stay. One Ctrl+Z brings it all back, and the saved edits are kept as a backup copy first
   * (`.replaced-<time>`, retired by the daily clean-up after 30 days); then the fresh state autosaves like any edit.
   */
  const startOver = useCallback(async () => {
    if (filePath == null || workingRef.current) return;
    const savePaths = getProjectSavePaths(filePath, projectFileLocation, customOutDir, getProjectStoreEnv());
    // Busy (quietly) while the saved edits are copied: nothing else opens meanwhile. Cancel (shown if it takes a
    // while) leaves the clips as they are.
    const abortController = new AbortController();
    setWorking({ text: i18n.t('Starting over'), quiet: true, abortController });
    let kept: boolean;
    try {
      kept = await keepBackupCopies([...savePaths, ...(projectSession?.loadedProjectPath != null ? [projectSession.loadedProjectPath] : [])]);
    } finally {
      setWorking(undefined);
    }
    if (abortController.signal.aborted) return;
    // Without a copy, the edits autosave replaces could only come back by undo, and not after the recording closes.
    if (!kept) {
      errorToast(i18n.t('Could not keep a copy of your edits, so nothing was changed.'));
      return;
    }
    editHistoryOrder.group(() => {
      resetToWholeRecording();
      setOverlayClips([]);
      setParamsByStreamId((existing) => {
        const params = existing.get(filePath);
        if (params == null || ![...params.values()].some((streamParams) => streamParams.audioGainDb != null)) return existing;
        const next = new Map(existing);
        next.set(filePath, new Map([...params].map(([streamIndex, streamParams]) => [streamIndex, omit(streamParams, 'audioGainDb')])));
        return next;
      });
      setSpeedControlsBySegment({});
    });
    setPickedClipIds([]);
    setSelectedOverlayId(undefined);
    setCurrentSegIndex(0);
  }, [customOutDir, editHistoryOrder, filePath, projectFileLocation, projectSession?.loadedProjectPath, resetToWholeRecording, setCurrentSegIndex, setOverlayClips, setParamsByStreamId, setSpeedControlsBySegment, setWorking, workingRef]);

  const [editingSpeedSegmentId, setEditingSpeedSegmentId] = useState<string>();
  const editingSpeedSegment = cutSegments.find((segment) => segment.segId === editingSpeedSegmentId);
  // Retimed segments show their speed bar until hidden; Ctrl+R toggles it like Resolve's retime controls.
  const speedControlsSegmentIds = useMemo(() => new Set(invertCutSegments ? [] : cutSegments
    .filter((segment) => segment.end != null && (speedControlsBySegment[segment.segId] ?? getSegmentSpeed(segment) !== 1))
    .map((segment) => segment.segId)), [cutSegments, invertCutSegments, speedControlsBySegment]);
  const hasSegmentSpeedChanges = segmentsOrInverse.selected.some((segment) => getSegmentSpeed(segment) !== 1);
  const hasSegmentCropChanges = segmentsOrInverse.selected.some((segment) => hasSegmentCrop(segment));
  const hasSegmentVolumeChanges = segmentsOrInverse.selected.some((segment) => isClipVolumeChanged(segment));
  // Clip volumes play through the native player too (with the FFmpeg-assisted player they're only in the export).
  const previewClipVolumes = useMemo<PreviewClipVolume[]>(() => {
    if (invertCutSegments || !cutSegments.some((segment) => segment.end != null && isClipVolumeChanged(segment))) return [];
    // Where clips overlap, the same one wins as for the speed preview: the selected clip, then the first one.
    const active = cutSegments[currentSegIndexSafe];
    const ordered = active != null ? [active, ...cutSegments.filter((segment) => segment !== active)] : cutSegments;
    return ordered.flatMap((segment) => (segment.end != null
      ? [{ start: segment.start, end: segment.end, factor: getPreviewGainFactor(combineAudioGain(undefined, segment)) }]
      : []));
  }, [currentSegIndexSafe, cutSegments, invertCutSegments]);
  usePreviewAudioGain(videoRef, activeAudioStreams.length === 1 ? activeAudioGainByStreamId[activeAudioStreams[0]!.index] : undefined, filePath, previewClipVolumes);
  const [editingCropSegmentId, setEditingCropSegmentId] = useState<string>();
  // Finishes crop editing like its Done button (set by the crop editor while it's open).
  const cropFinishRef = useRef<() => void>();
  const editingCropSegment = !invertCutSegments && currentCutSeg?.segId === editingCropSegmentId ? currentCutSeg : undefined;
  const previewSegment = invertCutSegments ? undefined : getPreviewSegment(cutSegments, currentSegIndexSafe, relevantTime, fileDuration);
  const previewCrop = useMemo(() => getSegmentCrop(editingCropSegment ?? previewSegment ?? {}), [editingCropSegment, previewSegment]);

  const editSegmentCrop = useCallback((index: number) => {
    const segment = cutSegments[index];
    if (segment?.end == null || activeVideoStream?.width == null || activeVideoStream.height == null || invertCutSegments || workingRef.current) return;
    pause();
    // The full-size waveform takes the preview's place, which cropping needs; the small waveform lane can stay.
    if (waveformModePreference === 'big-waveform') setWaveformMode(undefined);
    setCurrentSegIndex(index);
    // Stay where the playhead is when it's in this clip (on a text just added, say); otherwise show the clip's start.
    const time = getRelevantTime();
    if (!(time >= segment.start && time <= segment.end)) seekAbs(segment.start);
    setSelectedOverlayId(undefined);
    setEditingCropSegmentId(segment.segId);
  }, [activeVideoStream, cutSegments, getRelevantTime, invertCutSegments, pause, seekAbs, setCurrentSegIndex, setWaveformMode, waveformModePreference, workingRef]);

  // Add Text while zooming / cropping finishes that first (like Done), so the new text shows and can be edited.
  const addTextOverlayNow = useCallback(() => {
    if (editingCropSegmentId != null) {
      if (cropFinishRef.current != null) cropFinishRef.current();
      else setEditingCropSegmentId(undefined);
    }
    addTextOverlay();
  }, [addTextOverlay, editingCropSegmentId]);

  const changeSegmentCrop = useCallback((crop: SegmentCrop) => {
    if (editingCropSegmentId == null || workingRef.current) return;
    const index = cutSegments.findIndex((segment) => segment.segId === editingCropSegmentId);
    if (index === -1 || cutSegments[index]?.end == null) return;
    if (JSON.stringify(getSegmentCrop(cutSegments[index]!)) !== JSON.stringify(crop)) updateSegAtIndex(index, { crop });
  }, [cutSegments, editingCropSegmentId, updateSegAtIndex, workingRef]);

  const changeSegmentSpeed = useCallback((segmentId: string, speed: number) => {
    if (!isSegmentSpeedValid(speed) || workingRef.current) return;
    const index = cutSegments.findIndex((segment) => segment.segId === segmentId);
    if (index === -1 || cutSegments[index]?.end == null) return;
    if (getSegmentSpeed(cutSegments[index]!) !== speed) updateSegAtIndex(index, { speed });
    // Pin a bar shown by default so dragging back to 100% does not make it vanish mid-edit.
    setSpeedControlsBySegment((existing) => (existing[segmentId] != null ? existing : { ...existing, [segmentId]: true }), { merge: true });
  }, [cutSegments, setSpeedControlsBySegment, updateSegAtIndex, workingRef]);

  const editSegmentSpeed = useCallback((index: number) => {
    const segment = cutSegments[index];
    if (segment?.end == null || invertCutSegments || workingRef.current) return;
    setCurrentSegIndex(index);
    setSpeedControlsBySegment((existing) => (existing[segment.segId] ? existing : { ...existing, [segment.segId]: true }), { merge: true });
    setEditingSpeedSegmentId(segment.segId);
  }, [cutSegments, invertCutSegments, setCurrentSegIndex, setSpeedControlsBySegment, workingRef]);

  /** Like deleting a retime in Resolve: back to 100%, and the bar returns to its default (hidden). One undo step. */
  const removeSegmentSpeed = useCallback((segmentId: string) => {
    if (workingRef.current) return;
    const index = cutSegments.findIndex((segment) => segment.segId === segmentId);
    if (index === -1) return;
    const speedChanged = getSegmentSpeed(cutSegments[index]!) !== 1;
    if (speedChanged) updateSegAtIndex(index, { speed: 1 });
    // Dropping the pin (rather than storing "hidden") lets an undo of the speed bring the bar back.
    setSpeedControlsBySegment((existing) => {
      if (!(segmentId in existing)) return existing;
      return Object.fromEntries(Object.entries(existing).filter(([id]) => id !== segmentId));
    }, { merge: speedChanged });
  }, [cutSegments, setSpeedControlsBySegment, updateSegAtIndex, workingRef]);

  const toggleSpeedControlsForSegment = useCallback((segmentId: string) => {
    const segment = cutSegments.find((candidate) => candidate.segId === segmentId);
    if (segment?.end == null || invertCutSegments || workingRef.current) return;
    setSpeedControlsBySegment((existing) => ({ ...existing, [segmentId]: !speedControlsSegmentIds.has(segmentId) }));
  }, [cutSegments, invertCutSegments, setSpeedControlsBySegment, speedControlsSegmentIds, workingRef]);

  /** A clip's own volume, from its popover on the audio track. One slider drag is one undo step. */
  const changeSegmentVolume = useCallback((segmentId: string, { audioGainDb: requestedDb, audioMuted: requestedMuted }: ClipVolumeChange, dragId: number | undefined) => {
    if (workingRef.current || invertCutSegments) return;
    const index = cutSegments.findIndex((segment) => segment.segId === segmentId);
    const segment = cutSegments[index];
    if (segment?.end == null) return;
    const audioGainDb = sanitizeClipGainDb(requestedDb);
    const audioMuted = requestedMuted ? true : undefined;
    if (sanitizeClipGainDb(segment.audioGainDb) === audioGainDb && (segment.audioMuted === true) === requestedMuted) return;
    updateSegAtIndex(index, { audioGainDb, audioMuted }, dragId != null ? { coalesceKey: `clip-volume:${segmentId}:${dragId}` } : undefined);
  }, [cutSegments, invertCutSegments, updateSegAtIndex, workingRef]);

  const [clipVolumeEditor, setClipVolumeEditor] = useState<{ segId: string, anchor: { x: number, y: number } }>();
  const editClipVolume = useCallback((index: number, point: { x: number, y: number }) => {
    const segment = cutSegments[index];
    if (segment?.end == null || invertCutSegments || workingRef.current) return;
    setCurrentSegIndex(index);
    setClipVolumeEditor({ segId: segment.segId, anchor: point });
  }, [cutSegments, invertCutSegments, setCurrentSegIndex, workingRef]);
  const clipVolumeEditorIndex = clipVolumeEditor != null ? cutSegments.findIndex((segment) => segment.segId === clipVolumeEditor.segId) : -1;
  const clipVolumeEditorSegment = cutSegments[clipVolumeEditorIndex];
  const closeClipVolumeEditor = useCallback(() => setClipVolumeEditor(undefined), []);
  const onClipVolumeChange = useCallback((volume: ClipVolumeChange, dragId: number | undefined) => {
    if (clipVolumeEditor != null) changeSegmentVolume(clipVolumeEditor.segId, volume, dragId);
  }, [changeSegmentVolume, clipVolumeEditor]);

  const toggleSegmentSpeedControls = useCallback(() => {
    if (currentCutSeg != null) toggleSpeedControlsForSegment(currentCutSeg.segId);
  }, [currentCutSeg, toggleSpeedControlsForSegment]);

  const previewSegmentSpeed = invertCutSegments ? 1 : getPreviewSegmentSpeed(cutSegments, currentSegIndexSafe, relevantTime, fileDuration);
  useEffect(() => setSegmentPreviewSpeed(previewSegmentSpeed), [previewSegmentSpeed, setSegmentPreviewSpeed]);
  useEffect(() => {
    speedControlsHistory.reset({});
    setEditingSpeedSegmentId(undefined);
    setEditingCropSegmentId(undefined);
  }, [filePath, speedControlsHistory]);

  const { projectFileSavePaths, getProjectFileSavePaths, endProjectSession, whenProjectSaved, saveProjectNow, flushProject, hasUnsavedProjectChanges, hasSavedProject, deleteProjectFile } = useSegmentsAutoSave({
    autoSaveProjectFile,
    projectFileLocation,
    filePath,
    projectSession,
    customOutDir,
    fileDuration,
    cutSegments,
    customTagsByFile,
    paramsByStreamId,
    overlayClips,
  });

  // Old backups, and the edits of recordings gone for 30 days, go to the Recycle Bin while ClipPress is idle (#91): not
  // while it opens a clip or exports, nor while a dialog waits for an answer (such as where a recording went).
  useProjectCleanup({ isBusy: () => workingRef.current || genericDialog != null, deleteProjectFile, recentFiles, customOutDir });
  // The timeline cache on disk is kept within its limits: shortly after starting, and after it grows.
  useEffect(() => schedulePruneTimelineCache(5000), []);
  // "Can't find the recording": opening edits whose recording was moved or renamed (#16).
  const relocateRecording = useRelocateRecording({ showGenericDialog, confirmDialog, customOutDir });

  // Edits found next to the recording or in the export folder (where older versions saved them) move to ClipPress's
  // folder, as do the edits of a recording found in a new place (#16): once autosave has the project everywhere it saves
  // it, the old files go to the Recycle Bin. If that save can't happen, they stay, and the next open tries again.
  const sidecarRetirementRef = useRef<{ sessionId: number, paths: string[] }>();
  useEffect(() => {
    const pending = sidecarRetirementRef.current;
    if (pending == null || projectSession?.id !== pending.sessionId || projectFileSavePaths == null) return;
    sidecarRetirementRef.current = undefined;
    const oldPaths = pending.paths.filter((oldPath) => !projectFileSavePaths.some((savePath) => isSameProjectPath(savePath, oldPath, isWindows || isMac)));
    // Autosave off: nothing is saved in ClipPress's folder, so the old files stay where they are.
    if (oldPaths.length === 0 || !autoSaveProjectFile) return;
    (async () => {
      saveProjectNow();
      await whenProjectSaved();
      // Only once this session has the project there: it wrote it (a failed save doesn't count), or loaded it from there.
      if (!projectFileSavePaths.every((savePath) => hasSavedProject(pending.sessionId, savePath))) return;
      for (const oldPath of oldPaths) {
        // eslint-disable-next-line no-await-in-loop
        await trashFile(oldPath);
        logProjectFiles('info', `Moved an old copy of the edits to the Recycle Bin, now kept in ${projectFileSavePaths.join(' and ')}: ${oldPath}`);
      }
    })().catch((err) => console.warn('Could not move an old project file to the Recycle Bin', err));
  }, [autoSaveProjectFile, hasSavedProject, projectFileSavePaths, projectSession, saveProjectNow, whenProjectSaved]);

  // The window (and with it the app, and a downloaded update's installation) only closes once
  // the project is saved, or the user has chosen to close without saving.
  useEffect(() => setCloseRequestHandlers({
    onCloseRequest: () => saveBeforeClose({
      flush: flushProject,
      slowAfterMs: 2000,
      showSaving: showSavingBeforeClose,
      showFailed: askAfterFailedSaveBeforeClose,
    }),
    onSaveNow: saveProjectNow,
    hasUnsavedChanges: hasUnsavedProjectChanges,
  }), [flushProject, hasUnsavedProjectChanges, saveProjectNow]);

  const {
    nonCopiedExtraStreams,
    exportExtraStreams,
    mainCopiedThumbnailStreams,
    numStreamsToCopy,
    toggleStripVideo,
    toggleStripAudio,
    toggleStripSubtitle,
    toggleStripThumbnail,
    toggleStripAll,
    copyStreamIdsByFile,
    setCopyStreamIdsByFile,
    copyFileStreams,
    mainCopiedStreams,
    setCopyStreamIdsForPath,
    toggleCopyStreamId,
    isCopyingStreamId,
    toggleCopyStreamIds,
    changeEnabledStreamsFilter,
    applyEnabledStreamsFilter,
    toggleCopyAllStreamsForPath,
  } = useStreamsMeta({
    mainStreams,
    externalFilesMeta,
    filePath,
    autoExportExtraStreams,
    showGenericDialog,
  });

  const sizeLimitedStreams = useMemo(
    () => pickSizeLimitedStreams(mainCopiedStreams),
    [mainCopiedStreams],
  );
  const sizeLimitedSourceFps = useMemo(
    () => (sizeLimitedStreams.videoStream != null
      ? getStreamFps(sizeLimitedStreams.videoStream)
      : undefined),
    [sizeLimitedStreams.videoStream],
  );
  const sizeLimitedAudioGainDb = useMemo(() => {
    if (filePath == null || sizeLimitedStreams.audioStream == null) return undefined;
    return paramsByStreamId
      .get(filePath)
      ?.get(sizeLimitedStreams.audioStream.index)?.audioGainDb;
  }, [filePath, paramsByStreamId, sizeLimitedStreams.audioStream]);

  const onDurationChange = useCallback<ReactEventHandler<HTMLVideoElement>>(
    (e) => {
      // Some files report duration infinity first, then proper duration later
      // Sometimes after seeking to end of file, duration might change
      const { duration: durationNew } = e.currentTarget;
      console.log('onDurationChange', durationNew);
      if (isDurationValid(durationNew)) {
        setFileDuration(durationNew);
        maybeCreateFullLengthSegment(durationNew);
      }
    },
    [maybeCreateFullLengthSegment],
  );

  const segmentsAtCursor = useMemo(
    () => findSegmentsAtCursor(commandedTime).map((index) => cutSegments[index]),
    [commandedTime, cutSegments, findSegmentsAtCursor],
  );
  const firstSegmentAtCursor = useMemo(
    () => segmentsAtCursor[0],
    [segmentsAtCursor],
  );

  const segmentAtCursorRef = useRef<StateSegment>();
  useEffect(() => {
    segmentAtCursorRef.current = firstSegmentAtCursor;
  }, [firstSegmentAtCursor]);

  // Simple mode's Split button: the playhead has to be inside a clip, not on its edge, where splitting does nothing.
  // Uses the same time and clip as splitCurrentSegment.
  const canSplitAtPlayhead = useMemo(() => {
    if (!simpleMode) return false;
    const segment = cutSegments[findSegmentsAtCursor(relevantTime)[0] ?? -1];
    return segment?.end != null && relevantTime > segment.start && relevantTime < segment.end;
  }, [cutSegments, findSegmentsAtCursor, relevantTime, simpleMode]);

  // Simple mode renames a clip in place in the Clips panel, as its pencil does, opening the panel if it's hidden.
  const labelCurrentSegment = useCallback(() => {
    const segment = cutSegments[currentSegIndexSafe];
    if (simpleMode && !invertCutSegments && segment != null) {
      setShowRightBar(true);
      setRenamingSegId(segment.segId);
      return;
    }
    labelSegment(currentSegIndexSafe);
  }, [currentSegIndexSafe, cutSegments, invertCutSegments, labelSegment, simpleMode]);

  const seekRelPercent = useCallback(
    (val: number) => {
      if (!isDurationValid(zoomedDuration)) return;
      seekRel(val * zoomedDuration);
    },
    [seekRel, zoomedDuration],
  );

  const shortStep = useCallback(
    (direction: number) => {
      if (!videoRef.current) return;

      // If we don't know fps, just assume 30 (for example if unknown audio file)
      const fps = detectedFps || 30;

      // try to align with frame
      const currentTimeNearestFrameNumber = getFrameCountRaw(
        fps,
        videoRef.current.currentTime,
      );
      invariant(currentTimeNearestFrameNumber != null);
      const nextFrame = currentTimeNearestFrameNumber + direction;
      seekAbs(nextFrame / fps);
    },
    [detectedFps, seekAbs, videoRef],
  );

  const jumpSegStart = useCallback(
    (index: number) => {
      const seg = cutSegments[index];
      if (seg != null) seekAbs(seg.start);
    },
    [cutSegments, seekAbs],
  );
  const jumpSegEnd = useCallback(
    (index: number) => {
      const seg = cutSegments[index];
      if (seg?.end != null) seekAbs(seg.end);
    },
    [cutSegments, seekAbs],
  );
  const jumpCutStart = useCallback(
    () => jumpSegStart(currentSegIndexSafe),
    [currentSegIndexSafe, jumpSegStart],
  );
  const jumpCutEnd = useCallback(
    () => jumpSegEnd(currentSegIndexSafe),
    [currentSegIndexSafe, jumpSegEnd],
  );
  const jumpTimelineStart = useCallback(() => seekAbs(0), [seekAbs]);
  const jumpTimelineEnd = useCallback(
    () => seekAbs(fileDuration),
    [fileDuration, seekAbs],
  );

  // const getSafeCutTime = useCallback((cutTime, next) => ffmpeg.getSafeCutTime(neighbouringFrames, cutTime, next), [neighbouringFrames]);

  const outputDir = getOutDir(customOutDir, filePath);

  const increaseRotation = useCallback(() => {
    setRotation((r) => (r + 90) % 450);
    setHideCompatPlayer(false);
    // Matroska is known not to work, so we warn user. See https://github.com/mifi/lossless-cut/discussions/661
    const supportsRotation = !isMatroska(fileFormat);
    if (!supportsRotation) {
      showNotification({
        text: i18n.t(
          'Lossless rotation might not work with this file format. You may try changing to MP4',
        ),
      });
    }
  }, [fileFormat, showNotification]);

  const { ensureWritableOutDir, ensureAccessToSourceDir } = useDirectoryAccess({
    setCustomOutDir,
  });

  const toggleCaptureFormat = useCallback(
    () => setCaptureFormat((f) => {
      const captureFormats: CaptureFormat[] = ['jpeg', 'png', 'webp'];
      let index = captureFormats.indexOf(f);
      if (index === -1) index = 0;
      index += 1;
      if (index >= captureFormats.length) index = 0;
      const newCaptureFormat = captureFormats[index];
      invariant(newCaptureFormat != null);
      return newCaptureFormat;
    }),
    [setCaptureFormat],
  );

  const toggleKeyframeCut = useCallback(
    (showMessage?: boolean) => setKeyframeCut((val) => {
      const newVal = !val;
      if (showMessage) {
        if (newVal) {
          showNotification({
            title: i18n.t('Keyframe cut enabled'),
            text: i18n.t(
              'Will now cut at the nearest keyframe before the desired start cutpoint. This is recommended for most files.',
            ),
          });
        } else {
          showNotification({
            title: i18n.t('Keyframe cut disabled'),
            text: i18n.t(
              'Will now cut at the exact position, but may leave an empty portion at the beginning of the file. You may have to set the cutpoint a few frames before the next keyframe to achieve a precise cut',
            ),
            timer: 7000,
          });
        }
      }
      return newVal;
    }),
    [showNotification, setKeyframeCut],
  );

  const toggleSimpleMode = useCallback(
    () => setSimpleMode((v) => !v),
    [setSimpleMode],
  );

  const canMergeClips = segmentsOrInverse.selected.length >= 2;
  const effectiveExportMode = useMemo(() => {
    if (segmentsToChaptersOnly) return 'segments_to_chapters';
    // With one clip there's nothing to join: it's one file (the saved choice is kept for when there are more clips).
    if (!canMergeClips) return 'separate';
    if (autoMerge && autoDeleteMergedSegments) return 'merge';
    if (autoMerge) return 'merge+separate';
    return 'separate';
  }, [autoDeleteMergedSegments, autoMerge, canMergeClips, segmentsToChaptersOnly]);

  const changeOutDir = useCallback(async () => {
    const newOutDir = await askForOutDir(outputDir);
    if (newOutDir) setCustomOutDir(newOutDir);
  }, [outputDir, setCustomOutDir]);

  const ensureWritableOutDirWithFilePath = useCallback(
    async ({ outDir }: { outDir: string | undefined }) => ensureWritableOutDir({ inputPath: filePath, outDir }),
    [ensureWritableOutDir, filePath],
  );

  const changeProjectFileLocation = useCallback(async (location: ProjectFileLocation) => {
    // The place outside ClipPress's folder is the last one saved to ("Both" saves there second).
    const path = getProjectFileSavePaths(location)?.at(-1);
    // Next to a recording (path is undefined with no file open), the folder may need permission first.
    if (path != null && location !== 'app') {
      try {
        await ensureAccessToSourceDir(path);
      } catch (err) {
        if (err instanceof DirectoryAccessDeclinedError) return;
        console.error(err);
      }
    }
    setProjectFileLocation(location);
  }, [
    ensureAccessToSourceDir,
    getProjectFileSavePaths,
    setProjectFileLocation,
  ]);

  const userSettingsContext = useMemo<UserSettingsContextType>(() => {
    const { settings, ...rest } = allUserSettings;

    return {
      ...settings,
      ...rest,
      toggleCaptureFormat,
      changeOutDir,
      toggleKeyframeCut,
      toggleExportConfirmEnabled,
      toggleSimpleMode,
      toggleSafeOutputFileName,
      effectiveExportMode,
      ensureWritableOutDirWithFilePath,
    };
  }, [
    allUserSettings,
    changeOutDir,
    effectiveExportMode,
    ensureWritableOutDirWithFilePath,
    toggleCaptureFormat,
    toggleExportConfirmEnabled,
    toggleKeyframeCut,
    toggleSafeOutputFileName,
    toggleSimpleMode,
  ]);

  // A boolean, not the segments: the context (read by every clip and list row) shouldn't change on every edit.
  const onlyInitialSegment = isInitialSegment(cutSegments);
  const segColorsContext = useMemo<SegColorsContextType>(
    () => ({
      getSegColor: (seg: SegmentColorIndex | undefined) => {
        const color = getSegColor(seg);
        return preferStrongColors
          ? color
          : color.desaturate(0.25);
      },
      nextSegColorIndex: onlyInitialSegment
        ? segColorCounter
        : segColorCounter + 1,
    }),
    [onlyInitialSegment, preferStrongColors, segColorCounter],
  );

  const onActiveSubtitleChange = useCallback(
    async (index?: number) => {
      if (index == null) {
        setActiveSubtitleStreamIndex(undefined);
        return;
      }
      if (subtitlesByStreamId[index]) {
        // Already loaded
        setActiveSubtitleStreamIndex(index);
        return;
      }
      const subtitleStream = index != null && subtitleStreams.find((s) => s.index === index);
      if (!subtitleStream || workingRef.current) return;

      setWorking({ text: i18n.t('Loading subtitle') });
      try {
        await withErrorHandling(
          async () => {
            invariant(filePath != null);
            await loadSubtitle({ filePath, index, subtitleStream });
            setActiveSubtitleStreamIndex(index);
          },
          i18n.t('Failed to load subtitles from track {{index}}', { index }),
        );
      } finally {
        setWorking(undefined);
      }
    },
    [
      subtitlesByStreamId,
      subtitleStreams,
      workingRef,
      setWorking,
      withErrorHandling,
      filePath,
      loadSubtitle,
    ],
  );

  const onActiveVideoStreamChange = useCallback(
    (videoStreamIndex?: number) => {
      invariant(videoRef.current);
      setHideCompatPlayer(false);
      enableVideoTrack(videoRef.current, videoStreamIndex);
      setActiveVideoStreamIndex(videoStreamIndex);
    },
    [videoRef],
  );

  const onActiveAudioStreamsChange = useCallback(
    (audioStreamIndexes: Set<number>) => {
      invariant(videoRef.current);
      setHideCompatPlayer(false);
      enableAudioTrack(videoRef.current, [...audioStreamIndexes][0]);
      setActiveAudioStreamIndexes(audioStreamIndexes);
    },
    [videoRef],
  );

  const allFilesMeta = useMemo(
    () => ({
      ...externalFilesMeta,
      ...(filePath && mainFileMeta != null
        ? { [filePath]: mainFileMeta.ffprobeMeta }
        : {}),
    }),
    [externalFilesMeta, filePath, mainFileMeta],
  );

  // total number of streams for ALL files
  const numStreamsTotal = Object.values(allFilesMeta).flatMap(
    ({ streams }) => streams,
  ).length;
  const hasAdditionalVideoStreamsForTextExport = useMemo(() => {
    if (filePath == null || activeVideoStream == null) return false;
    return copyFileStreams.some(({ path, streamIds }) => streamIds.some((streamId) => {
      const stream = allFilesMeta[path]?.streams.find(
        (stream2) => stream2.index === streamId,
      );
      return (
        stream?.codec_type === 'video'
          && !(path === filePath && streamId === activeVideoStream.index)
      );
    }));
  }, [activeVideoStream, allFilesMeta, copyFileStreams, filePath]);

  const hasAudio = !!mainAudioStream;
  const hasVideo = !!mainVideoStream;

  const forceBigWaveform = !hasVideo && hasAudio;

  const toggleWaveformMode = useCallback(() => {
    if (forceBigWaveform) return;

    // eslint-disable-next-line unicorn/prefer-switch
    if (waveformModePreference === 'waveform') {
      setWaveformMode('big-waveform');
    } else if (waveformModePreference === 'big-waveform') {
      setWaveformMode(undefined);
    } else {
      showNotification({
        text: i18n.t(
          'Mini-waveform has been enabled. Click again to enable full-screen waveform',
        ),
      });
      setWaveformMode('waveform');
    }
  }, [
    forceBigWaveform,
    setWaveformMode,
    showNotification,
    waveformModePreference,
  ]);

  const waveformMode = forceBigWaveform
    ? 'big-waveform'
    : waveformModePreference;

  const waveformEnabled = hasAudio && waveformMode != null;
  const bigWaveformEnabled = waveformEnabled && waveformMode === 'big-waveform';
  // The thumbnail row is an advanced-mode tool; simple mode will get its own filmstrip in the clips lane.
  const showThumbnails = thumbnailsEnabled && hasVideo && !simpleMode;

  // Simple mode's clips lane shows the recording as a filmstrip (made once per open recording, freed on close).
  const filmstripTimeOffset = useMemo(() => {
    const start = Number.parseFloat(mainFileFormat?.start_time ?? '0');
    return Number.isFinite(start) ? start : 0;
  }, [mainFileFormat?.start_time]);
  // The filmstrip and the waveform start as soon as the file has been read, not once the player has loaded it.
  const probedDuration = useMemo(() => {
    const duration = Number.parseFloat(mainFileFormat?.duration ?? '');
    return isDurationValid(duration) ? duration : undefined;
  }, [mainFileFormat?.duration]);
  const openDuration = probedDuration ?? fileDuration;
  // The timeline has the recording's length from then on too, rather than a placeholder of a second until the player
  // has it: the filmstrip showed that second's frames all along the lane, and made denser frames of it.
  const timelineDuration = isDurationValid(fileDuration) ? fileDuration : (probedDuration ?? fileDurationNonZero);
  // The timeline cache knows a recording by its path, size and modified time (a changed file is made again).
  const timelineCacheKey = useMemo(() => (filePath != null && mainFileMeta != null
    ? getTimelineCacheKey({ path: filePath, size: Number(mainFileMeta.stats.size), mtimeMs: Number(mainFileMeta.stats.mtime), caseInsensitive: isWindows || isMac })
    : undefined), [filePath, mainFileMeta]);
  const filmstripAspect = useMemo(() => (mainVideoStream != null ? getVideoDisplayAspect(mainVideoStream) : undefined), [mainVideoStream]);
  const filmstrip = useFilmstrip({
    filePath,
    duration: openDuration,
    enabled: simpleMode && hasVideo,
    timeOffset: filmstripTimeOffset,
    cacheKey: timelineCacheKey,
    aspect: filmstripAspect,
  });

  // Simple mode's audio track under the clips: its waveform, made once per open recording.
  const showAudioLane = simpleMode && hasAudio;
  const { peaks: audioPeaks, done: audioPeaksDone } = useAudioPeaks({
    filePath,
    streamIndex: activeAudioStreams[0]?.index ?? mainAudioStream?.index,
    duration: openDuration,
    enabled: showAudioLane,
    cacheKey: timelineCacheKey,
    whenReady: whenVideoLoaded,
  });
  // While the filmstrip and the waveform of a recording that's opening are made, background work waits (keyframes,
  // FFmpeg's self-check, the encoder check).
  const openWorkPending = filePath != null && isDurationValid(openDuration)
    && ((simpleMode && hasVideo && !filmstrip.done) || (showAudioLane && !audioPeaksDone));

  // The shelf makes the rest of its thumbnails once the open clip's own filmstrip and waveform are made (every
  // stretch of a long recording), or a while after it opened. Advanced mode's lanes load as they show, so there it's a
  // while.
  const openVisualsIn = (filmstrip.done || !hasVideo) && (audioPeaksDone || !showAudioLane);
  const [openSettled, setOpenSettled] = useState(false);
  useEffect(() => {
    setOpenSettled(false);
    if (filePath == null) return undefined;
    const timer = setTimeout(() => setOpenSettled(true), simpleMode ? 20_000 : 3000);
    return () => clearTimeout(timer);
  }, [filePath, simpleMode]);
  const shelfPrefetch = !working && (filePath == null || openSettled || (simpleMode && openVisualsIn));
  const shelf = useShelf({ folder: shelfFolder, order: shelfOrder, exports: shelfExports, caseInsensitive: isWindows || isMac, currentPath: filePath ?? shelfAnchorPath, prefetch: shelfPrefetch, unopenable: unopenableShelfKeys });
  const { refresh: refreshShelf, nextClip } = shelf;
  // The shelf's next clip gets its filmstrip and waveform made in the background once the open one's are (and the
  // shelf's own thumbnails may be made), so Next clip opens it with them showing at once.
  const nextClipPath = nextClip?.path;
  const nextClipCacheKey = nextClip != null ? getTimelineCacheKey({ path: nextClip.path, size: nextClip.size, mtimeMs: nextClip.modifiedAt, caseInsensitive: isWindows || isMac }) : undefined;
  useEffect(() => {
    if (!simpleMode || !shelfPrefetch || nextClipPath == null || nextClipCacheKey == null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      prefetchTimeline({ path: nextClipPath, cacheKey: nextClipCacheKey, signal: controller.signal })
        .catch((err) => console.warn('Could not prepare the next clip', err));
    }, 1000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [nextClipCacheKey, nextClipPath, shelfPrefetch, simpleMode]);

  const { thumbnailsSorted, setThumbnails } = useThumbnails({
    filePath,
    zoomedDuration,
    zoomWindowStartTime,
    showThumbnails,
  });

  const {
    neighbouringKeyFrames,
    findNearestKeyFrameTime,
    keyframeByNumber,
    readAllKeyframes,
  } = useKeyframes({
    // Simple mode doesn't show keyframes, so they're read once the recording has opened.
    keyframesEnabled: keyframesEnabled && !openWorkPending,
    filePath,
    commandedTime,
    videoStream: activeVideoStream,
    detectedFps,
    ffmpegExtractWindow,
    maxKeyframes,
    currentCutSegOrWholeTimeline,
    setWorking,
    setMaxKeyframes,
    handleError,
  });
  const { waveforms, overviewWaveform, renderOverviewWaveform } = useWaveform({
    filePath,
    relevantTime,
    waveformEnabled,
    audioStream: activeAudioStreams[0],
    ffmpegExtractWindow,
    fileDuration,
  });

  const currentFrame = useMemo(() => {
    const frameNum = getFrameCount(commandedTime);
    if (frameNum == null) return undefined;
    return keyframeByNumber[frameNum];
  }, [commandedTime, getFrameCount, keyframeByNumber]);

  const generateOverviewWaveform = useCallback(async () => {
    if (working) return;
    try {
      setWorking({
        text: t(
          'Generating full overview waveform, this may take a few minutes.',
        ),
      });
      await renderOverviewWaveform();
    } finally {
      setWorking();
    }
  }, [renderOverviewWaveform, setWorking, t, working]);

  // Keyframe lines only matter for lossless cuts, an advanced-mode concern (#59).
  const shouldShowKeyframes = !simpleMode && keyframesEnabled && hasVideo && calcShouldShowKeyframes(zoomedDuration);
  const shouldShowWaveform = calcShouldShowWaveform(zoomedDuration) || overviewWaveform != null;

  const areWeCutting = useMemo(
    () => segmentsToExport.some(
      ({ start, end }) => isCuttingStart(start) || isCuttingEnd(end, fileDuration),
    ),
    [fileDuration, segmentsToExport],
  );
  const isSizeLimitedExport = exportEncodeMode === 'size_limited';
  const needSmartCut = areWeCutting && enableSmartCut;
  const isEncoding = needSmartCut || lossyMode != null;
  const isEncodingUi = isEncoding || isSizeLimitedExport;

  const {
    concatFiles,
    html5ifyDummy,
    cutMultiple,
    cutMultipleWithTextOverlays,
    concatCutSegments,
    html5ify,
    fixInvalidDuration,
    extractStreams,
    tryDeleteFiles,
  } = useFfmpegOperations({
    filePath,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
    isEncoding,
    lossyMode,
    enableOverwriteOutput,
    outputPlaybackRate,
    cutFromAdjustmentFrames,
    cutToAdjustmentFrames,
    appendLastCommandsLog,
    encCustomBitrate: encBitrate,
    appendFfmpegCommandLog,
    ffmpegHwaccel,
    exportGpuAcceleration,
  });

  const {
    previewFilePath,
    setPreviewFilePath,
    usingDummyVideo,
    setUsingDummyVideo,
    userHtml5ifyCurrentFile,
    convertFormatBatch,
    html5ifyAndLoadWithPreferences,
  } = useHtml5ify({
    filePath,
    hasVideo,
    hasAudio,
    workingRef,
    setWorking,
    ensureWritableOutDir,
    customOutDir,
    batchFiles,
    enableAutoHtml5ify,
    setProgress,
    html5ify,
    html5ifyDummy,
    withErrorHandling,
    showGenericDialog,
  });

  const compatPlayerRequired = (
    // if user selected an explicit video or audio stream, and the html5 player does not have any track index corresponding to the selected stream index
    ((activeVideoStreamIndex != null || activeAudioStreamIndexes.size === 1)
      && videoRef.current != null
      && !canHtml5PlayerPlayStreams(
        videoRef.current,
        activeVideoStreamIndex,
        [...activeAudioStreamIndexes][0],
      ))
    // or if selected multiple audio streams (html5 video element doesn't support that)
    || activeAudioStreamIndexes.size > 1
  );
  // if user selected a rotation, but they might want to turn off the rotation preview
  // but allow the user to disable
  const compatPlayerWanted = (isRotationSet && !hideCompatPlayer) || usingDummyVideo;

  const compatPlayerEnabled = (compatPlayerRequired || compatPlayerWanted)
    && (activeVideoStream != null || activeAudioStreams.length > 0);

  useEffect(() => {
    // Reset the user preference when we go from not having compat player to having it
    if (compatPlayerEnabled) setHideCompatPlayer(false);
  }, [compatPlayerEnabled]);

  const shouldShowPlaybackStreamSelector = videoStreams.length > 0
    || audioStreams.length > 0
    || (subtitleStreams.length > 0 && !compatPlayerEnabled);

  const usingPreviewFile = !!previewFilePath;
  const effectiveFilePath = previewFilePath || filePath;
  const fileUri = useMemo(() => {
    if (!effectiveFilePath) return ''; // Setting video src="" prevents memory leak in chromium
    const uri = pathToFileURL(effectiveFilePath).href;
    // https://github.com/mifi/lossless-cut/issues/1674
    if (cacheBuster !== 0) {
      const qs = new URLSearchParams();
      qs.set('t', String(cacheBuster));
      return `${uri}?${qs.toString()}`;
    }
    return uri;
  }, [cacheBuster, effectiveFilePath]);

  const resetState = useCallback(() => {
    console.log('State reset');
    // Saves the closing file's latest state, before it is reset below.
    endProjectSession();
    const video = videoRef.current;
    setCommandedTime(0);
    if (video != null) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setPlaybackRate(1);

    // setWorking();
    setPreviewFilePath(undefined);
    setUsingDummyVideo(false);
    setPlaying(false);
    playingRef.current = false;
    setPlaybackMode(undefined);
    setFileDuration(undefined);
    // A new history, so undo/redo cannot resurrect the previous file's segments.
    cutSegmentsHistory.reset([]);
    setDetectedFileFormat(undefined);
    setRotation(360);
    setProgress(undefined);
    setStartTimeOffset(0);
    setFilePath(undefined);
    setProjectSession(undefined);
    setCurrentClipName(undefined);
    setRenamingSegId(undefined);
    setExternalFilesMeta({});
    setCustomTagsByFile({});
    streamParamsHistory.reset(new Map());
    overlayClipsHistory.reset([]);
    editHistoryOrder.clear();
    setSelectedOverlayId(undefined);
    setDetectedFps(undefined);
    setMainFileMeta(undefined);
    setCopyStreamIdsByFile({});
    setStreamsSelectorShown(false);
    setZoom(1);
    setThumbnails([]);
    setShortestFlag(false);
    setZoomWindowStartTime(0);
    setSubtitlesByStreamId({});
    setActiveAudioStreamIndexes(new Set());
    setActiveVideoStreamIndex(undefined);
    setActiveSubtitleStreamIndex(undefined);
    setHideCompatPlayer(false);
    setExportConfirmOpen(false);
    setOutputPlaybackRateState(1);
    setCurrentFileExportCount(0);
    setPickedClipIds([]);
  }, [
    editHistoryOrder,
    endProjectSession,
    overlayClipsHistory,
    streamParamsHistory,
    videoRef,
    setCommandedTime,
    setPlaybackRate,
    setPreviewFilePath,
    setUsingDummyVideo,
    setPlaying,
    playingRef,
    setPlaybackMode,
    cutSegmentsHistory,
    setDetectedFileFormat,
    setCopyStreamIdsByFile,
    setThumbnails,
    setSubtitlesByStreamId,
    setOutputPlaybackRateState,
  ]);

  const showNotNativelySupportedMessage = useCallback(() => {
    showNotification({
      timer: 13000,
      text: i18n.t(
        'File is not natively supported. Preview playback may be slow and of low quality, but the final export will be lossless. You may convert the file from the menu for a better preview.',
      ),
    });
  }, [showNotification]);

  const showPreviewFileLoadedMessage = useCallback(
    (fileName: string) => {
      showNotification({
        icon: 'info',
        text: i18n.t('Loaded existing preview file: {{ fileName }}', {
          fileName,
        }),
      });
    },
    [showNotification],
  );

  const handleHideCompatPlayerClick = useCallback(() => {
    setHideCompatPlayer(true);
    setPreviewFilePath(undefined);
    setUsingDummyVideo(false);
  }, [setHideCompatPlayer, setPreviewFilePath, setUsingDummyVideo]);

  const makeSmoothPreviewCopy = useCallback(() => userHtml5ifyCurrentFile({ speed: hasAudio || !hasVideo ? 'slow-audio' : 'slow' }), [hasAudio, hasVideo, userHtml5ifyCurrentFile]);

  // Only offer a way out that would replace the assisted player: a preview copy stands in for a file the normal player
  // can't play, but rotation previews and some track choices keep using the original file.
  const compatPlayerFailedCard = useMemo(() => {
    if (compatPlayerRequired) return { hint: t('Try moving the playhead further in.') };
    if (usingDummyVideo) return { hint: t('Try moving the playhead further in, or make a preview copy instead.'), action: { label: t('Make a preview copy'), onClick: makeSmoothPreviewCopy } };
    return { hint: t('Try moving the playhead further in, or turn off the rotation preview.'), action: { label: t('Turn off rotation preview'), onClick: handleHideCompatPlayerClick } };
  }, [compatPlayerRequired, handleHideCompatPlayerClick, makeSmoothPreviewCopy, t, usingDummyVideo]);

  const {
    captureFrameFromTag,
    captureFrameFromFfmpeg,
    captureFrameToClipboard,
    captureFramesRange,
  } = useFrameCapture({
    appendFfmpegCommandLog,
    formatTimecode,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
    fileDuration,
  });

  const getNewJumpIndex = (oldIndex: number, direction: -1 | 1) => Math.max(oldIndex + direction, 0);

  const jumpSeg = useCallback(
    (params: ({ abs: number } | { rel: -1 | 1 }) & { seek?: true }) => {
      const clamp = (v: number) => Math.max(0, Math.min(v, cutSegments.length - 1));

      const seek = (index: number) => {
        if (params.seek && cutSegments[index]) seekAbs(cutSegments[index].start);
      };

      if ('abs' in params) {
        const index = clamp(params.abs);
        setCurrentSegIndex(index);
        seek(index);
      } else {
        setCurrentSegIndex((old) => {
          const index = clamp(getNewJumpIndex(old, params.rel));
          seek(index);
          return index;
        });
      }
    },
    [cutSegments, seekAbs, setCurrentSegIndex],
  );

  const togglePlay = useCallback(
    ({
      resetPlaybackRate,
      requestPlaybackMode,
    }:
      | { resetPlaybackRate?: boolean; requestPlaybackMode?: PlaybackMode }
      | undefined = {}) => {
      setPlaybackMode(requestPlaybackMode);

      if (playingRef.current) {
        pause();
        return;
      }

      // If we are using a special playback mode, we might need to do more:
      if (playbackModeRef.current != null) {
        const selectedSegmentsWithoutMarkers = filterNonMarkers(selectedSegments);
        const selectedSegmentAtCursor = selectedSegmentsWithoutMarkers.find(
          (selectedSegment) => selectedSegment.segId === segmentAtCursorRef.current?.segId,
        );
        const isSomeSegmentAtCursor = selectedSegmentAtCursor != null
          && commandedTimeRef.current != null
          && selectedSegmentAtCursor.end != null
          && selectedSegmentAtCursor.end - commandedTimeRef.current > 0.1;
        if (!isSomeSegmentAtCursor) {
          // if a segment is already at cursor, don't do anything
          // if no segment at cursor, and looping playback mode, continue looping
          if (
            playbackModeRef.current === 'play-selected-segments'
            || playbackModeRef.current === 'loop-selected-segments'
          ) {
            const firstSelectedSegment = selectedSegmentsWithoutMarkers[0];
            if (firstSelectedSegment != null) {
              const index = cutSegments.findIndex(
                (segment) => segment.segId === firstSelectedSegment.segId,
              );
              if (index !== -1) setCurrentSegIndex(index);
              seekAbs(firstSelectedSegment.start);
            }
          } else if (currentCutSeg != null) {
            // for all other playback modes, seek to start of current segment
            seekAbs(currentCutSeg.start);
          }
        }
      }
      play(resetPlaybackRate);
    },
    [
      setPlaybackMode,
      playingRef,
      playbackModeRef,
      play,
      pause,
      selectedSegments,
      commandedTimeRef,
      currentCutSeg,
      cutSegments,
      setCurrentSegIndex,
      seekAbs,
    ],
  );

  const onTimeUpdate = useCallback<ReactEventHandler<HTMLVideoElement>>(
    (e) => {
      const { currentTime } = e.currentTarget;
      // Paused, the commanded time is what's shown (relevantTime ignores the player's); a landed seek's
      // timeupdate shouldn't re-render the whole editor a second time.
      if (!playingRef.current) return;
      if (playerTime === currentTime) return;
      setPlayerTime(currentTime);

      const segmentsAtCursorIndexes = findSegmentsAtCursor(
        commandedTimeRef.current,
      );
      const firstSegmentAtCursorIndex = segmentsAtCursorIndexes[0];
      const playingSegment = firstSegmentAtCursorIndex != null
        ? cutSegments[firstSegmentAtCursorIndex]
        : undefined;

      if (
        playbackModeRef.current != null
        && playingRef.current
        && playingSegment
        && playingSegment.end != null
      ) {
        const nextAction = getPlaybackAction({
          playbackMode: playbackModeRef.current,
          currentTime,
          playingSegment: {
            start: playingSegment.start,
            end: playingSegment.end,
          },
        });

        const exit = () => {
          setPlaybackMode(undefined);
          pause();
        };

        if (nextAction != null) {
          console.log(nextAction);
          if (nextAction.nextSegment) {
            const selectedSegmentsWithoutMarkers = filterNonMarkers(selectedSegments);

            const index = selectedSegmentsWithoutMarkers.findIndex(
              (selectedSegment) => selectedSegment.segId === playingSegment.segId,
            );
            let newSelectedSegmentIndex = getNewJumpIndex(
              index !== -1 ? index : 0,
              1,
            );
            if (
              newSelectedSegmentIndex
              > selectedSegmentsWithoutMarkers.length - 1
            ) {
              // have reached end of last segment
              if (playbackModeRef.current === 'loop-selected-segments') newSelectedSegmentIndex = 0; // start over
              else if (playbackModeRef.current === 'play-selected-segments') exit();
            }
            const nextSelectedSegment = selectedSegmentsWithoutMarkers[newSelectedSegmentIndex];
            if (nextSelectedSegment != null) {
              seekAbs(nextSelectedSegment.start);
              const newIndex = cutSegments.findIndex(
                (segment) => segment.segId === nextSelectedSegment.segId,
              );
              if (newIndex !== -1) setCurrentSegIndex(newIndex);
            }
          }
          if (nextAction.seekTo != null) {
            seekAbs(nextAction.seekTo);
          }
          if (nextAction.exit) {
            exit();
          }
        }
      }
    },
    [
      commandedTimeRef,
      cutSegments,
      findSegmentsAtCursor,
      pause,
      playbackModeRef,
      playerTime,
      playingRef,
      seekAbs,
      selectedSegments,
      setCurrentSegIndex,
      setPlaybackMode,
      setPlayerTime,
    ],
  );

  const closeFileWithConfirm = useCallback(async () => {
    if (!isFileOpened || workingRef.current) return;

    if (
      askBeforeClose
      && !(await confirmDialog({
        focusConfirm: true,
        description: i18n.t('Are you sure you want to close the current file?'),
      }))
    ) return;

    resetState();
    clearSegments();
  }, [
    isFileOpened,
    workingRef,
    askBeforeClose,
    confirmDialog,
    resetState,
    clearSegments,
  ]);

  const closeBatch = useCallback(async () => {
    if (
      askBeforeClose
      && !(await confirmDialog({
        focusConfirm: true,
        description: i18n.t(
          'Are you sure you want to close the loaded batch of files?',
        ),
      }))
    ) return;
    setBatchFiles([]);
    setSelectedBatchFiles([]);
  }, [askBeforeClose, confirmDialog]);

  const batchListRemoveFile = useCallback((path: string | undefined) => {
    setBatchFiles((existingBatch) => {
      const index = existingBatch.findIndex(
        (existingFile) => existingFile.path === path,
      );
      if (index === -1) return existingBatch;
      const newBatch = [...existingBatch];
      newBatch.splice(index, 1);
      const newItemAtIndex = newBatch[index];
      if (newItemAtIndex != null) setSelectedBatchFiles([newItemAtIndex.path]);
      else if (newBatch.length > 0) setSelectedBatchFiles([newBatch[0]!.path]);
      else setSelectedBatchFiles([]);
      return newBatch;
    });
  }, []);

  const commonSettings = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { keyBindings: _keyBindings, ...rest } = allUserSettings.settings;
    return { ...rest, ffmpegVersion: ffmpegInfo?.program_version.version };
  }, [allUserSettings.settings, ffmpegInfo?.program_version.version]);

  const openSendReportDialogWithState = useCallback(
    async (err?: unknown) => {
      const state = {
        ...commonSettings,

        filePath,
        fileFormat,
        externalFilesMeta,
        mainStreams,
        copyStreamIdsByFile,
        cutSegments: cutSegments.map((s) => ({ start: s.start, end: s.end })),
        mainFileFormat,
        rotation,
        shortestFlag,
        effectiveExportMode,
      };

      openSendReportDialog({ err, state });
    },
    [
      commonSettings,
      copyStreamIdsByFile,
      cutSegments,
      effectiveExportMode,
      externalFilesMeta,
      fileFormat,
      filePath,
      mainFileFormat,
      mainStreams,
      rotation,
      shortestFlag,
    ],
  );

  const openSendConcatReportDialogWithState = useCallback(
    async (err: unknown, reportState?: object) => {
      const state = { ...commonSettings, ...reportState };
      openSendReportDialog({ err, state });
    },
    [commonSettings],
  );

  const handleExportFailed = useCallback(
    async (err: unknown) => {
      const sendErrorReport = await showExportFailedDialog({
        fileFormat,
        safeOutputFileName,
      });
      if (sendErrorReport) openSendReportDialogWithState(err);
    },
    [fileFormat, safeOutputFileName, openSendReportDialogWithState],
  );

  const handleConcatFailed = useCallback(
    async (err: unknown, reportState: object) => {
      const sendErrorReport = await showConcatFailedDialog({ fileFormat });
      if (sendErrorReport) openSendConcatReportDialogWithState(err, reportState);
    },
    [fileFormat, openSendConcatReportDialogWithState],
  );

  /** The shelf moves an exported clip to the bottom and doesn't offer its exports as clips. */
  const rememberExportedClip = useCallback((source: string, sourceIdentity: FileIdentity | undefined, outputs: string[]) => {
    if (outputs.length === 0) return;
    setShelfExports((list) => rememberShelfExport(list, {
      source,
      sourceSize: sourceIdentity?.size,
      sourceModifiedAt: sourceIdentity?.mtimeMs,
      outputs,
      exportedAt: Date.now(),
    }, isWindows || isMac));
  }, [setShelfExports]);

  // The selected clips (segmentsToExport without chapters-only), as a size-limited export never keeps the
  // recording whole: see isChaptersOnlyExport.
  const sizeLimitedSegmentsForExport = useMemo<SegmentToExport[]>(() => {
    if (segmentsOrInverse.selected.length > 0) return segmentsOrInverse.selected;
    if (!isDurationValid(fileDuration)) return [];

    const { start, end } = currentCutSegOrWholeTimeline;
    if (!(end > start)) return [];

    return [
      {
        start,
        end,
        originalIndex: currentSegIndexSafe ?? 0,
        name: currentCutSeg?.name,
        tags: currentCutSeg?.tags,
        speed: currentCutSeg?.speed,
        crop: currentCutSeg?.crop,
        audioGainDb: currentCutSeg?.audioGainDb,
        audioMuted: currentCutSeg?.audioMuted,
      },
    ];
  }, [
    currentCutSeg,
    currentCutSegOrWholeTimeline,
    currentSegIndexSafe,
    fileDuration,
    segmentsOrInverse.selected,
  ]);

  const generateCutFileNamesForFormat = useCallback(
    async (
      template: string,
      outputFormatOverride?: string,
      fallbackTemplate?: string,
      segmentsOverride: SegmentToExport[] = segmentsToExport,
    ) => {
      invariant(fileFormat != null && outputDir != null && filePath != null && exportNamingSourcePath != null);
      const outputFormat = outputFormatOverride ?? fileFormat;
      const isFormatForced = outputFormatOverride != null;
      return generateCutFileNamesRaw({
        fileDuration,
        exportCount,
        currentFileExportCount,
        segmentsToExport: segmentsOverride,
        template,
        formatTimecode,
        isCustomFormatSelected: isFormatForced ? true : isCustomFormatSelected,
        fileFormat: outputFormat,
        sourceFile: { path: exportNamingSourcePath, ...mainFileMeta },
        // The naming source path follows the (renameable) clip name, so it is not
        // necessarily the file on disk. Both must be off limits as destinations.
        protectedPaths: [filePath, exportNamingSourcePath],
        outputDir,
        safeOutputFileName,
        maxLabelLength,
        outputFileNameMinZeroPadding,
        fallbackTemplate,
        // The simple editor without a file name of the user's own: a named clip's file is its name.
        nameAfterClips: simpleMode && cutFileTemplate == null && template === defaultCutFileTemplate,
      });
    },
    [
      currentFileExportCount,
      cutFileTemplate,
      exportCount,
      exportNamingSourcePath,
      fileDuration,
      fileFormat,
      filePath,
      formatTimecode,
      isCustomFormatSelected,
      mainFileMeta,
      maxLabelLength,
      outputDir,
      outputFileNameMinZeroPadding,
      safeOutputFileName,
      segmentsToExport,
      simpleMode,
    ],
  );

  const generateCutFileNames = useCallback(
    async (template: string) => generateCutFileNamesForFormat(template),
    [generateCutFileNamesForFormat],
  );
  const generateSizeLimitedCustomCutFileNames = useCallback(
    async (template: string) => generateCutFileNamesForFormat(
      template,
      'mp4',
      defaultSizeLimitedCutFileTemplate,
      sizeLimitedSegmentsForExport,
    ),
    [generateCutFileNamesForFormat, sizeLimitedSegmentsForExport],
  );

  const generateCutMergedFileNamesForFormat = useCallback(
    async (
      template: string,
      outputFormatOverride?: string,
      fallbackTemplate?: string,
      segmentLabels: string[] = segmentsToExport.map((seg) => seg.name ?? ''),
    ) => {
      invariant(fileFormat != null && outputDir != null && filePath != null && exportNamingSourcePath != null);
      const outputFormat = outputFormatOverride ?? fileFormat;
      const isFormatForced = outputFormatOverride != null;
      return generateCutMergedFileNamesRaw({
        template,
        isCustomFormatSelected: isFormatForced ? true : isCustomFormatSelected,
        fileFormat: outputFormat,
        sourceFile: { path: exportNamingSourcePath },
        protectedPaths: [filePath, exportNamingSourcePath],
        outputDir,
        safeOutputFileName,
        maxLabelLength,
        exportCount,
        currentFileExportCount,
        segLabels: segmentLabels,
        fallbackTemplate,
      });
    },
    [
      currentFileExportCount,
      exportCount,
      exportNamingSourcePath,
      fileFormat,
      filePath,
      isCustomFormatSelected,
      maxLabelLength,
      outputDir,
      safeOutputFileName,
      segmentsToExport,
    ],
  );

  const generateCutMergedFileNames = useCallback(
    async (template: string) => generateCutMergedFileNamesForFormat(template),
    [generateCutMergedFileNamesForFormat],
  );
  const generateSizeLimitedCustomCutMergedFileNames = useCallback(
    async (template: string) => generateCutMergedFileNamesForFormat(
      template,
      'mp4',
      defaultSizeLimitedCutMergedFileTemplate,
      sizeLimitedSegmentsForExport.map((seg) => seg.name ?? ''),
    ),
    [generateCutMergedFileNamesForFormat, sizeLimitedSegmentsForExport],
  );

  const generateMergedFileNames = useCallback(
    async (params: GenerateMergedOutFileNamesParams) => generateMergedFileNamesRaw({
      ...params,
      // A merge reads every file in the batch, and the file open in the editor is being
      // read too, so none of them may be named as the destination.
      protectedPaths: getMergeProtectedPaths({
        sourcePaths: params.sourceFiles.map((sourceFile) => sourceFile.path),
        alsoProtect: [filePath],
      }),
      isCustomFormatSelected,
      safeOutputFileName,
      maxLabelLength,
      exportCount,
    }),
    [exportCount, filePath, isCustomFormatSelected, maxLabelLength, safeOutputFileName],
  );

  const userConcatFiles = useCallback(
    async ({
      paths,
      includeAllStreams,
      streams,
      fileFormat: outFormat,
      clearBatchFilesAfterConcat,
      generatedFileNames,
    }: {
      paths: string[];
      includeAllStreams: boolean;
      streams: FFprobeStream[];
      fileFormat: string;
      clearBatchFilesAfterConcat: boolean;
      generatedFileNames: GeneratedOutFileNames;
    }) => {
      if (workingRef.current) return;

      const firstPath = paths[0];
      if (!firstPath) return;

      try {
        // need to ensure the output dir is writable, because the user might not yet have opened a file, and so MAS might not yet have access to write the dir
        const newCustomOutDir = await ensureWritableOutDir({
          inputPath: firstPath,
          outDir: customOutDir,
        });
        if (newCustomOutDir !== customOutDir) {
          // throw user back to the concat dialog because now things might have changed (which could affect overwriting files etc!)
          // also if the user cancels the dialog, `DirectoryAccessDeclinedError` will be thrown and we will return (see catch below)
          return;
        }

        // only after ensuring out dir access, we can close the concat dialog
        setConcatDialogOpen(false);
        setWorking({ text: i18n.t('Merging') });

        const warnings = new Set<string>();
        const notices = new Set<string>();

        const { fileNames, problems } = generatedFileNames;
        if (problems.error != null) {
          console.warn(
            'Merged file name invalid, using default instead',
            fileNames[0],
          );
          warnings.add(problems.error);
          warnings.add(t('Fell back to default output file name'));
        }
        addSourceSafetyNotice(problems.sourceSafetyAdjustments, notices);

        const outDir = getOutDir(customOutDir, firstPath);

        const [fileName] = fileNames;
        invariant(fileName != null);
        const outPath = getOutPath({
          customOutDir,
          filePath: firstPath,
          fileName,
        });

        // The names were generated when the concat dialog opened; the batch list, the
        // output directory or the template may have changed since. Re-check against every
        // file this merge reads before anything is written or deleted.
        await assertOutPathsNotSource({
          outPaths: [outPath],
          protectedPaths: getMergeProtectedPaths({ sourcePaths: paths, alsoProtect: [filePath] }),
          message: i18n.t('ClipPress will not merge onto one of the files it is reading from. Choose a different output name or folder.'),
        });

        let chaptersFromSegments: Awaited<
          ReturnType<typeof createChaptersFromSegments>
        >;
        if (segmentsToChapters) {
          const chapterNames = paths.map((path) => parsePath(path).name);
          chaptersFromSegments = await createChaptersFromSegments({
            segmentPaths: paths,
            chapterNames,
          });
        }

        let inputSize: number;
        try {
          inputSize = sum(await readFileSizes(paths));
        } catch (err) {
          console.warn('Unable to read input file sizes', err);
          throw makeSourceFileAccessError();
        }

        // console.log('merge', paths);
        const metadataFromPath = paths[0];
        invariant(metadataFromPath != null);

        await maybeMkDeepOutDir({ outputDir: outDir, fileOutPath: outPath });

        const { haveExcludedStreams, created } = await concatFiles({
          paths,
          outPath,
          outDir,
          outFormat,
          metadataFromPath,
          includeAllStreams,
          streams,
          ffmpegExperimental,
          onProgress: setProgress,
          preserveMovData,
          movFastStart,
          preserveMetadataOnMerge,
          chapters: chaptersFromSegments,
        });

        if (created) {
          try {
            const outputSize = await readFileSize(outPath);
            const sizeCheckResult = checkFileSizes(inputSize, outputSize);
            if (sizeCheckResult != null) warnings.add(sizeCheckResult);
          } catch (error) {
            console.warn('Merge completed but its size could not be read', error);
            warnings.add(i18n.t('The merge finished, but its final size could not be checked.'));
          }
        }

        if (clearBatchFilesAfterConcat) closeBatch();
        if (!includeAllStreams && haveExcludedStreams) {
          notices.add(
            i18n.t(
              'Some extra tracks have been discarded. You can change this option before merging.',
            ),
          );
        }
        if (!created) notices.add(i18n.t('No new files were written'));

        if (!hideAllNotifications) {
          showOsNotification(i18n.t(created ? 'Merge finished' : 'No new files were written'));
          openConcatFinishedDialog({
            filePath: outPath,
            notices: simpleMode ? [] : [...notices],
            // The simple editor has no Details: what matters there shows plainly.
            highlight: simpleMode && !includeAllStreams && haveExcludedStreams ? i18n.t('Some extra tracks have been discarded. You can change this option before merging.') : undefined,
            warnings: [...warnings],
            created,
            showAdvice: !simpleMode,
          });
        }
      } catch (err) {
        if (err instanceof DirectoryAccessDeclinedError || isAbortedError(err)) return;

        showOsNotification(i18n.t('Failed to merge'));

        if (isExecaError(err)) {
          console.log('stdout:', getStdioString(err.stdout));
          console.error('stderr:', getStdioString(err.stderr));

          if (isOutOfSpaceError(err)) {
            showDiskFull();
            return;
          }
          if (isMuxNotSupported(err)) {
            showMuxNotSupported();
            return;
          }
        }

        if (err instanceof OutputNotWritableError) {
          showOutputNotWritable();
          return;
        }

        if (err instanceof UserFacingError) {
          errorToast(err.message);
          return;
        }

        const reportState = {
          includeAllStreams,
          streams,
          outFormat,
          clearBatchFilesAfterConcat,
        };
        handleConcatFailed(err, reportState);
      } finally {
        setWorking(undefined);
        setProgress(undefined);
      }
    },
    [
      simpleMode,
      workingRef,
      ensureWritableOutDir,
      customOutDir,
      filePath,
      setWorking,
      segmentsToChapters,
      concatFiles,
      ffmpegExperimental,
      preserveMovData,
      movFastStart,
      preserveMetadataOnMerge,
      closeBatch,
      hideAllNotifications,
      t,
      showOsNotification,
      openConcatFinishedDialog,
      handleConcatFailed,
    ],
  );

  const cleanupFiles = useCallback(
    async (cleanupChoices2: CleanupChoicesType) => {
      // Store paths before we reset state
      const savedPaths = {
        previewFilePath,
        sourceFilePath: filePath,
        // Every copy ("Both" keeps two): one left behind would bring the edits back.
        projectFilePaths: projectFileSavePaths ?? [],
      };

      if (cleanupChoices2.closeFile) {
        batchListRemoveFile(savedPaths.sourceFilePath);

        // close the file
        resetState();
        clearSegments();
      }

      await withErrorHandling(async () => {
        const abortController = new AbortController();
        setWorking({ text: i18n.t('Cleaning up'), abortController });
        console.log('Cleaning up files', cleanupChoices2);

        // Closing the file saves its project, which must not land after the project file is deleted.
        await whenProjectSaved();

        const pathsToDelete: string[] = [];
        if (cleanupChoices2.trashTmpFiles && savedPaths.previewFilePath) pathsToDelete.push(savedPaths.previewFilePath);
        const { projectFilePaths } = savedPaths;
        if (cleanupChoices2.trashProjectFile) pathsToDelete.push(...projectFilePaths);
        if (cleanupChoices2.trashSourceFile && savedPaths.sourceFilePath) pathsToDelete.push(savedPaths.sourceFilePath);

        await deleteFiles({
          paths: pathsToDelete,
          deleteIfTrashFails: cleanupChoices2.deleteIfTrashFails,
          // The original recording is only ever moved to the Recycle Bin, never deleted permanently.
          protectedPaths: savedPaths.sourceFilePath != null ? [savedPaths.sourceFilePath] : [],
          signal: abortController.signal,
          // The project file is deleted between its saves, so that no save from before (one that
          // failed and is tried again when the app closes, say) brings it back once it is gone.
          // While it is still there (deleting it failed or was cancelled), it holds an older
          // state, and a failed save of it is kept and tried again.
          runDeletion: (deletePath, deletion) => (projectFilePaths.includes(deletePath) ? deleteProjectFile(deletePath, deletion) : deletion()),
        });
      }, i18n.t('Unable to delete file'));
      // The clip may have gone to the Recycle Bin: don't offer it as the next one.
      refreshShelf();
    },
    [
      refreshShelf,
      batchListRemoveFile,
      clearSegments,
      deleteProjectFile,
      filePath,
      previewFilePath,
      projectFileSavePaths,
      resetState,
      setWorking,
      whenProjectSaved,
      withErrorHandling,
    ],
  );

  const closeCurrentFileAfterExport = useCallback(() => {
    if (filePath == null) return;
    batchListRemoveFile(filePath);
    resetState();
    clearSegments();
  }, [batchListRemoveFile, clearSegments, filePath, resetState]);

  // Set once openShelfClip exists (further down), for the result's Next clip.
  const openShelfClipRef = useRef<(path: string) => void>();

  /**
   * The end of every export: copies the video (Settings > Export > Copy the video after exporting), shows the result,
   * and closes the recording when "After exporting" says so. With another clip to do on the shelf, the result offers it
   * and the recording only closes once the result is dismissed, so the next clip is one click away.
   */
  const finishExport = useCallback(({ exportedPaths, mergedPath, closeAfter, showResult }: {
    exportedPaths: string[],
    mergedPath?: string | undefined,
    closeAfter: boolean,
    showResult: (extras: { autoCopied?: Promise<boolean> | undefined, nextClipName?: string | undefined, mergedPath?: string | undefined }) => Promise<'next' | undefined>,
  }) => {
    const copyPaths = mergedPath != null ? [mergedPath] : exportedPaths;
    const autoCopied = copyAfterExport && isWindows && copyPaths.length > 0
      ? mainApi.copyFilesToClipboard(copyPaths).then(() => true, (err: unknown) => {
        console.warn('Unable to copy the exported video', err);
        return false;
      })
      : undefined;
    const next = simpleMode && exportedPaths.length > 0 ? nextClip : undefined;
    const result = hideAllNotifications ? undefined : showResult({ autoCopied, nextClipName: next?.name, mergedPath });
    if (result == null || next == null) {
      if (closeAfter) closeCurrentFileAfterExport();
      return;
    }
    result.then((choice) => {
      if (choice === 'next') openShelfClipRef.current?.(next.path);
      else if (closeAfter) closeCurrentFileAfterExport();
    });
  }, [closeCurrentFileAfterExport, copyAfterExport, hideAllNotifications, nextClip, simpleMode]);

  /**
   * Settings > Export > "Move the original to the Recycle Bin after export". Only after every planned file was
   * written and checked, only through the Recycle Bin, and never if the original changed during the export.
   * Returns whether the recording was closed for it.
   */
  const recycleOriginalAfterExport = useCallback(async ({ wanted, exportSignal, cleanupAfter, sourcePath, sourceIdentity, allPlannedCreated, exportedPaths, notices, warnings, highlights }: {
    wanted: boolean,
    /** The export's Cancel: pressed at any point, the original stays. */
    exportSignal: AbortSignal,
    /** The clean-up that runs after this export, if any: its project file box decides whether the edits go too. */
    cleanupAfter: CleanupChoicesType | undefined,
    sourcePath: string,
    sourceIdentity: FileIdentity | undefined,
    allPlannedCreated: boolean,
    exportedPaths: string[],
    notices: Set<string>,
    warnings: Set<string>,
    /** Shown in the result dialog without opening Details. */
    highlights: Set<string>,
  }) => {
    if (!wanted) return false;
    // The simple editor's result has no Details: that the original was kept shows plainly there.
    const keptNotices = simpleMode ? highlights : notices;
    if (exportSignal.aborted) {
      keptNotices.add(i18n.t('The original recording was kept, because this was cancelled.'));
      return false;
    }
    if (!allPlannedCreated || exportedPaths.length === 0) {
      keptNotices.add(i18n.t('The original recording was kept, because not every file was exported.'));
      return false;
    }
    // Cancel works throughout: the original is kept unless everything below runs to the end.
    const abortController = new AbortController();
    const cancelled = () => abortController.signal.aborted;
    const keptBecauseCancelled = () => keptNotices.add(i18n.t('The original recording was kept, because this was cancelled.'));
    setWorking({ text: i18n.t('Checking the exported files'), abortController });
    const check = await verifyExportedFiles(exportedPaths, { statFile: statOutput, probe: probeOutput, isCancelled: cancelled });
    if (cancelled()) {
      keptBecauseCancelled();
      return false;
    }
    if (!check.ok) {
      warnings.add(i18n.t('The original recording was kept, because this exported file could not be checked: {{file}}', { file: parsePath(check.path).base }));
      return false;
    }

    // The preview holds the recording open, so close it (and let its project save) before recycling it.
    batchListRemoveFile(sourcePath);
    resetState();
    clearSegments();
    await whenProjectSaved();

    setWorking({ text: i18n.t('Moving the original to the Recycle Bin'), abortController });
    const result = await recycleOriginal(sourcePath, sourceIdentity, { identify: identifyFile, trash: trashFile, exists: fileExists, isCancelled: cancelled });
    if (!result.recycled && result.reason === 'cancelled') {
      keptBecauseCancelled();
    } else if (result.recycled) {
      // Not in Recent as "Missing": ClipPress recycled it on purpose, and the result says so.
      setRecentFiles((list) => removeRecentFile(list, sourcePath, isWindows || isMac));
      // Settings > Projects > "Recycle edits with the original": every copy of them, so none brings them back (#91).
      const editsRecycled = shouldRecycleEditsWithOriginal(trashProjectWithSource, cleanupAfter) && (await recycleRecordingProjectCopies(sourcePath, customOutDir, deleteProjectFile)) > 0;
      highlights.add(editsRecycled
        ? i18n.t('The original recording and its edits were moved to the Recycle Bin.')
        : i18n.t('The original recording was moved to the Recycle Bin.'));
    } else if (result.reason === 'changed') {
      warnings.add(i18n.t('The original recording was kept, because it changed during the export.'));
    } else if (result.reason === 'refused') {
      warnings.add(i18n.t('ClipPress kept the original recording: it could not be moved to the Recycle Bin. It may be too large for the Recycle Bin, on a drive without one, or still in use.'));
    }
    return true;
  }, [batchListRemoveFile, clearSegments, customOutDir, deleteProjectFile, resetState, setRecentFiles, setWorking, simpleMode, trashProjectWithSource, whenProjectSaved]);

  const askForCleanupChoices = useCallback(async ({ saveOnly = false, afterExport = false }: { saveOnly?: boolean, afterExport?: boolean } = {}) => {
    // Asked after an export, its box decides for the original (see shouldRecycleOriginalAfterExport), so with the Export
    // switch on it starts ticked.
    const tickedForSwitch = afterExport && trashSourceAfterExport;
    const trashResponse = await openCleanupFilesDialog({
      ...cleanupChoices,
      // An unattended "move the original after each export" is the Export switch; show it as such.
      ...(cleanupChoices.cleanupAfterExport && !cleanupChoices.askForCleanup ? { trashSourceFile: trashSourceAfterExport } : {}),
      ...(tickedForSwitch ? { trashSourceFile: true } : {}),
    }, { saveOnly });
    if (trashResponse != null) {
      const unattended = trashResponse.cleanupAfterExport && !trashResponse.askForCleanup;
      const stored: CleanupChoicesType = cleanupChoices;
      // Store for next time, if not canceled (a tick that was only the switch's isn't kept as a choice of its own)...
      setCleanupChoices(tickedForSwitch && !unattended && trashResponse.trashSourceFile ? { ...trashResponse, trashSourceFile: stored.trashSourceFile === true } : trashResponse);
      // ...and choosing it there (unattended) turns the switch on or off, so both always agree.
      if (unattended) setTrashSourceAfterExport(trashResponse.trashSourceFile === true);
    }
    return trashResponse;
  }, [cleanupChoices, openCleanupFilesDialog, setCleanupChoices, setTrashSourceAfterExport, trashSourceAfterExport]);

  // Settings > After exporting > "Choose…" only picks what happens later, so its dialog saves instead of cleaning up.
  const changeCleanupChoices = useCallback(() => askForCleanupChoices({ saveOnly: true }), [askForCleanupChoices]);

  const cleanupFilesDialog = useCallback(async () => {
    if (!isFileOpened || workingRef.current) return;

    try {
      const newCleanupChoices = cleanupChoices.askForCleanup
        ? await askForCleanupChoices()
        : cleanupChoices;
      // only if not canceled
      if (newCleanupChoices != null) await cleanupFiles(newCleanupChoices);
    } finally {
      setWorking(undefined);
    }
  }, [
    askForCleanupChoices,
    cleanupChoices,
    cleanupFiles,
    isFileOpened,
    setWorking,
    workingRef,
  ]);

  const closeExportConfirm = useCallback(() => setExportConfirmOpen(false), []);

  const willMerge = segmentsToExport.length > 1 && autoMerge;

  interface SizeLimitedResultSummary {
    requestedLimitLabel: string;
    createdCount: number;
    skippedCount: number;
    largestCreatedSizeLabel?: string | undefined;
    singleCreatedSizeLabel?: string | undefined;
  }

  interface SizeLimitedInternalNameItem {
    suffixLabel: string;
  }

  const formatSizeLimitedMbValue = useCallback(
    (sizeMb: number) => new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(sizeMb),
    [],
  );

  const formatRequestedSizeLimit = useCallback(
    (targetMb: number) => i18n.t('{{size}} MB', { size: formatSizeLimitedMbValue(targetMb) }),
    [formatSizeLimitedMbValue],
  );

  const formatSizeLimitedBytes = useCallback(
    (sizeBytes: number) => i18n.t('{{size}} MB', {
      size: formatSizeLimitedMbValue(sizeBytes / bytesPerMb),
    }),
    [formatSizeLimitedMbValue],
  );

  const formatSizeLimitedJobStageText = useCallback(
    ({ jobIndex, totalJobs, clipCount, joinedClipCount, metadata }: {
      jobIndex: number;
      totalJobs: number;
      clipCount: number;
      joinedClipCount: number;
      metadata: SizeLimitedProgressMetadata | undefined;
    }) => formatSizeLimitedProgressText({
      jobIndex,
      totalJobs,
      clipCount,
      joinedClipCount,
      metadata,
      simpleMode,
      t: (key, options) => i18n.t(key, options),
    }),
    [simpleMode],
  );

  const sanitizeSizeLimitedNamePart = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return '';
      return safeOutputFileName ? filenamify(trimmed) : trimmed;
    },
    [safeOutputFileName],
  );

  const sizeLimitedSourceBaseName = useMemo(
    () => exportBaseName,
    [exportBaseName],
  );

  const getSizeLimitedSeparateSuffixLabelForSegment = useCallback(
    (segment: SegmentToExport, index: number) => getSizeLimitedSeparateSuffixLabel({
      segmentName: segment.name,
      index,
      totalSegments: sizeLimitedSegmentsForExport.length,
      safeOutputFileName,
    }),
    [safeOutputFileName, sizeLimitedSegmentsForExport.length],
  );

  const buildSizeLimitedAutoFileNames = useCallback(
    (items: SizeLimitedAutoNameItem[]) => {
      if (sizeLimitedSourceBaseName == null) return [];

      return buildSizeLimitedAutoFileNamesRaw({
        sourceBaseName: sizeLimitedSourceBaseName,
        controlMode: sizeLimitControlMode,
        preset: sizeLimitPreset,
        safeOutputFileName,
        items,
      });
    },
    [
      safeOutputFileName,
      sizeLimitControlMode,
      sizeLimitPreset,
      sizeLimitedSourceBaseName,
    ],
  );

  const getSizeLimitedAutoNameProblems = useCallback(
    (fileNames: string[]) => {
      if (filePath == null || outputDir == null) return { error: undefined };
      return getOutputFileNameProblems({
        fileNames,
        filePath,
        outputDir,
        safeOutputFileName,
      });
    },
    [filePath, outputDir, safeOutputFileName],
  );

  const buildSizeLimitedInternalFileNames = useCallback(
    (items: SizeLimitedInternalNameItem[]) => {
      if (sizeLimitedSourceBaseName == null) return [];

      const reservedFileNames = createReservedFileNames();
      const sourceBaseName = sanitizeSizeLimitedNamePart(
        sizeLimitedSourceBaseName,
      );

      return items.map(({ suffixLabel }) => {
        const stem = [
          sourceBaseName,
          sanitizeSizeLimitedNamePart(suffixLabel),
          'clippress-export',
        ]
          .filter((part) => part.length > 0)
          .join(' ')
          .trim();
        let fileName = `${stem}.mp4`;
        let disambiguator = 2;
        while (reservedFileNames.has(fileName)) {
          fileName = `${stem}-${disambiguator}.mp4`;
          disambiguator += 1;
        }
        reservedFileNames.add(fileName);
        return fileName;
      });
    },
    [sanitizeSizeLimitedNamePart, sizeLimitedSourceBaseName],
  );

  const generateSizeLimitedAutoCutFileNames = useCallback(async () => {
    const fileNames = buildSizeLimitedAutoFileNames(
      sizeLimitedSegmentsForExport.map((segment, index) => ({
        sizeLabel: sizeLimitedFinalSizePlaceholder,
        suffixLabel: getSizeLimitedSeparateSuffixLabelForSegment(
          segment,
          index,
        ),
        clipName: simpleMode ? segment.name : undefined,
      })),
    );

    return {
      fileNames,
      problems: getSizeLimitedAutoNameProblems(fileNames),
    } satisfies GeneratedOutFileNames;
  }, [
    simpleMode,
    buildSizeLimitedAutoFileNames,
    getSizeLimitedAutoNameProblems,
    getSizeLimitedSeparateSuffixLabelForSegment,
    sizeLimitedSegmentsForExport,
  ]);

  const generateSizeLimitedAutoCutMergedFileNames = useCallback(async () => {
    const fileNames = buildSizeLimitedAutoFileNames([
      {
        sizeLabel: sizeLimitedFinalSizePlaceholder,
        suffixLabel: getSizeLimitedMergedSuffixLabel({
          hasSeparateOutputs: !autoDeleteMergedSegments,
        }),
      },
    ]);

    return {
      fileNames,
      problems: getSizeLimitedAutoNameProblems(fileNames),
    } satisfies GeneratedOutFileNames;
  }, [
    autoDeleteMergedSegments,
    buildSizeLimitedAutoFileNames,
    getSizeLimitedAutoNameProblems,
  ]);

  const maybeRenameSizeLimitedOutputs = useCallback(
    async ({
      results,
      shouldDecorateSeparateOutputs,
      shouldDecorateMergedOutput,
      controlMode,
      preset,
    }: {
      results: SizeLimitedExecutionResult[];
      shouldDecorateSeparateOutputs: boolean;
      shouldDecorateMergedOutput: boolean;
      // The export's own, which a quick export preset sets instead of the sheet's.
      controlMode: SizeLimitControlMode;
      preset: SizeLimitPreset;
    }) => {
      if (filePath == null || sizeLimitedSourceBaseName == null) return { results, warnings: [] as string[] };

      const updatedResults = [...results];
      const renameWarnings = new Set<string>();
      const reservedFileNames = createReservedFileNames();

      interface RenameCandidate {
        resultIndex: number;
        currentPath: string;
        sizeLabel: number;
        suffixLabel: string;
        clipName?: string | undefined;
      }

      const candidates: RenameCandidate[] = [];

      if (shouldDecorateSeparateOutputs) {
        for (const [index, segment] of sizeLimitedSegmentsForExport.entries()) {
          const result = updatedResults[index];
          if (result != null && result.created) {
            candidates.push({
              resultIndex: index,
              currentPath: result.path,
              sizeLabel: result.size,
              suffixLabel: getSizeLimitedSeparateSuffixLabelForSegment(
                segment,
                index,
              ),
              // The simple editor names a clip's file after it ("Adil.mp4").
              clipName: simpleMode ? segment.name : undefined,
            });
          }
        }
      }

      if (shouldDecorateMergedOutput && willMerge) {
        const mergedResultIndex = updatedResults.length - 1;
        const mergedResult = updatedResults[mergedResultIndex];
        if (mergedResult != null && mergedResult.created) {
          candidates.push({
            resultIndex: mergedResultIndex,
            currentPath: mergedResult.path,
            sizeLabel: mergedResult.size,
            suffixLabel: getSizeLimitedMergedSuffixLabel({
              hasSeparateOutputs: shouldDecorateSeparateOutputs,
            }),
          });
        }
      }

      for (const candidate of candidates) {
        // A file named after its clip ("Intro.mp4") never replaces one already there, whatever the overwrite setting:
        // that name may well be another file of the user's. It gets a number instead.
        const keepExisting = !enableOverwriteOutput || (candidate.clipName ?? '').trim() !== '';
        try {
          let targetFileName = findAvailableSizeLimitedAutoFileName({
            sourceBaseName: sizeLimitedSourceBaseName,
            controlMode,
            preset,
            safeOutputFileName,
            item: {
              sizeLabel: candidate.sizeLabel,
              suffixLabel: candidate.suffixLabel,
              clipName: candidate.clipName,
            },
            isReserved: (fileName) => reservedFileNames.has(fileName),
          });

          let targetPath = getOutPath({
            customOutDir,
            filePath,
            fileName: targetFileName,
          });
          while (
            targetPath != null
          && targetPath !== candidate.currentPath
          && keepExisting
          && (await mainApi.pathExists(targetPath))
          ) {
            reservedFileNames.add(targetFileName);
            targetFileName = findAvailableSizeLimitedAutoFileName({
              sourceBaseName: sizeLimitedSourceBaseName,
              controlMode,
              preset,
              safeOutputFileName,
              item: {
                sizeLabel: candidate.sizeLabel,
                suffixLabel: candidate.suffixLabel,
                clipName: candidate.clipName,
              },
              isReserved: (fileName) => reservedFileNames.has(fileName),
            });
            targetPath = getOutPath({
              customOutDir,
              filePath,
              fileName: targetFileName,
            });
          }

          reservedFileNames.add(targetFileName);
          // This pass renames a finished export to its final, size-stamped name, and is
          // allowed to replace an existing output. Refuse source destinations here too.
          const targetIsSourceFile = isSourcePath(targetPath, exportProtectedPaths);
          if (targetIsSourceFile) {
            console.warn('Skipping final rename that would target a source file', targetPath);
          }
          if (!targetIsSourceFile && targetPath != null && targetPath !== candidate.currentPath) {
            await assertOutPathsNotSource({ outPaths: [targetPath], protectedPaths: exportProtectedPaths, message: i18n.t('Output name would replace a source file') });
            if (keepExisting && await mainApi.pathExists(targetPath)) throw new Error('Output file already exists');
            await moveExportWithRetry(candidate.currentPath, targetPath, !keepExisting);
            const result = updatedResults[candidate.resultIndex];
            if (result != null) {
              updatedResults[candidate.resultIndex] = {
                ...result,
                path: targetPath,
              };
            }
          }
        } catch (error) {
          console.warn(
            'Failed to apply cleaner size-limited file name',
            candidate.currentPath,
            error,
          );
          renameWarnings.add(
            i18n.t(
              "ClipPress kept one exported file's original name because the cleaner final name could not be applied.",
            ),
          );
        }
      }

      return { results: updatedResults, warnings: [...renameWarnings] };
    },
    [
      simpleMode,
      customOutDir,
      enableOverwriteOutput,
      exportProtectedPaths,
      filePath,
      getSizeLimitedSeparateSuffixLabelForSegment,
      safeOutputFileName,
      sizeLimitedSegmentsForExport,
      sizeLimitedSourceBaseName,
      willMerge,
    ],
  );

  const buildSizeLimitedResultSummary = useCallback(
    (results: SizeLimitedExecutionResult[], requestedTargetSizeMb: number) => {
      const createdResults = results.filter((result) => result.created);
      const singleCreatedResult = createdResults.length === 1
        ? createdResults.find(() => true)
        : undefined;
      const skippedCount = results.length - createdResults.length;
      const largestResult = [...createdResults].sort(
        (a, b) => b.size - a.size,
      )[0];

      return {
        requestedLimitLabel: formatRequestedSizeLimit(requestedTargetSizeMb),
        createdCount: createdResults.length,
        skippedCount,
        largestCreatedSizeLabel:
          largestResult != null
            ? formatSizeLimitedBytes(largestResult.size)
            : undefined,
        singleCreatedSizeLabel:
          singleCreatedResult != null
            ? formatSizeLimitedBytes(singleCreatedResult.size)
            : undefined,
      } satisfies SizeLimitedResultSummary;
    },
    [formatRequestedSizeLimit, formatSizeLimitedBytes],
  );

  const appendSizeLimitedResultNotices = useCallback(
    (
      results: SizeLimitedExecutionResult[],
      notices: Set<string>,
      warnings: Set<string>,
    ) => {
      if (results.length === 0) return;

      const createdResults = results.filter((result) => result.created);
      const skippedCount = results.length - createdResults.length;

      // The encode succeeded for these; only a step after it went wrong. Reported as a
      // warning on a successful export rather than failing the whole export.
      for (const result of results) {
        if (result.postProcessingWarning != null) warnings.add(i18n.t(result.postProcessingWarning));
      }

      if (skippedCount > 0) {
        notices.add(
          i18n.t(
            'Overwrite is off, so {{count}} existing output files were kept.',
            { count: skippedCount },
          ),
        );
      }

      const uniqueStrategies = new Map(
        createdResults.map((result) => [
          `${result.strategy.id}:${result.strategy.fallbackReason ?? 'none'}`,
          result.strategy,
        ]),
      );
      for (const strategy of uniqueStrategies.values()) {
        const encoder = gpuEncoderLabels[strategy.encoder];
        if (strategy.controlMode === 'advanced') {
          // GPU 2-pass runs as one encode with the encoder's own multipass.
          const passLabel = strategy.executionMode === 'ffmpeg_two_pass' || strategy.encoderMultipass
            ? i18n.t('2-pass')
            : i18n.t('1-pass');
          if (strategy.fallbackReason === 'nvidia_unavailable') {
            notices.add(i18n.t('No NVIDIA GPU was found, so Custom settings used {{encoder}} instead.', { encoder }));
          }
          notices.add(
            i18n.t(
              'Custom settings used {{encoder}} {{passLabel}} with preset {{preset}}.',
              {
                encoder,
                passLabel,
                preset: String(strategy.encoderPreset),
              },
            ),
          );
        } else {
          switch (strategy.id) {
            case 'max_quality_av1_cpu_two_pass': {
              notices.add(i18n.t('Max Quality used CPU AV1 (SVT-AV1) 2-pass for the strongest low-bitrate result.'));
              break;
            }
            case 'max_quality_av1_nvenc_two_pass':
            case 'max_quality_av1_gpu': {
              warnings.add(i18n.t('SVT-AV1 was unavailable, so Max Quality used {{encoder}}.', { encoder }));
              break;
            }
            case 'max_quality_h264_cpu_two_pass':
            case 'max_quality_h264_nvenc_two_pass':
            case 'max_quality_h264_gpu': {
              warnings.add(i18n.t('AV1 encoders were unavailable, so Max Quality used {{encoder}}.', { encoder }));
              break;
            }
            case 'quality_av1_nvenc':
            case 'quality_av1_gpu': {
              notices.add(i18n.t('Quality used {{encoder}} for a stronger quality-to-speed balance.', { encoder }));
              break;
            }
            case 'quality_av1_cpu': {
              notices.add(i18n.t('This GPU has no AV1 encoder, so Quality used CPU AV1 (SVT-AV1), which takes longer.'));
              break;
            }
            case 'quality_h264_gpu': {
              notices.add(i18n.t('This GPU has no AV1 encoder, so Quality used {{encoder}} to keep the export quick.', { encoder }));
              break;
            }
            case 'quality_h264_cpu': {
              warnings.add(i18n.t('AV1 encoders were unavailable, so Quality fell back to H.264 CPU.'));
              break;
            }
            case 'fast_av1_nvenc':
            case 'fast_av1_gpu': {
              notices.add(i18n.t('Fast used {{encoder}} with a speed-tuned profile for quick shareable exports.', { encoder }));
              break;
            }
            case 'fast_h264_gpu': {
              notices.add(i18n.t('This GPU has no AV1 encoder, so Fast used {{encoder}}.', { encoder }));
              break;
            }
            case 'fast_av1_cpu':
            case 'fast_h264_cpu': {
              notices.add(i18n.t('No usable GPU encoder was found, so Fast used {{encoder}}.', { encoder }));
              break;
            }
            default: {
              break;
            }
          }
        }
      }
    },
    [],
  );

  /**
   * Turns generated file names into destination paths, repairing any that would land on
   * the source file and then asserting the result.
   *
   * Every export path funnels through here, so "we never write over the file we are
   * reading" holds regardless of which naming scheme produced the names, and a bug in one
   * naming scheme cannot reach the filesystem.
   */
  const resolveSafeOutPaths = useCallback(
    async (fileNames: readonly string[], notices: Set<string>) => {
      invariant(filePath != null && outputDir != null);

      const { fileNames: safeFileNames, adjustments } = makeSafeOutFileNames({
        fileNames,
        outputDir,
        protectedPaths: exportProtectedPaths,
      });

      addSourceSafetyNotice(adjustments, notices);

      const outPaths = safeFileNames.map((fileName) => {
        const outPath = getOutPath({ customOutDir, filePath, fileName });
        invariant(outPath != null);
        return outPath;
      });

      await assertOutPathsNotSource({
        outPaths,
        protectedPaths: exportProtectedPaths,
        message: i18n.t('ClipPress will not export onto the file it is reading from. Choose a different output name or folder.'),
      });

      return { fileNames: safeFileNames, outPaths };
    },
    [customOutDir, exportProtectedPaths, filePath, outputDir],
  );

  /** Exports with the sheet's settings, or a quick export preset's quality (see quickExport). */
  const onExportConfirm = useCallback(async (quickExport?: QuickExport) => {
    invariant(filePath != null && outputDir != null);
    emitEvent({ eventName: 'export-start', path: filePath });
    // The result offers to copy the video: the copy helper starts now, so that copy is instant.
    mainApi.warmCopyHelper().catch((err: unknown) => console.warn('Unable to start the copy helper', err));
    // A name taken in the output folder; an error other than "not there" stops the export instead of risking a file.
    const isOutputNameTaken = async (name: string) => {
      try {
        await lstat(pathJoin(outputDir, name));
        return true;
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false;
        throw err;
      }
    };
    // A file named after its clip (the simple editor) never replaces one already in the folder: it gets a number.
    const keepClipNamesFree = async (fileNames: string[]) => {
      if (!simpleMode || cutFileTemplate != null) return fileNames;
      const assigned = new Set<string>();
      const free: string[] = [];
      for (const [index, fileName] of fileNames.entries()) {
        const named = (segmentsToExport[index]?.name ?? '') !== '';
        // eslint-disable-next-line no-await-in-loop
        const name = named ? await findFreeFileName(fileName, async (candidate) => assigned.has(candidate.toLowerCase()) || isOutputNameTaken(candidate)) : fileName;
        assigned.add(name.toLowerCase());
        free.push(name);
      }
      return free;
    };
    // The clip files a merged-only export has written, deleted again if it fails or is cancelled before the merge.
    const mergePartsWritten: string[] = [];
    const onMergePartWritten = (path: string) => { mergePartsWritten.push(path); };
    // Cancel stops the FFmpeg running then; between steps it's caught here, so the next step doesn't start.
    const exportAbort = new AbortController();
    // The simple editor's card titles the phase with a playful line (Working.tsx); advanced mode keeps the plain step.
    const setExportWorking = ({ phase, ...state }: { text: string, detailText?: string | undefined, phase?: ExportPhase | undefined }) => (
      setWorking({ ...state, phase: simpleMode ? phase : undefined, abortController: exportAbort })
    );

    const quality = resolveExportQuality({
      isSizeLimited: isSizeLimitedExport,
      sizeLimitMb,
      controlMode: sizeLimitControlMode,
      preset: sizeLimitPreset,
      transform: effectiveSizeLimitedTransformSettings,
    }, quickExport?.quality);
    // A quick export says which one it is above the progress, e.g. "Discord · 10 MB · Clip 1 of 2".
    const withQuickExportLabel = (detailText: string | undefined) => (
      quickExport == null ? detailText : [quickExport.label, ...(detailText != null ? [detailText] : [])].join(' · ')
    );

    if (!quality.isSizeLimited && numStreamsToCopy === 0) {
      errorToast(i18n.t('No tracks selected for export'));
      return;
    }

    if (haveInvalidSegs) {
      errorToast(i18n.t('Start time must be before end time'));
      return;
    }

    setStreamsSelectorShown(false);
    setExportConfirmOpen(false);

    if (workingRef.current) return;
    try {
      setExportWorking({ text: i18n.t('Exporting'), detailText: withQuickExportLabel(undefined), phase: 'starting' });
      // Checked again before the original is recycled, so a file that changed meanwhile is never touched.
      const sourceIdentity = await identifyFile(filePath);

      if (
        isChaptersOnlyExport({ segmentsToChaptersOnly, isSizeLimited: quality.isSizeLimited })
        && (hasSegmentSpeedChanges || hasSegmentCropChanges || hasSegmentVolumeChanges)
      ) {
        throw new UserFacingError(i18n.t('Choose a clip export mode to apply speed, crop and volume changes. Chapters-only export keeps the original video.'));
      }

      if (quality.isSizeLimited) {
        const notices = new Set<string>();
        const warnings = new Set<string>();
        const useAutoSeparateNaming = sizeLimitSeparateNamingMode === 'auto';
        const useAutoMergedNaming = sizeLimitMergedNamingMode === 'auto';

        const {
          videoStream: sizeLimitedVideoStream,
          audioStream: sizeLimitedAudioStream,
        } = sizeLimitedStreams;
        if (sizeLimitedVideoStream == null) {
          throw new UserFacingError(
            i18n.t('Size-limited export currently requires a video track.'),
          );
        }

        // Advanced mode's reminder; the simple editor's result keeps to what matters.
        if (!exportConfirmEnabled && !simpleMode) {
          notices.add(
            i18n.t(
              'Export options are not shown. You can enable the export sheet again in Settings.',
            ),
          );
        }

        const results: SizeLimitedExecutionResult[] = [];
        const shouldProduceSeparateOutputs = !willMerge || !autoDeleteMergedSegments;
        const totalJobs = (shouldProduceSeparateOutputs
          ? sizeLimitedSegmentsForExport.length
          : 0) + (willMerge ? 1 : 0);
        const clipCount = shouldProduceSeparateOutputs ? sizeLimitedSegmentsForExport.length : 0;
        const joinedClipCount = willMerge ? sizeLimitedSegmentsForExport.length : 0;
        // The title says what it's doing: fitting to the size, or why it tries again.
        const getStageTitle = (metadata: SizeLimitedProgressMetadata | undefined) => getSizeLimitedStageTitle({
          metadata,
          sizeText: formatRequestedSizeLimit(quality.sizeLimitMb),
          t: (key, options) => i18n.t(key, options),
        });
        let currentWorkingText = i18n.t('Exporting');
        let currentWorkingDetailText: string | undefined;
        const updateWorkingState = ({
          metadata,
          detailText,
        }: {
          metadata: SizeLimitedProgressMetadata | undefined;
          detailText?: string | undefined;
        }) => {
          const text = getStageTitle(metadata);
          if (
            currentWorkingText === text
            && currentWorkingDetailText === detailText
          ) return;
          currentWorkingText = text;
          currentWorkingDetailText = detailText;
          setExportWorking({ text, detailText: withQuickExportLabel(detailText), phase: metadata?.retryReason ?? 'encoding' });
        };
        // A job's last tick (done) comes without its stage: keep the stage it was at.
        let lastStage: { jobIndex: number, metadata: SizeLimitedProgressMetadata } | undefined;
        const updateJobProgress = ({
          jobIndex,
          jobProgress,
          metadata: reported,
        }: {
          jobIndex: number;
          jobProgress: number;
          metadata?: SizeLimitedProgressMetadata | undefined;
        }) => {
          const safeTotalJobs = Math.max(totalJobs, 1);
          setProgress((jobIndex + jobProgress) / safeTotalJobs);
          if (reported != null) lastStage = { jobIndex, metadata: reported };
          const metadata = reported ?? (lastStage?.jobIndex === jobIndex ? lastStage.metadata : undefined);
          updateWorkingState({
            metadata,
            detailText: formatSizeLimitedJobStageText({ jobIndex, totalJobs, clipCount, joinedClipCount, metadata }),
          });
        };

        if (shouldProduceSeparateOutputs) {
          const generatedCutFileNames = useAutoSeparateNaming
            ? buildSizeLimitedInternalFileNames(
              sizeLimitedSegmentsForExport.map((segment, index) => ({
                suffixLabel: getSizeLimitedSeparateSuffixLabelForSegment(
                  segment,
                  index,
                ),
              })),
            )
            : await (async () => {
              const generated = await generateSizeLimitedCustomCutFileNames(
                sizeLimitedCutFileTemplateOrDefault,
              );
              if (generated.problems.error != null) {
                warnings.add(generated.problems.error);
                warnings.add(t('Fell back to default output file name'));
              }
              return generated.fileNames;
            })();

          const { outPaths: cutOutPaths } = await resolveSafeOutPaths(generatedCutFileNames, notices);

          for (const [
            index,
            segment,
          ] of sizeLimitedSegmentsForExport.entries()) {
            exportAbort.signal.throwIfAborted();
            const outPath = cutOutPaths[index];
            invariant(outPath != null);
            updateWorkingState({
              metadata: undefined,
              detailText: formatSizeLimitedJobStageText({ jobIndex: index, totalJobs, clipCount, joinedClipCount, metadata: undefined }),
            });

            const result = await exportSizeLimitedSegment({
              filePath,
              gpuAcceleration: exportGpuAcceleration,
              outPath,
              segment,
              sourceDuration: fileDuration,
              targetSizeMb: quality.sizeLimitMb,
              controlMode: quality.controlMode,
              preset: quality.preset,
              resolution: quality.transform.resolution,
              fps: quality.transform.fps,
              advancedEncoder: sizeLimitAdvancedEncoder,
              advancedTwoPass: sizeLimitAdvancedTwoPass,
              advancedAv1CpuPreset: sizeLimitAdvancedAv1CpuPreset,
              advancedAv1NvencPreset: sizeLimitAdvancedAv1NvencPreset,
              advancedH264CpuPreset: sizeLimitAdvancedH264CpuPreset,
              advancedH264NvencPreset: sizeLimitAdvancedH264NvencPreset,
              videoStream: sizeLimitedVideoStream,
              audioStream: sizeLimitedAudioStream,
              enableOverwriteOutput,
              ffmpegExperimental,
              treatInputFileModifiedTimeAsStart,
              treatOutputFileModifiedTimeAsStart,
              outputPlaybackRate,
              sourceFps: sizeLimitedSourceFps,
              sourceRotation: effectiveRotation,
              rotation: isRotationSet ? effectiveRotation : undefined,
              appendFfmpegCommandLog,
              audioGainDb: combineAudioGain(sizeLimitedAudioGainDb, segment),
              overlayClips: hasOverlayClips ? overlayClips : undefined,
              overlayVideoWidth: sizeLimitedVideoStream.width,
              overlayVideoHeight: sizeLimitedVideoStream.height,
              onProgress: (jobProgress, metadata) => updateJobProgress({ jobIndex: index, jobProgress, metadata }),
            });
            results.push(result);
          }
        }

        let mergedOutFilePath: string | undefined;
        if (willMerge) {
          exportAbort.signal.throwIfAborted();
          const mergedJobIndex = shouldProduceSeparateOutputs
            ? sizeLimitedSegmentsForExport.length
            : 0;
          updateWorkingState({
            metadata: undefined,
            detailText: formatSizeLimitedJobStageText({ jobIndex: mergedJobIndex, totalJobs, clipCount, joinedClipCount, metadata: undefined }),
          });

          const generatedMergedFileNames = useAutoMergedNaming
            ? buildSizeLimitedInternalFileNames([
              {
                suffixLabel: getSizeLimitedMergedSuffixLabel({
                  hasSeparateOutputs: shouldProduceSeparateOutputs,
                }),
              },
            ])
            : await (async () => {
              const { fileNames, problems } = await generateSizeLimitedCustomCutMergedFileNames(
                sizeLimitedCutMergedFileTemplateOrDefault,
              );
              if (problems.error != null) {
                warnings.add(problems.error);
                warnings.add(t('Fell back to default output file name'));
              }
              return fileNames;
            })();

          const { outPaths: mergedOutPaths } = await resolveSafeOutPaths(generatedMergedFileNames, notices);
          [mergedOutFilePath] = mergedOutPaths;
          invariant(mergedOutFilePath != null);

          const mergedResult = await exportSizeLimitedMerge({
            filePath,
            gpuAcceleration: exportGpuAcceleration,
            outPath: mergedOutFilePath,
            segments: sizeLimitedSegmentsForExport,
            targetSizeMb: quality.sizeLimitMb,
            controlMode: quality.controlMode,
            preset: quality.preset,
            resolution: quality.transform.resolution,
            fps: quality.transform.fps,
            advancedEncoder: sizeLimitAdvancedEncoder,
            advancedTwoPass: sizeLimitAdvancedTwoPass,
            advancedAv1CpuPreset: sizeLimitAdvancedAv1CpuPreset,
            advancedAv1NvencPreset: sizeLimitAdvancedAv1NvencPreset,
            advancedH264CpuPreset: sizeLimitAdvancedH264CpuPreset,
            advancedH264NvencPreset: sizeLimitAdvancedH264NvencPreset,
            videoStream: sizeLimitedVideoStream,
            audioStream: sizeLimitedAudioStream,
            enableOverwriteOutput,
            ffmpegExperimental,
            treatInputFileModifiedTimeAsStart,
            treatOutputFileModifiedTimeAsStart,
            outputPlaybackRate,
            sourceFps: sizeLimitedSourceFps,
            sourceRotation: effectiveRotation,
            rotation: isRotationSet ? effectiveRotation : undefined,
            appendFfmpegCommandLog,
            audioGainDb: sizeLimitedAudioGainDb,
            overlayClips: hasOverlayClips ? overlayClips : undefined,
            overlayVideoWidth: sizeLimitedVideoStream.width,
            overlayVideoHeight: sizeLimitedVideoStream.height,
            onProgress: (jobProgress, metadata) => updateJobProgress({ jobIndex: mergedJobIndex, jobProgress, metadata }),
          });
          results.push(mergedResult);
        }

        const shouldDecorateSeparateOutputs = shouldProduceSeparateOutputs && useAutoSeparateNaming;
        const shouldDecorateMergedOutput = willMerge && useAutoMergedNaming;
        const renamedOutputs = await maybeRenameSizeLimitedOutputs({
          results,
          shouldDecorateSeparateOutputs,
          shouldDecorateMergedOutput,
          controlMode: quality.controlMode,
          preset: quality.preset,
        });
        renamedOutputs.warnings.forEach((warning) => warnings.add(warning));

        const finalizedResults = renamedOutputs.results;
        const firstCreatedResult = finalizedResults.find(
          (result) => result.created,
        );
        const resultSummary = buildSizeLimitedResultSummary(
          finalizedResults,
          quality.sizeLimitMb,
        );
        appendSizeLimitedResultNotices(finalizedResults, notices, warnings);

        if (firstCreatedResult != null && simpleMode && !prefersReducedMotion) shootConfetti();

        const exportedPaths = finalizedResults.filter((result) => result.created).map((result) => result.path);

        // "Do this automatically after each export" in the clean-up dialog (asked first, when it asks).
        const askedForCleanup = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport === true && cleanupChoices.askForCleanup;
        const newCleanupChoices: CleanupChoicesType | undefined = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport
          ? (askedForCleanup ? await askForCleanupChoices({ afterExport: true }) : cleanupChoices)
          : undefined;

        // The original is only ever moved to the Recycle Bin through this checked path, whichever setting asks for it.
        const highlights = new Set<string>();
        if (simpleMode && resultSummary.skippedCount > 0) highlights.add(i18n.t('A file with that name was already there, so it was kept.'));
        const closedForRecycling = await recycleOriginalAfterExport({
          highlights,
          wanted: shouldRecycleOriginalAfterExport(trashSourceAfterExport, askedForCleanup, newCleanupChoices),
          exportSignal: exportAbort.signal,
          cleanupAfter: newCleanupChoices,
          sourcePath: filePath,
          sourceIdentity,
          allPlannedCreated: finalizedResults.length > 0 && finalizedResults.every((result) => result.created),
          exportedPaths,
          notices,
          warnings,
        });

        if (newCleanupChoices != null) {
          await cleanupFiles({ ...newCleanupChoices, trashSourceFile: false }).catch((error) => {
            console.warn('Export completed but cleanup failed', error);
            warnings.add(i18n.t('Export finished, but cleanup could not be completed.'));
          });
        }

        if (!hideAllNotifications) showOsNotification(i18n.t(exportedPaths.length > 0 ? 'Export finished' : 'No new files were written'));
        const mergedFinal = willMerge ? finalizedResults.at(-1) : undefined;
        finishExport({
          exportedPaths,
          mergedPath: mergedFinal?.created ? mergedFinal.path : undefined,
          closeAfter: newCleanupChoices == null && !closedForRecycling && exportedPaths.length > 0 && !cleanupChoices.cleanupAfterExport && simpleMode && cleanupChoices.closeFile,
          showResult: (extras) => openSizeLimitedFinishedDialog({
            filePaths: exportedPaths,
            warnings: [...warnings],
            notices: simpleMode ? [] : [...notices],
            highlight: [...highlights].join('\n') || undefined,
            summary: resultSummary,
            showDetails: !simpleMode,
            ...extras,
          }),
        });

        setExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
        setCurrentFileExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
        rememberExportedClip(filePath, sourceIdentity, exportedPaths);
        emitEvent({ eventName: 'export-complete', paths: exportedPaths });
        return;
      }

      if (hasOverlayClips || hasSegmentSpeedChanges || hasSegmentCropChanges) {
        if ((hasSegmentSpeedChanges || hasSegmentCropChanges) && !['mp4', 'mov', 'matroska'].includes(fileFormat ?? '')) {
          throw new UserFacingError(i18n.t('Speed and crop changes require MP4, MOV or MKV output. Choose one of these formats or use size-limited export.'));
        }
        if (
          activeVideoStream == null
          || activeVideoStream.width == null
          || activeVideoStream.height == null
        ) {
          throw new UserFacingError(
            i18n.t('Text export requires a readable video track.'),
          );
        }
        if (!isCopyingStreamId(filePath, activeVideoStream.index)) {
          throw new UserFacingError(
            i18n.t(
              'Text export requires the active video track to stay enabled.',
            ),
          );
        }

        let chaptersToAdd: Chapter[] | undefined;
        if (segmentsToChaptersOnly) {
          const sortedSegments = sortSegments(segmentsOrInverse.selected);
          if (hasAnySegmentOverlap(sortedSegments)) {
            errorToast(i18n.t('Make sure you have no overlapping segments.'));
            return;
          }
          chaptersToAdd = isMatroska(fileFormat)
            ? sortedSegments
            : convertSegmentsToChaptersWithGaps(sortedSegments);
        }

        const notices = new Set<string>();
        const warnings = new Set<string>();
        notices.add(
          i18n.t('Text layers, speed and crop changes require video encoding during export.'),
        );
        if (hasAdditionalVideoStreamsForTextExport) {
          warnings.add(
            i18n.t(
              'Text export currently keeps only the active video track. Disable any extra video tracks if you need exact control.',
            ),
          );
        }

        let cutFileNames: string[];
        if (willMerge && autoDeleteMergedSegments) {
          const generated = await generateCutFileNames(defaultCutFileTemplate);
          // Made and deleted again: never on a file already there (an earlier export's clips).
          cutFileNames = await getMergePartNames(generated.fileNames, isOutputNameTaken);
          addSourceSafetyNotice(generated.problems.sourceSafetyAdjustments, notices);
        } else {
          const generated = await generateCutFileNames(
            cutFileTemplateOrDefault,
          );
          cutFileNames = await keepClipNamesFree(generated.fileNames);
          if (generated.problems.error != null) {
            warnings.add(generated.problems.error);
            warnings.add(t('Fell back to default output file name'));
          }
          addSourceSafetyNotice(generated.problems.sourceSafetyAdjustments, notices);
        }

        exportAbort.signal.throwIfAborted();
        setExportWorking({ text: getCuttingText(segmentsToExport.length), detailText: withQuickExportLabel(undefined), phase: 'cutting' });
        const outFiles = await cutMultipleWithTextOverlays({
          outputDir,
          segments: segmentsToExport,
          cutFileNames,
          fileDuration,
          rotation: effectiveRotation,
          copyFileStreams,
          allFilesMeta,
          outFormat: fileFormat,
          ffmpegExperimental,
          preserveMetadata,
          preserveMovData,
          preserveChapters,
          movFastStart,
          customTagsByFile,
          paramsByStreamId,
          chapters: chaptersToAdd,
          overlayClips,
          videoStreamIndex: activeVideoStream.index,
          videoWidth: activeVideoStream.width,
          videoHeight: activeVideoStream.height,
          encodeAllAudio: willMerge,
          signal: exportAbort.signal,
          onClipWritten: willMerge && autoDeleteMergedSegments ? onMergePartWritten : undefined,
          onProgress: setProgress,
        });

        let mergedOutFilePath: string | undefined;
        let mergedResult: ExportedFile | undefined;

        if (willMerge) {
          exportAbort.signal.throwIfAborted();
          setProgress(0);
          setExportWorking({ text: i18n.t('Joining your clips'), detailText: withQuickExportLabel(undefined), phase: 'cutting' });

          const chapterNames = segmentsToChapters && !invertCutSegments
            ? segmentsToExport.map((segment) => segment.name)
            : undefined;
          const { fileNames, problems } = await generateCutMergedFileNames(
            cutMergedFileTemplateOrDefault,
          );
          if (problems.error != null) {
            warnings.add(problems.error);
            warnings.add(t('Fell back to default output file name'));
          }
          addSourceSafetyNotice(problems.sourceSafetyAdjustments, notices);

          const [fileName] = fileNames;
          invariant(fileName != null);
          mergedOutFilePath = getOutPath({ customOutDir, filePath, fileName });

          mergedResult = await concatCutSegments({
            customOutDir,
            outFormat: fileFormat,
            segmentPaths: outFiles.map((file) => file.path),
            ffmpegExperimental,
            preserveMovData,
            movFastStart,
            onProgress: setProgress,
            chapterNames,
            preserveMetadataOnMerge,
            mergedOutFilePath,
            signal: exportAbort.signal,
          });

          const createdOutFiles = outFiles.flatMap((file) => (file.created ? [file.path] : []));
          mergePartsWritten.length = 0;
          if (autoDeleteMergedSegments && mergedResult.created) await tryDeleteFiles(createdOutFiles);
        }

        if (outFiles.some((file) => !file.created)) notices.add(i18n.t('Existing outputs were skipped.'));
        // Advanced mode's reminder; the simple editor's result keeps to what matters.
        if (!exportConfirmEnabled && !simpleMode) {
          notices.add(
            i18n.t(
              'Export options are not shown. You can enable the export sheet again in Settings.',
            ),
          );
        }

        let extraStreamsFailed = false;
        if (exportExtraStreams) {
          try {
            setProgress(undefined);
            setExportWorking({
              text: i18n.t('Extracting {{count}} unprocessable tracks', {
                count: nonCopiedExtraStreams.length,
              }),
            });
            await extractStreams({
              customOutDir,
              streams: nonCopiedExtraStreams,
            });
            notices.add(
              i18n.t('Unprocessable streams were exported as separate files.'),
            );
          } catch (err) {
            console.error('Extra stream export failed', err);
            warnings.add(i18n.t('Unable to export unprocessable streams.'));
            extraStreamsFailed = true;
          }
        }

        if ((outFiles.some((file) => file.created) || mergedResult?.created) && simpleMode && !prefersReducedMotion) shootConfetti();

        const exportedPaths = getWrittenExportPaths({ files: outFiles, merged: mergedResult, deletedSegments: autoDeleteMergedSegments && mergedResult?.created === true });

        // "Do this automatically after each export" in the clean-up dialog (asked first, when it asks).
        const askedForCleanup = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport === true && cleanupChoices.askForCleanup;
        const newCleanupChoices: CleanupChoicesType | undefined = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport
          ? (askedForCleanup ? await askForCleanupChoices({ afterExport: true }) : cleanupChoices)
          : undefined;

        // The original is only ever moved to the Recycle Bin through this checked path, whichever setting asks for it.
        const highlights = new Set<string>();
        if (simpleMode && outFiles.some((file) => !file.created)) highlights.add(i18n.t('A file with that name was already there, so it was kept.'));
        const closedForRecycling = await recycleOriginalAfterExport({
          highlights,
          wanted: shouldRecycleOriginalAfterExport(trashSourceAfterExport, askedForCleanup, newCleanupChoices),
          exportSignal: exportAbort.signal,
          cleanupAfter: newCleanupChoices,
          sourcePath: filePath,
          sourceIdentity,
          allPlannedCreated: !extraStreamsFailed && outFiles.length > 0 && outFiles.every((file) => file.created) && (mergedResult == null || mergedResult.created),
          exportedPaths,
          notices,
          warnings,
        });

        if (newCleanupChoices != null) {
          await cleanupFiles({ ...newCleanupChoices, trashSourceFile: false }).catch((error) => {
            console.warn('Export completed but cleanup failed', error);
            warnings.add(i18n.t('Export finished, but cleanup could not be completed.'));
          });
        }

        if (!hideAllNotifications) showOsNotification(i18n.t(exportedPaths.length > 0 ? 'Export finished' : 'No new files were written'));
        finishExport({
          exportedPaths,
          mergedPath: mergedResult?.created ? mergedResult.path : undefined,
          closeAfter: newCleanupChoices == null && !closedForRecycling && exportedPaths.length > 0 && !cleanupChoices.cleanupAfterExport && simpleMode && cleanupChoices.closeFile,
          showResult: (extras) => openCutFinishedDialog({
            filePaths: exportedPaths,
            warnings: [...warnings],
            notices: simpleMode ? [] : [...notices],
            highlight: [...highlights].join('\n') || undefined,
            showAdvice: !simpleMode,
            ...extras,
          }),
        });

        setExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
        setCurrentFileExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
        rememberExportedClip(filePath, sourceIdentity, exportedPaths);
        emitEvent({ eventName: 'export-complete', paths: exportedPaths });
        return;
      }

      // Special segments-to-chapters mode:
      let chaptersToAdd: Chapter[] | undefined;
      if (segmentsToChaptersOnly) {
        const sortedSegments = sortSegments(segmentsOrInverse.selected);
        if (hasAnySegmentOverlap(sortedSegments)) {
          errorToast(i18n.t('Make sure you have no overlapping segments.'));
          return;
        }
        // matroska supports gaps, so we can use segments directly
        chaptersToAdd = isMatroska(fileFormat)
          ? sortedSegments
          : convertSegmentsToChaptersWithGaps(sortedSegments);
      }

      console.log('cutFileTemplate', cutFileTemplateOrDefault);

      const notices = new Set<string>();
      const warnings = new Set<string>();

      let cutFileNames: string[];
      // When deleting merged segments, use the default template so that we e.g. don't risk creating a folder structure
      // https://github.com/mifi/lossless-cut/issues/2637
      if (willMerge && autoDeleteMergedSegments) {
        const generated = await generateCutFileNames(defaultCutFileTemplate);
        // Made and deleted again: never on a file already there (an earlier export's clips).
        cutFileNames = await getMergePartNames(generated.fileNames, isOutputNameTaken);
        addSourceSafetyNotice(generated.problems.sourceSafetyAdjustments, notices);
      } else {
        const generated = await generateCutFileNames(cutFileTemplateOrDefault);
        cutFileNames = await keepClipNamesFree(generated.fileNames);
        if (generated.problems.error != null) {
          console.warn(
            'Output segments file name invalid, using default instead',
            generated.fileNames,
          );
          warnings.add(generated.problems.error);
          warnings.add(t('Fell back to default output file name'));
        }
        addSourceSafetyNotice(generated.problems.sourceSafetyAdjustments, notices);
      }

      // throw (() => { const err = new Error('test'); err.code = 'ENOENT'; return err; })();
      exportAbort.signal.throwIfAborted();
      setExportWorking({ text: getCuttingText(segmentsToExport.length), detailText: withQuickExportLabel(undefined), phase: 'cutting' });
      const outFiles = await cutMultiple({
        outputDir,
        customOutDir,
        outFormat: fileFormat,
        fileDuration,
        rotation: isRotationSet ? effectiveRotation : undefined,
        copyFileStreams,
        allFilesMeta,
        keyframeCut,
        segments: segmentsToExport,
        cutFileNames,
        onProgress: setProgress,
        shortestFlag,
        ffmpegExperimental,
        preserveMetadata,
        preserveMetadataOnMerge,
        preserveMovData,
        preserveChapters,
        movFastStart,
        avoidNegativeTs,
        customTagsByFile,
        paramsByStreamId,
        chapters: chaptersToAdd,
        detectedFps,
        encodeAllAudio: willMerge && segmentsToExport.some((segment) => isClipVolumeChanged(segment)),
        signal: exportAbort.signal,
        onClipWritten: willMerge && autoDeleteMergedSegments ? onMergePartWritten : undefined,
      });

      let mergedOutFilePath: string | undefined;
      let mergedResult: ExportedFile | undefined;

      if (willMerge) {
        console.log(
          'cutMergedFileTemplateOrDefault',
          cutMergedFileTemplateOrDefault,
        );

        exportAbort.signal.throwIfAborted();
        setProgress(0);
        setExportWorking({ text: i18n.t('Joining your clips'), detailText: withQuickExportLabel(undefined), phase: 'cutting' });

        const chapterNames = segmentsToChapters && !invertCutSegments
          ? segmentsToExport.map((s) => s.name)
          : undefined;

        const { fileNames, problems } = await generateCutMergedFileNames(
          cutMergedFileTemplateOrDefault,
        );
        if (problems.error != null) {
          console.warn(
            'Merged file name invalid, using default instead',
            fileNames[0],
          );
          warnings.add(problems.error);
          warnings.add(t('Fell back to default output file name'));
        }
        addSourceSafetyNotice(problems.sourceSafetyAdjustments, notices);

        const [fileName] = fileNames;
        invariant(fileName != null);
        mergedOutFilePath = getOutPath({ customOutDir, filePath, fileName });

        mergedResult = await concatCutSegments({
          customOutDir,
          outFormat: fileFormat,
          segmentPaths: outFiles.map((f) => f.path),
          ffmpegExperimental,
          preserveMovData,
          movFastStart,
          onProgress: setProgress,
          chapterNames,
          preserveMetadataOnMerge,
          mergedOutFilePath,
          signal: exportAbort.signal,
        });

        // don't delete existing files that were not created by losslesscut now (due to overwrite disabled) https://github.com/mifi/lossless-cut/issues/2436
        const createdOutFiles = outFiles.flatMap((f) => (f.created ? [f.path] : []));
        mergePartsWritten.length = 0;
        if (autoDeleteMergedSegments && mergedResult.created) await tryDeleteFiles(createdOutFiles);
      }

      if (outFiles.some((file) => !file.created)) notices.add(i18n.t('Existing outputs were skipped.'));

      // Advanced mode's reminder; the simple editor's result keeps to what matters.
      if (!exportConfirmEnabled && !simpleMode) {
        notices.add(
          i18n.t(
            'Export options are not shown. You can enable the export sheet again in Settings.',
          ),
        );
      }

      invariant(mainFileFormat != null);
      // https://github.com/mifi/lossless-cut/issues/329
      if ((outFiles.some((file) => file.created) || mergedResult?.created) && isIphoneHevc(mainFileFormat, mainStreams)) {
        warnings.add(
          i18n.t(
            'There is a known issue with cutting iPhone HEVC videos. The output file may not work in all players.',
          ),
        );
      }

      // https://github.com/mifi/lossless-cut/issues/280
      if ((outFiles.some((file) => file.created) || mergedResult?.created) && !ffmpegExperimental && isProblematicAvc1(fileFormat, mainStreams)) {
        warnings.add(
          i18n.t(
            'There is a known problem with this file type, and the output might not be playable. You can work around this problem by enabling the "Experimental flag" under Settings.',
          ),
        );
      }

      let extraStreamsFailed = false;
      if (exportExtraStreams) {
        try {
          setProgress(undefined); // If extracting extra streams takes a long time, prevent loader from being stuck at 100%
          setExportWorking({
            text: i18n.t('Extracting {{count}} unprocessable tracks', {
              count: nonCopiedExtraStreams.length,
            }),
          });
          await extractStreams({
            customOutDir,
            streams: nonCopiedExtraStreams,
          });
          notices.add(
            i18n.t('Unprocessable streams were exported as separate files.'),
          );
        } catch (err) {
          console.error('Extra stream export failed', err);
          warnings.add(i18n.t('Unable to export unprocessable streams.'));
          extraStreamsFailed = true;
        }
      }

      if (outFiles.some((file) => file.created) && areWeCutting) notices.add(i18n.t('Cutpoints may be inaccurate.'));

      if ((outFiles.some((file) => file.created) || mergedResult?.created) && simpleMode && !prefersReducedMotion) shootConfetti();

      // Note: this should be after cleanup, so we don't accidentally open two dialogs at the same time, leading to error *and* success dialog simultaneously https://github.com/mifi/lossless-cut/issues/2609
      const exportedPaths = getWrittenExportPaths({ files: outFiles, merged: mergedResult, deletedSegments: autoDeleteMergedSegments && mergedResult?.created === true });

      // "Do this automatically after each export" in the clean-up dialog (asked first, when it asks).
      const askedForCleanup = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport === true && cleanupChoices.askForCleanup;
      const newCleanupChoices: CleanupChoicesType | undefined = exportedPaths.length > 0 && cleanupChoices.cleanupAfterExport
        ? (askedForCleanup ? await askForCleanupChoices({ afterExport: true }) : cleanupChoices)
        : undefined;

      // The original is only ever moved to the Recycle Bin through this checked path, whichever setting asks for it.
      const highlights = new Set<string>();
      if (simpleMode && outFiles.some((file) => !file.created)) highlights.add(i18n.t('A file with that name was already there, so it was kept.'));
      const closedForRecycling = await recycleOriginalAfterExport({
        highlights,
        wanted: shouldRecycleOriginalAfterExport(trashSourceAfterExport, askedForCleanup, newCleanupChoices),
        exportSignal: exportAbort.signal,
        cleanupAfter: newCleanupChoices,
        sourcePath: filePath,
        sourceIdentity,
        allPlannedCreated: !extraStreamsFailed && outFiles.length > 0 && outFiles.every((file) => file.created) && (mergedResult == null || mergedResult.created),
        exportedPaths,
        notices,
        warnings,
      });

      if (newCleanupChoices != null) {
        await cleanupFiles({ ...newCleanupChoices, trashSourceFile: false }).catch((error) => {
          console.warn('Export completed but cleanup failed', error);
          warnings.add(i18n.t('Export finished, but cleanup could not be completed.'));
        });
      }

      if (!hideAllNotifications) showOsNotification(i18n.t(exportedPaths.length > 0 ? 'Export finished' : 'No new files were written'));
      finishExport({
        exportedPaths,
        mergedPath: mergedResult?.created ? mergedResult.path : undefined,
        closeAfter: newCleanupChoices == null && !closedForRecycling && exportedPaths.length > 0 && !cleanupChoices.cleanupAfterExport && simpleMode && cleanupChoices.closeFile,
        showResult: (extras) => openCutFinishedDialog({
          filePaths: exportedPaths,
          warnings: [...warnings],
          notices: simpleMode ? [] : [...notices],
          highlight: [...highlights].join('\n') || undefined,
          showAdvice: !simpleMode,
          ...extras,
        }),
      });

      setExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
      setCurrentFileExportCount((c) => c + (exportedPaths.length > 0 ? 1 : 0));
      rememberExportedClip(filePath, sourceIdentity, exportedPaths);

      emitEvent({ eventName: 'export-complete', paths: exportedPaths });
    } catch (err) {
      emitEvent({ eventName: 'export-complete' });

      // A merged-only export that stopped part way: the clip files it wrote go.
      if (mergePartsWritten.length > 0) await tryDeleteFiles(mergePartsWritten);

      if (isAbortedError(err)) return;

      showOsNotification(i18n.t('Failed to export'));

      if (isExecaError(err)) {
        console.log('stdout:', getStdioString(err.stdout));
        console.error('stderr:', getStdioString(err.stderr));

        if (isOutOfSpaceError(err)) {
          showDiskFull();
          return;
        }
        if (isMuxNotSupported(err)) {
          showMuxNotSupported();
          return;
        }
      }

      if (err instanceof OutputNotWritableError) {
        showOutputNotWritable();
        return;
      }

      if (err instanceof UserFacingError) {
        errorToast(err.message);
        return;
      }

      handleExportFailed(err);
    } finally {
      setWorking(undefined);
      setProgress(undefined);
    }
  }, [
    cutFileTemplate,
    finishExport,
    activeVideoStream,
    recycleOriginalAfterExport,
    trashSourceAfterExport,
    allFilesMeta,
    appendFfmpegCommandLog,
    appendSizeLimitedResultNotices,
    exportGpuAcceleration,
    areWeCutting,
    askForCleanupChoices,
    autoDeleteMergedSegments,
    avoidNegativeTs,
    buildSizeLimitedInternalFileNames,
    buildSizeLimitedResultSummary,
    cleanupChoices,
    cleanupFiles,
    concatCutSegments,
    copyFileStreams,
    customOutDir,
    customTagsByFile,
    cutFileTemplateOrDefault,
    cutMergedFileTemplateOrDefault,
    cutMultiple,
    cutMultipleWithTextOverlays,
    detectedFps,
    effectiveRotation,
    effectiveSizeLimitedTransformSettings,
    enableOverwriteOutput,
    exportConfirmEnabled,
    exportExtraStreams,
    extractStreams,
    ffmpegExperimental,
    fileDuration,
    fileFormat,
    filePath,
    formatSizeLimitedJobStageText,
    formatRequestedSizeLimit,
    generateCutFileNames,
    generateCutMergedFileNames,
    generateSizeLimitedCustomCutFileNames,
    generateSizeLimitedCustomCutMergedFileNames,
    getSizeLimitedSeparateSuffixLabelForSegment,
    handleExportFailed,
    hasAdditionalVideoStreamsForTextExport,
    hasOverlayClips,
    hasSegmentSpeedChanges,
    hasSegmentCropChanges,
    hasSegmentVolumeChanges,
    rememberExportedClip,
    haveInvalidSegs,
    hideAllNotifications,
    invertCutSegments,
    isCopyingStreamId,
    isRotationSet,
    isSizeLimitedExport,
    keyframeCut,
    mainFileFormat,
    mainStreams,
    maybeRenameSizeLimitedOutputs,
    movFastStart,
    nonCopiedExtraStreams,
    numStreamsToCopy,
    openCutFinishedDialog,
    openSizeLimitedFinishedDialog,
    outputDir,
    outputPlaybackRate,
    overlayClips,
    paramsByStreamId,
    preserveChapters,
    preserveMetadata,
    preserveMetadataOnMerge,
    preserveMovData,
    prefersReducedMotion,
    resolveSafeOutPaths,
    setWorking,
    segmentsOrInverse.selected,
    segmentsToChapters,
    segmentsToChaptersOnly,
    segmentsToExport,
    shortestFlag,
    showOsNotification,
    simpleMode,
    sizeLimitAdvancedAv1CpuPreset,
    sizeLimitAdvancedAv1NvencPreset,
    sizeLimitAdvancedEncoder,
    sizeLimitAdvancedH264CpuPreset,
    sizeLimitAdvancedH264NvencPreset,
    sizeLimitAdvancedTwoPass,
    sizeLimitControlMode,
    sizeLimitMb,
    sizeLimitMergedNamingMode,
    sizeLimitPreset,
    sizeLimitSeparateNamingMode,
    sizeLimitedAudioGainDb,
    sizeLimitedCutFileTemplateOrDefault,
    sizeLimitedCutMergedFileTemplateOrDefault,
    sizeLimitedSegmentsForExport,
    sizeLimitedSourceFps,
    sizeLimitedStreams,
    t,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
    tryDeleteFiles,
    willMerge,
    workingRef,
  ]);

  const onExportPress = useCallback(async () => {
    if (!filePath) return;

    if (!exportConfirmEnabled || exportConfirmOpen) {
      await onExportConfirm();
    } else {
      // Note: opening the export sheet must not touch the user's naming settings.
      // Simple mode used to clear both name templates and force naming to
      // "custom_template" on every open, which discarded the saved choice each time and,
      // because the size-limited default template resolves to the source file's own name,
      // pointed the export straight at the file being exported.
      setExportConfirmOpen(true);
      setStreamsSelectorShown(false);
    }
  }, [
    exportConfirmEnabled,
    exportConfirmOpen,
    filePath,
    onExportConfirm,
  ]);

  // Export straight away, without the sheet: Ctrl+click on Export or Ctrl+E with the sheet's last settings, and
  // Ctrl+1/2/3 once with a quick export preset's quality (the sheet keeps its own). Otherwise a normal export.
  const quickExport = useCallback(async (presetIndex?: number) => {
    if (!filePath || workingRef.current) return;
    const translate = (key: string, options: Record<string, string | number>) => i18n.t(key, options);
    const preset = presetIndex != null ? normalizeQuickExportPresets(quickExportPresets)[presetIndex] : undefined;
    // A shortcut left on a quick export that isn't there any more does nothing.
    if (presetIndex != null && preset == null) return;
    await onExportConfirm(preset != null
      ? { label: getQuickExportPresetLabel(preset, translate), quality: preset }
      : { label: getLastSettingsLabel({ isSizeLimited: isSizeLimitedExport, sizeLimitMb }, translate) });
  }, [filePath, isSizeLimitedExport, onExportConfirm, quickExportPresets, sizeLimitMb, workingRef]);

  const captureSnapshot = useCallback(async () => {
    if (!filePath || workingRef.current) return;
    try {
      setWorking({ text: i18n.t('Exporting') });

      await withErrorHandling(async () => {
        const currentTime = getRelevantTime();
        const video = videoRef.current;
        invariant(video != null);
        const usingFfmpeg = usingPreviewFile || captureFrameMethod === 'ffmpeg';
        const outPath = usingFfmpeg
          ? await captureFrameFromFfmpeg({
            customOutDir,
            filePath,
            time: currentTime,
            captureFormat,
            quality: captureFrameQuality,
          })
          : await captureFrameFromTag({
            customOutDir,
            filePath,
            time: currentTime,
            captureFormat,
            quality: captureFrameQuality,
            video,
          });

        if (simpleMode && !prefersReducedMotion) shootConfetti();
        if (!hideAllNotifications) {
          openExportFinishedDialog({
            filePath: outPath,
            children: (
              <div style={{ wordWrap: 'break-word' }}>
                {i18n.t('Screenshot captured to:')} {outPath}
              </div>
            ),
          });
        }
      }, i18n.t('Failed to capture frame'));
    } finally {
      setWorking(undefined);
    }
  }, [
    filePath,
    workingRef,
    setWorking,
    withErrorHandling,
    getRelevantTime,
    videoRef,
    usingPreviewFile,
    captureFrameMethod,
    captureFrameFromFfmpeg,
    customOutDir,
    captureFormat,
    captureFrameQuality,
    captureFrameFromTag,
    simpleMode,
    prefersReducedMotion,
    hideAllNotifications,
    openExportFinishedDialog,
  ]);

  const captureSnapshotToClipboard = useCallback(async () => {
    if (!filePath || workingRef.current) return;
    try {
      setWorking({ text: i18n.t('Exporting') });

      await withErrorHandling(async () => {
        const currentTime = getRelevantTime();
        await captureFrameToClipboard({
          filePath,
          time: currentTime,
          quality: captureFrameQuality,
        });

        if (simpleMode && !prefersReducedMotion) shootConfetti();
        if (!hideAllNotifications) {
          getSwal().toast.fire({
            icon: 'info',
            title: t('Screenshot captured clipboard'),
          });
        }
      }, i18n.t('Failed to capture frame'));
    } finally {
      setWorking(undefined);
    }
  }, [
    captureFrameQuality,
    captureFrameToClipboard,
    filePath,
    getRelevantTime,
    hideAllNotifications,
    prefersReducedMotion,
    setWorking,
    simpleMode,
    t,
    withErrorHandling,
    workingRef,
  ]);

  const extractSegmentsFramesAsImages = useCallback(
    async (segments: SegmentBase[]) => {
      if (
        !filePath
        || detectedFps == null
        || workingRef.current
        || segments.length === 0
      ) return;
      const segmentsNumFrames = segments.reduce(
        (acc, { start, end }) => acc + (end == null ? 1 : (getFrameCount(end - start) ?? 0)),
        0,
      );
      // If all segments are markers, we shall export every marker as a file and therefore we don't have to ask user
      const areAllSegmentsMarkers = segments.every((seg) => seg.end == null);
      const captureFramesResponse = areAllSegmentsMarkers
        ? { filter: undefined, estimatedMaxNumFiles: segmentsNumFrames }
        : await askExtractFramesAsImages({
          segmentsNumFrames,
          plural: segments.length > 1,
          fps: detectedFps,
        });

      if (captureFramesResponse == null) return;

      try {
        setWorking({ text: i18n.t('Extracting frames') });
        console.log('Extracting frames as images', { captureFramesResponse });

        setProgress(0);

        let lastOutPath: string | undefined;

        const segmentProgresses: Record<number, number> = {};
        const handleSegmentProgress = (
          segIndex: number,
          segmentProgress: number,
        ) => {
          segmentProgresses[segIndex] = segmentProgress;
          const totalProgress = segments.reduce(
            (acc, _ignored, index) => acc + (segmentProgresses[index] ?? 0),
            0,
          );
          setProgress(totalProgress / segments.length);
        };

        // eslint-disable-next-line no-restricted-syntax
        for (const [index, segment] of segments.entries()) {
          const { start, end } = segment;
          invariant(filePath != null);
          // eslint-disable-next-line no-await-in-loop
          lastOutPath = await captureFramesRange({
            customOutDir,
            filePath,
            fps: detectedFps,
            fromTime: start,
            toTime: end,
            estimatedMaxNumFiles: captureFramesResponse.estimatedMaxNumFiles,
            captureFormat,
            quality: captureFrameQuality,
            filter: captureFramesResponse.filter,
            outputTimestamps: captureFrameFileNameFormat === 'timestamp',
            onProgress: (segmentProgress) => handleSegmentProgress(index, segmentProgress),
          });
        }
        if (!hideAllNotifications && lastOutPath != null) {
          showOsNotification(i18n.t('Frames have been extracted'));
          openExportFinishedDialog({
            filePath: lastOutPath,
            children: (
              <div style={{ wordWrap: 'break-word' }}>
                {i18n.t('Frames extracted to: {{path}}', { path: outputDir })}
              </div>
            ),
          });
        }
      } catch (err) {
        showOsNotification(i18n.t('Failed to extract frames'));
        handleError({ err, title: i18n.t('Failed to extract frames') });
      } finally {
        setWorking(undefined);
        setProgress(undefined);
      }
    },
    [
      filePath,
      detectedFps,
      workingRef,
      getFrameCount,
      setWorking,
      hideAllNotifications,
      captureFramesRange,
      customOutDir,
      captureFormat,
      captureFrameQuality,
      captureFrameFileNameFormat,
      showOsNotification,
      openExportFinishedDialog,
      outputDir,
      handleError,
    ],
  );

  const extractCurrentSegmentFramesAsImages = useCallback(() => {
    if (currentCutSeg != null) extractSegmentsFramesAsImages([currentCutSeg]);
  }, [currentCutSeg, extractSegmentsFramesAsImages]);

  const extractSelectedSegmentsFramesAsImages = useCallback(
    () => extractSegmentsFramesAsImages(selectedSegments),
    [extractSegmentsFramesAsImages, selectedSegments],
  );

  const userChangePlaybackRate = useCallback(
    (dir: number, rateMultiplier?: number) => {
      const video = videoRef.current;
      if (!playingRef.current) {
        video!.play();
      } else {
        const newRate = adjustRate(video!.playbackRate, dir, rateMultiplier);
        setPlaybackRate(newRate);
      }
    },
    [playingRef, setPlaybackRate, videoRef],
  );

  const loadEdlFile = useCallback(
    async ({
      path,
      type,
      append = false,
    }: {
      path: string;
      type: EdlFileType;
      append?: boolean;
    }) => {
      console.log('Loading EDL file', type, path, append);
      // cannot clamDuration because the duration is null (if no file loaded) or duration of a different file (if switching files)
      // because of how react state works
      loadCutSegments({
        segments: await readEdlFile({ type, path, fps: detectedFps }),
        append,
      });
    },
    [detectedFps, loadCutSegments],
  );

  const applyProjectState = useCallback(
    ({
      mediaFilePath,
      project,
    }: {
      mediaFilePath: string;
      project: Awaited<ReturnType<typeof loadLlcProject>>;
    }) => {
      // The whole file loads no segments: its full-file segment is created once the media has loaded.
      const segments = getProjectSegmentsToLoad(project);
      if (segments.length > 0) loadCutSegments({ segments, append: false, asOpened: true });
      setCustomTagsByFile(
        project.streamEdits?.customTags != null
          ? { [mediaFilePath]: project.streamEdits.customTags }
          : {},
      );
      streamParamsHistory.reset(
        project.streamEdits?.streamParams != null
          && project.streamEdits.streamParams.length > 0
          ? new Map([
            [
              mediaFilePath,
              new Map(
                project.streamEdits.streamParams.map(
                  ({ streamId, params }) => [streamId, { ...params }],
                ),
              ),
            ],
          ])
          : new Map(),
      );
      overlayClipsHistory.reset(project.overlayClips ?? []);
      setSelectedOverlayId(undefined);
    },
    [loadCutSegments, overlayClipsHistory, streamParamsHistory],
  );

  const loadProjectIntoState = useCallback(
    async ({
      path,
      mediaFilePath,
    }: {
      path: string;
      mediaFilePath: string;
    }) => {
      const project = await loadLlcProject(path);
      applyProjectState({ mediaFilePath, project });
    },
    [applyProjectState],
  );

  const loadSubtitleTrackToSegments = useCallback(
    async (streamId: number) => {
      invariant(filePath != null);
      setWorking(true);
      try {
        setStreamsSelectorShown(false);
        loadCutSegments({
          segments: await extractSubtitleTrackToSegments(filePath, streamId),
          append: true,
          clampDuration: fileDuration,
        });
      } finally {
        setWorking(undefined);
      }
    },
    [fileDuration, filePath, loadCutSegments, setWorking],
  );

  const loadMedia = useCallback(
    async ({
      filePath: fp,
      projectPath,
      relocatedFrom,
    }: {
      filePath: string;
      projectPath?: string | undefined;
      /** The recording was found in a new place: its edits move here (#16). */
      relocatedFrom?: RelocatedRecording | undefined;
    }) => {
      // Every loadMedia call claims a generation. A load whose generation is no longer
      // current has been superseded by a newer file, so it must not touch state.
      loadGenerationRef.current += 1;
      const generation = loadGenerationRef.current;
      const isStale = () => generation !== loadGenerationRef.current;

      // The project file the opened state comes from, if any.
      let loadedProjectPath: string | undefined;
      // Other copies found holding the same edits ("Both" keeps two), which autosave then needn't write again.
      let sameCopyPaths: string[] = [];

      async function loadProject(path: string) {
        await loadProjectIntoState({ path, mediaFilePath: fp });
        loadedProjectPath = path;
      }

      // Projects found in older places (next to the recording, the export folder), to move to the Recycle Bin once the
      // project is saved in ClipPress's folder; and those left at a relocated recording's old place.
      let sidecarsToRetire: string[] = relocatedFrom?.projectCopies ?? [];

      async function tryFindAndLoadProjectFile({
        chapters,
        cod,
      }: {
        chapters: FFprobeChapter[];
        cod: string | undefined;
      }) {
        try {
          // Where the setting saves first, then ClipPress's folder, the export folder and next to the recording.
          const storeEnv = getProjectStoreEnv();
          const found: { path: string, mtimeMs: number }[] = [];
          for (const candidate of getProjectLookupPaths(fp, projectFileLocation, cod, storeEnv)) {
            // MAS only allows fs.access (pathExists) if we don't have access to input dir yet, so check first if the file exists,
            // so we don't need to annoy the user by asking for permission if the project file doesn't exist
            if (await mainApi.pathExists(candidate)) {
              let mtimeMs = 0;
              try {
                ({ mtimeMs } = await lstat(candidate));
              } catch {
                // Can't tell its age: it still counts, after any copy that can
              }
              found.push({ path: candidate, mtimeMs });
            }
          }
          if (found.length > 0) {
            // More than one copy (the setting was changed, "Both", or an older version saved next to the recording): the
            // most recently saved edits win; on a tie, the place the setting points to (the order above). One that
            // can't be read is passed over for the next.
            const { opened, unreadable } = await readNewestProjectCopy(found, async (path) => {
              // Next to the recording we may have to ask the user, because we need to read it
              if (dirname(path) === dirname(fp)) await ensureAccessToSourceDir(fp);
              return loadLlcProject(path);
            }, (err) => err instanceof DirectoryAccessDeclinedError);
            const unreadablePaths = unreadable.map(({ path }) => path);
            for (const { path, error } of unreadable) logProjectFiles('warn', `Could not read the edits in ${path}: ${error instanceof Error ? error.message : String(error)}`);
            // Autosave is about to save what is opened everywhere the setting points (or the first edit, if nothing could
            // be opened): what it didn't open is kept under another name next to it first.
            const savePaths = getProjectSavePaths(fp, projectFileLocation, customOutDir, storeEnv);
            if (autoSaveProjectFile) sameCopyPaths = await keepCopiesNotOpened({ savePaths, openedPath: opened?.path, unreadable: unreadablePaths });
            // Reported below, and the recording opens without edits.
            if (opened == null) throw unreadable[0]?.error;
            if (unreadable.length > 0) getSwal().toast.fire({ icon: 'warning', timer: 10000, text: i18n.t('The newest copy of your edits couldn\'t be read, so an earlier copy was opened.') });
            applyProjectState({ mediaFilePath: fp, project: opened.project });
            loadedProjectPath = opened.path;
            // Only its own: one in the export folder is named after its recording only, so it may be another's.
            const toRetire = getProjectCopiesToRetire(found.map(({ path }) => path).filter((path) => !unreadablePaths.includes(path)), projectFileLocation, savePaths, isWindows || isMac);
            sidecarsToRetire = [...sidecarsToRetire, ...(await filterOwnProjectFiles(fp, toRetire, opened.path))];
            return;
          }

          // OK, we didn't find a project file, instead maybe try to create project (segments) from chapters
          const edl = tryMapChaptersToEdl(chapters);
          if (
            edl.length > 0
            && (enableImportChapters === 'always'
              || (enableImportChapters === 'ask'
                && (await askForImportChapters())))
          ) {
            console.log('Convert chapters to segments', edl);
            loadCutSegments({ segments: edl, append: false });
          }
        } catch (err) {
          if (err instanceof DirectoryAccessDeclinedError) throw err;
          console.error('EDL load failed, but continuing', err);
          errorToast(
            `${i18n.t('Failed to load segments')} (${err instanceof Error && err.message})`,
          );
        }
      }

      performance.mark('clippress:load-start');
      setWorking({ text: i18n.t('Opening {{name}}', { name: basename(fp) }), quiet: true });
      try {
        // Need to check if file is actually readable
        const pathReadAccessErrorCode = await getPathReadAccessError(fp);
        if (pathReadAccessErrorCode != null) {
          let errorMessage: string | undefined;
          if (pathReadAccessErrorCode === 'ENOENT') errorMessage = i18n.t('The media you tried to open does not exist');
          else if (['EACCES', 'EPERM'].includes(pathReadAccessErrorCode)) {
            errorMessage = i18n.t(
              'You do not have permission to access this file',
            );
          } else {
            errorMessage = i18n.t(
              'Could not open media due to error {{errorCode}}',
              { errorCode: pathReadAccessErrorCode },
            );
          }
          errorToast(errorMessage);
          return;
        }

        // Not sure why this one is needed, but I think sometimes fs.access doesn't fail but it fails when actually trying to read
        if (!(await havePermissionToReadFile(fp))) {
          errorToast(i18n.t('You do not have permission to access this file'));
          return;
        }

        performance.mark('clippress:load-probe-start');
        // Stat first: a recording probed before and unchanged since (Next clip, a reopen) skips ffprobe.
        const fileStats = await readFileStats(fp);
        const ffprobeMeta = await readFileFfprobeMetaCached(fp, fileStats);
        performance.mark('clippress:load-probed');
        // console.log('file meta read', fileMeta);

        const fileFormatNew = await getDefaultOutFormat({
          filePath: fp,
          fileMeta: ffprobeMeta,
        });
        if (!fileFormatNew) throw new Error('Unable to determine file format');

        const timecode = autoLoadTimecode
          ? getTimecodeFromStreams(ffprobeMeta.streams)
          : undefined;

        const [firstVideoStream] = getRealVideoStreams(ffprobeMeta.streams);
        const [firstAudioStream] = getAudioStreams(ffprobeMeta.streams);

        const copyStreamIdsForPathNew = fromPairs(
          ffprobeMeta.streams.map((stream) => [
            stream.index,
            shouldCopyStreamByDefault(stream),
          ]),
        );

        const validDuration = isDurationValid(
          parseFloat(ffprobeMeta.format.duration),
        );

        const hevcPlaybackSupported = enableNativeHevc && (await hevcPlaybackSupportedPromise);

        // need to ensure we have access to write to working directory
        const cod = await ensureWritableOutDir({
          inputPath: fp,
          outDir: customOutDir,
        });

        // Projects saved next to the recording are written to its folder, so ensure access to that one too
        if (projectFileLocation === 'recording' || projectFileLocation === 'both') await ensureAccessToSourceDir(fp);

        const existingHtml5FriendlyFile = await findExistingHtml5FriendlyFile(
          fp,
          cod,
        );

        const needsAutoHtml5ify = !existingHtml5FriendlyFile
          && !willPlayerProperlyHandleVideo({
            streams: ffprobeMeta.streams,
            hevcPlaybackSupported,
            isMasBuild,
          })
          && validDuration;

        console.log('loadMedia', {
          filePath: fp,
          customOutDir: cod,
          projectPath,
        });

        // BEGIN STATE UPDATES:
        if (isStale()) return;

        resetState();
        clearSegColorCounter();

        if (existingHtml5FriendlyFile) {
          console.log(
            'Found existing html5 friendly file',
            existingHtml5FriendlyFile.path,
          );
          setUsingDummyVideo(existingHtml5FriendlyFile.usingDummyVideo);
          setPreviewFilePath(existingHtml5FriendlyFile.path);
        }

        if (needsAutoHtml5ify) {
          // Try to auto-html5ify if there are known issues with this file
          // 'fastest' works with almost all video files
          await html5ifyAndLoadWithPreferences(
            cod,
            fp,
            'fastest',
            firstVideoStream != null,
            firstAudioStream != null,
          );
          if (isStale()) return;
        }

        // Reading a project file that is still being saved (by the previous file, or the previous
        // open of this file) would miss its latest edits, and the next save would then drop them.
        await whenProjectSaved();
        if (isStale()) return;

        performance.mark('clippress:load-before-project');
        if (projectPath) {
          await loadProject(projectPath);
          // Edits opened on purpose (or a relocated recording's) replace what this recording had: kept as a backup.
          if (autoSaveProjectFile) sameCopyPaths = await keepCopiesAboutToBeReplaced(getProjectSavePaths(fp, projectFileLocation, customOutDir, getProjectStoreEnv()), projectPath);
        } else {
          await tryFindAndLoadProjectFile({
            chapters: ffprobeMeta.chapters,
            cod,
          });
        }
        if (isStale()) return;

        // throw new Error('test');

        // eslint-disable-next-line no-inner-declarations
        function getFps() {
          if (firstVideoStream != null) return getStreamFps(firstVideoStream);
          if (firstAudioStream != null) return getStreamFps(firstAudioStream);
          return undefined;
        }

        if (timecode) setStartTimeOffset(timecode);
        setDetectedFps(getFps());
        setMainFileMeta({
          ffprobeMeta,
          stats: {
            size: fileStats.size,
            atime: fileStats.atimeMs,
            mtime: fileStats.mtimeMs,
            ctime: fileStats.ctimeMs,
            birthtime: fileStats.birthtimeMs,
          },
        });
        setCopyStreamIdsForPath(fp, () => copyStreamIdsForPathNew);
        setDetectedFileFormat(fileFormatNew);
        if (outFormatLocked) {
          setFileFormat(outFormatLocked);
        } else {
          const recommendedDefaultFormat = mapRecommendedDefaultFormat({
            sourceFormat: fileFormatNew,
            streams: ffprobeMeta.streams,
          });
          if (recommendedDefaultFormat.message) {
            showNotification({
              icon: 'info',
              text: recommendedDefaultFormat.message,
            });
          }
          setFileFormat(recommendedDefaultFormat.format);
        }

        // only show one toast, or else we will only show the last one
        if (
          existingHtml5FriendlyFile
          && !existingHtml5FriendlyFile.usingDummyVideo
        ) {
          showPreviewFileLoadedMessage(
            basename(existingHtml5FriendlyFile.path),
          );
        } else if (needsAutoHtml5ify) {
          showNotNativelySupportedMessage();
        } else if (isAudioDefinitelyNotSupported(ffprobeMeta.streams)) {
          showNotification({
            icon: 'info',
            text: i18n.t(
              'The audio track is not supported while previewing. You can convert to a supported format from the menu',
            ),
          });
        } else if (!validDuration) {
          getSwal().toast.fire({
            icon: 'warning',
            timer: 10000,
            text: i18n.t(
              "This file does not have a valid duration. This may cause issues. You can try to fix the file's duration from the File menu",
            ),
          });
        }

        if (isStale()) return;
        // Autosave compares later changes with the state opened here.
        setProjectSession({ id: generation, loadedProjectPath, ...(loadedProjectPath != null && sameCopyPaths.length > 0 ? { sameCopyPaths } : {}) });
        if (sidecarsToRetire.length > 0) sidecarRetirementRef.current = { sessionId: generation, paths: sidecarsToRetire };
        // A relocated recording takes the place of its old entries.
        setRecentFiles((list) => addRecentFile((relocatedFrom?.mediaPaths ?? []).reduce((rest, oldPath) => removeRecentFile(rest, oldPath, isWindows || isMac), list), fp, Date.now(), isWindows || isMac));
        setShelfFolder(dirname(fp));
        setShelfAnchorPath(fp);
        // This needs to be last, because it triggers <video> to load the video
        // If not, onVideoError might be triggered before setWorking() has been cleared.
        // https://github.com/mifi/lossless-cut/issues/515
        performance.mark('clippress:load-file-set');
        setFilePath(fp);
      } catch (err) {
        // A superseded load must not reset the newer file's state nor surface its error,
        // but it still has to stop propagating, so swallow it here.
        if (isStale()) {
          console.warn('Ignoring error from superseded file load', fp, err);
          return;
        }
        if (err instanceof DirectoryAccessDeclinedError) return;
        resetState();
        throw err;
      }
    },
    [
      projectFileLocation,
      autoSaveProjectFile,
      setWorking,
      enableImportChapters,
      ensureAccessToSourceDir,
      loadCutSegments,
      autoLoadTimecode,
      enableNativeHevc,
      ensureWritableOutDir,
      customOutDir,
      resetState,
      clearSegColorCounter,
      setCopyStreamIdsForPath,
      setDetectedFileFormat,
      outFormatLocked,
      setUsingDummyVideo,
      setPreviewFilePath,
      html5ifyAndLoadWithPreferences,
      setFileFormat,
      showNotification,
      showPreviewFileLoadedMessage,
      showNotNativelySupportedMessage,
      loadProjectIntoState,
      applyProjectState,
      whenProjectSaved,
      setRecentFiles,
    ],
  );

  const toggleLastCommands = useCallback(
    () => setLastCommandsVisible((val) => !val),
    [],
  );
  const toggleSettings = useCallback(
    () => setSettingsVisible((val) => !val),
    [],
  );

  const seekClosestKeyframe = useCallback(
    (direction: number) => {
      const time = findNearestKeyFrameTime({
        time: getRelevantTime(),
        direction,
      });
      if (time == null) return;
      seekAbs(time);
    },
    [findNearestKeyFrameTime, getRelevantTime, seekAbs],
  );

  // Alt+← / → in the simple editor, which shows no keyframes: the clip edge before or after.
  const seekClipEdge = useCallback((direction: -1 | 1) => {
    if (!isDurationValid(fileDuration)) return;
    const time = findClipEdge({ time: getRelevantTime(), clips: isInitialSegment(cutSegments) ? [] : cutSegments, duration: fileDuration, direction, frame: 1 / (detectedFps || 30) });
    if (time != null) seekAbs(time);
  }, [cutSegments, detectedFps, fileDuration, getRelevantTime, seekAbs]);

  const onTimelineWheel = useTimelineScroll({
    wheelSensitivity,
    mouseWheelZoomModifierKey,
    mouseWheelFrameSeekModifierKey,
    mouseWheelKeyframeSeekModifierKey,
    extraMouseModifierKeys,
    invertTimelineScroll,
    zoomRel,
    seekRel,
    shortStep,
    seekClosestKeyframe,
  });

  const seekAccelerationRef = useRef(1);

  const userOpenSingleFile = useCallback(
    async ({
      path: pathIn,
      isLlcProject,
    }: {
      path: string;
      isLlcProject?: boolean;
    }) => {
      let path = pathIn;
      let projectPath: string | undefined;
      let relocatedFrom: RelocatedRecording | undefined;

      // Open .llc AND media referenced within
      if (isLlcProject) {
        console.log('Loading LLC project', path);
        const project = await loadLlcProject(path);
        const { mediaFileName } = project;

        console.log({ mediaFileName });
        if (!mediaFileName) return;

        // Next to the project, or where it says the recording is (a project from ClipPress's own folder isn't next to it).
        // Note: MAS only allows fs.stat (pathExists) if we don't have access to input dir yet
        let mediaFilePath: string | undefined;
        for (const candidate of getProjectMediaCandidates(project, path, getProjectStoreEnv())) {
          if (await mainApi.pathExists(candidate)) {
            mediaFilePath = candidate;
            break;
          }
        }

        if (mediaFilePath == null) {
          // Moved or renamed: the user can point to it, and the edits move with it (#16).
          const oldMediaPath = getProjectMediaOldPath(project, path, customOutDir, getProjectStoreEnv()) ?? pathJoin(dirname(path), mediaFileName);
          const relocation = await relocateRecording({ oldMediaPath, otherOldMediaPaths: project.mediaFilePath != null ? [project.mediaFilePath] : [], project, projectPath: path });
          if (relocation == null) return;
          ({ mediaPath: mediaFilePath, relocatedFrom } = relocation);
        }

        projectPath = path;

        // We might need to get user's access to the project file's directory, in order to read the media file
        try {
          await ensureAccessToSourceDir(mediaFilePath);
        } catch (err) {
          if (err instanceof DirectoryAccessDeclinedError) return;
        }
        path = mediaFilePath;
      }

      if (/\.vob$/i.test(path) && mustDisallowVob()) return;

      await loadMedia({ filePath: path, projectPath, relocatedFrom });
    },
    [customOutDir, ensureAccessToSourceDir, loadMedia, relocateRecording],
  );

  // todo merge with userOpenFiles?
  const batchOpenSingleFile = useCallback(
    async (path: string) => {
      if (workingRef.current) return;
      if (filePath === path) return;
      closeExportResultDialog();
      setWorking({ text: i18n.t('Opening clip'), quiet: true });
      try {
        await withErrorHandling(async () => {
          try {
            await userOpenSingleFile({ path });
          } catch (err) {
            // Next clip and Up next move past it instead of offering it again.
            if (err instanceof UnsupportedFileError) {
              const info = await lstat(path).catch(() => undefined);
              if (info != null) setUnopenableShelfKeys((keys) => new Set([...keys, shelfThumbnailKey({ path, name: basename(path), modifiedAt: info.mtimeMs, size: info.size })]));
            }
            throw err;
          }
        }, i18n.t('Failed to open file'));
      } finally {
        setWorking(undefined);
      }
    },
    [workingRef, filePath, closeExportResultDialog, setWorking, withErrorHandling, userOpenSingleFile],
  );

  /** Opens a clip from the shelf, or tidies the shelf if it has gone (recycled or moved meanwhile). */
  const openShelfClip = useCallback(async (path: string) => {
    if (!(await mainApi.pathExists(path))) {
      refreshShelf();
      showNotification({ icon: 'info', text: i18n.t('That clip is no longer in its folder.') });
      return;
    }
    await batchOpenSingleFile(path);
  }, [batchOpenSingleFile, refreshShelf, showNotification]);
  useEffect(() => {
    openShelfClipRef.current = (path) => { openShelfClip(path); };
  }, [openShelfClip]);
  const openNextClip = useCallback(() => {
    if (nextClip != null) openShelfClip(nextClip.path);
  }, [nextClip, openShelfClip]);
  const chooseShelfFolder = useCallback(async () => {
    const { canceled, filePaths } = await showOpenDialog({
      properties: ['openDirectory'],
      ...((shelfFolder ?? lastOpenedPathRef.current) != null ? { defaultPath: (shelfFolder ?? lastOpenedPathRef.current)! } : {}),
      title: t('Choose a folder'),
    });
    const [folder] = filePaths;
    if (canceled || folder == null) return;
    setShelfFolder(folder);
  }, [shelfFolder, t]);

  const batchFileJump = useCallback(
    (direction: number, alsoOpen: boolean) => {
      if (batchFiles.length === 0) return;

      let newSelectedBatchFiles: [string];
      if (selectedBatchFiles.length === 0) {
        newSelectedBatchFiles = [batchFiles[0]!.path];
      } else {
        const selectedFilePath = selectedBatchFiles[direction > 0 ? selectedBatchFiles.length - 1 : 0];
        const pathIndex = batchFiles.findIndex(
          ({ path }) => path === selectedFilePath,
        );
        if (pathIndex === -1) return;
        const nextFile = batchFiles[pathIndex + direction];
        if (!nextFile) return;
        newSelectedBatchFiles = [nextFile.path];
      }

      setSelectedBatchFiles(newSelectedBatchFiles);
      if (alsoOpen) batchOpenSingleFile(newSelectedBatchFiles[0]);
    },
    [batchFiles, batchOpenSingleFile, selectedBatchFiles],
  );

  const batchOpenSelectedFile = useCallback(() => {
    const [firstSelectedBatchFile] = selectedBatchFiles;
    if (firstSelectedBatchFile == null) return;
    batchOpenSingleFile(firstSelectedBatchFile);
  }, [batchOpenSingleFile, selectedBatchFiles]);

  const onBatchFileSelect = useCallback(
    (path: string) => {
      if (selectedBatchFiles.includes(path)) batchOpenSingleFile(path);
      else setSelectedBatchFiles([path]);
    },
    [batchOpenSingleFile, selectedBatchFiles],
  );

  const goToTimecode = useCallback(async () => {
    if (!filePath) return;
    // Simple mode writes the time like the clock that opened this (0:12.40) and always reads it that way,
    // whatever the advanced time format is set to. Its typing tips sit behind an "i" rather than on screen.
    const showHours = (fileDuration ?? 0) >= 3600;
    const timecode = await promptTimecode(simpleMode ? {
      initialValue: formatClockTime(commandedTimeRef.current, { decimals: 2, showHours }),
      title: i18n.t('Go to a time'),
      help: i18n.t('Type a time like 1:30, or +5 or -5 to jump from where you are.'),
      allowRelative: true,
      inputPlaceholder: formatClockTime(0, { decimals: 2, showHours }),
      parse: (value) => parseDuration(value),
      invalidMessage: i18n.t("That isn't a time. Try something like 1:30."),
    } : {
      initialValue: formatTimecode({ seconds: commandedTimeRef.current }),
      title: i18n.t('Seek to timecode'),
      description: i18n.t('Use + and - for relative seek'),
      allowRelative: true,
      inputPlaceholder: timecodePlaceholder,
    });

    if (timecode === undefined) return;

    if (timecode.relDirection != null) seekRel(timecode.duration * timecode.relDirection);
    else seekAbs(timecode.duration);
  }, [
    filePath,
    fileDuration,
    simpleMode,
    promptTimecode,
    formatTimecode,
    commandedTimeRef,
    timecodePlaceholder,
    seekRel,
    seekAbs,
  ]);

  const goToTimecodeDirect = useCallback(
    async ({ time: timeStr }: { time: string }) => {
      if (!filePath) return;
      invariant(timeStr != null);
      const timecode = parseTimecode(timeStr);
      invariant(timecode != null);
      seekAbs(timecode);
    },
    [filePath, parseTimecode, seekAbs],
  );

  const toggleStreamsSelector = useCallback(
    () => setStreamsSelectorShown((v) => !v),
    [],
  );

  const handleShowStreamsSelectorClick = useCallback(() => {
    setStreamsSelectorShown(true);
  }, []);

  const extractAllStreams = useCallback(async () => {
    if (!filePath) return;

    if (
      !(await confirmDialog({
        focusConfirm: true,
        description: t(
          'Please confirm that you want to extract all tracks as separate files',
        ),
        confirmButtonText: t('Extract all tracks'),
      }))
    ) return;

    if (workingRef.current) return;
    try {
      setWorking({ text: i18n.t('Extracting all streams') });
      setStreamsSelectorShown(false);
      const [firstExtractedPath] = await extractStreams({
        customOutDir,
        streams: mainCopiedStreams,
      });
      if (!hideAllNotifications && firstExtractedPath != null) {
        showOsNotification(i18n.t('All tracks have been extracted'));
        openExportFinishedDialog({
          filePath: firstExtractedPath,
          children: i18n.t('All streams have been extracted as separate files'),
        });
      }
    } catch (err) {
      showOsNotification(i18n.t('Failed to extract tracks'));

      if (err instanceof RefuseOverwriteError) {
        showRefuseToOverwrite();
      } else {
        errorToast(i18n.t('Failed to extract all streams'));
        console.error('Failed to extract all streams', err);
      }
    } finally {
      setWorking(undefined);
    }
  }, [
    confirmDialog,
    customOutDir,
    extractStreams,
    filePath,
    hideAllNotifications,
    mainCopiedStreams,
    openExportFinishedDialog,
    setWorking,
    showOsNotification,
    t,
    workingRef,
  ]);

  const askStartTimeOffset = useCallback(async () => {
    const newStartTimeOffset = await promptTimecode({
      initialValue:
        startTimeOffset !== undefined
          ? formatTimecode({ seconds: startTimeOffset })
          : undefined,
      title: i18n.t('Set custom start time offset'),
      description: i18n.t(
        'Instead of video apparently starting at 0, you can offset by a specified value. This only applies to the preview inside ClipPress and does not modify the file in any way. (Useful for viewing/cutting videos according to timecodes)',
      ),
      inputPlaceholder: timecodePlaceholder,
      allowRelative: true,
    });

    if (newStartTimeOffset === undefined || newStartTimeOffset.duration < 0) return;

    const duration = newStartTimeOffset.relDirection != null
      ? newStartTimeOffset.duration * newStartTimeOffset.relDirection
      : newStartTimeOffset.duration;
    setStartTimeOffset(duration);
  }, [formatTimecode, promptTimecode, startTimeOffset, timecodePlaceholder]);

  const toggleKeyboardShortcuts = useCallback(
    () => setKeyboardShortcutsVisible((v) => !v),
    [],
  );

  const tryFixInvalidDuration = useCallback(async () => {
    if (!checkFileOpened() || workingRef.current) return;
    try {
      setWorking({ text: i18n.t('Fixing file duration') });
      setProgress(0);
      await withErrorHandling(async () => {
        invariant(fileFormat != null);
        const path = await fixInvalidDuration({
          fileFormat,
          customOutDir,
          onProgress: setProgress,
        });
        showNotification({
          icon: 'info',
          text: i18n.t('Duration has been fixed'),
        });

        await loadMedia({ filePath: path });
      }, i18n.t('Failed to fix file duration'));
    } finally {
      setWorking(undefined);
      setProgress(undefined);
    }
  }, [
    checkFileOpened,
    customOutDir,
    fileFormat,
    fixInvalidDuration,
    loadMedia,
    setWorking,
    showNotification,
    withErrorHandling,
    workingRef,
  ]);

  const addStreamSourceFile = useCallback(
    /** `only`: just the new file's audio (a separate mic or commentary recording) or video tracks kept; else all. */
    async (path: string, only?: 'audio' | 'video') => {
      const added = allFilesMeta[path];
      if (added != null && path === filePath) return undefined;
      if (added != null) {
        // Added before (say, its audio): the tracks asked for now are kept too.
        setCopyStreamIdsForPath(path, (old) => ({ ...old, ...fromPairs(added.streams.flatMap(({ index, codec_type: type }) => (only == null || type === only ? [[index, true]] : []))) }));
        return undefined;
      }
      const fileMeta = await readFileFfprobeMeta(path);
      // console.log('streams', fileMeta.streams);
      setExternalFilesMeta((old) => ({ ...old, [path]: fileMeta }));
      setCopyStreamIdsForPath(path, () => fromPairs(fileMeta.streams.map(({ index, codec_type: type }) => [index, only == null || type === only])));
      return fileMeta;
    },
    [allFilesMeta, filePath, setCopyStreamIdsForPath],
  );

  const updateStreamParams = useCallback<
    Parameters<typeof StreamsSelector>[0]['updateStreamParams']
  >(
    (fileId, streamId, setter) => setParamsByStreamId(
      produce((draft: ParamsByStreamId) => {
        if (!draft.has(fileId)) draft.set(fileId, new Map());
        const fileMap = draft.get(fileId);
        invariant(fileMap != null);
        if (!fileMap.has(streamId)) fileMap.set(streamId, {});

        const params = fileMap.get(streamId);
        invariant(params != null);
        setter(params);
      }),
      // Dragging a gain slider is one undo step.
      { coalesceKey: `stream:${fileId}:${streamId}` },
    ),
    [setParamsByStreamId],
  );

  const updateAudioGainForStream = useCallback(
    (streamId: number, audioGainDb: number) => {
      if (filePath == null) return;

      updateStreamParams(filePath, streamId, (params) => {
        // eslint-disable-next-line no-param-reassign
        params.audioGainDb = audioGainDb === defaultAudioGainDb ? undefined : audioGainDb;
      });
    },
    [filePath, updateStreamParams],
  );

  const captureSnapshotAsCoverArt = useCallback(async () => {
    if (!filePath) return;
    await withErrorHandling(async () => {
      const currentTime = getRelevantTime();
      const path = await captureFrameFromFfmpeg({
        customOutDir,
        filePath,
        time: currentTime,
        captureFormat,
        quality: captureFrameQuality,
      });
      const fileMeta = await addStreamSourceFile(path);
      if (!fileMeta) return;
      const firstIndex = fileMeta.streams[0]!.index;
      updateStreamParams(path, firstIndex, (params) => {
        // eslint-disable-next-line no-param-reassign
        params.disposition = 'attached_pic';
      });
      showNotification({
        text: i18n.t('Current frame has been set as cover art'),
      });
    }, i18n.t('Failed to capture frame'));
  }, [
    addStreamSourceFile,
    captureFormat,
    captureFrameFromFfmpeg,
    captureFrameQuality,
    customOutDir,
    filePath,
    getRelevantTime,
    showNotification,
    updateStreamParams,
    withErrorHandling,
  ]);

  const batchLoadPaths = useCallback((newPaths: string[], append?: boolean) => {
    setBatchFiles((existingFiles) => {
      const mapPathsToFiles = (paths: string[]) => paths.map((path) => ({ path, name: basename(path) }));
      if (append) {
        const newUniquePaths = newPaths.filter(
          (newPath) => !existingFiles.some(
            ({ path: existingPath }) => newPath === existingPath,
          ),
        );
        const [firstNewUniquePath] = newUniquePaths;
        if (firstNewUniquePath == null) return existingFiles;
        setSelectedBatchFiles([firstNewUniquePath]);
        return [...existingFiles, ...mapPathsToFiles(newUniquePaths)];
      }
      const [firstNewPath] = newPaths;
      invariant(firstNewPath != null);
      setSelectedBatchFiles([firstNewPath]);
      return mapPathsToFiles(newPaths);
    });
  }, []);

  const userOpenFiles = useCallback(
    async (newFilePathsIn?: string[]) => {
      await withErrorHandling(async () => {
        let newFilePaths = newFilePathsIn;
        if (!newFilePaths || newFilePaths.length === 0) return;

        // The user has moved on to the next clip, so the previous export's result dialog
        // should not stay parked over the new one. Only that dialog is dismissed; a
        // dialog still waiting for an answer keeps the screen.
        closeExportResultDialog();

        console.log('userOpenFiles');
        console.log(newFilePaths.join('\n'));

        lastOpenedPathRef.current = newFilePaths[0]!;

        let firstNewFilePath = newFilePaths[0]!;

        // Simple mode: a folder goes on the shelf, and its first clip opens.
        if (simpleMode && newFilePaths.length === 1 && (await lstat(firstNewFilePath)).isDirectory()) {
          if (workingRef.current) {
            showNotification({ icon: 'info', text: i18n.t('ClipPress is busy. Open the file again when the current task has finished.') });
            return;
          }
          const folder = firstNewFilePath;
          const queue = buildShelfQueue(await listShelfFolder(folder), { order: shelfOrder, exports: shelfExports, caseInsensitive: isWindows || isMac });
          // All exported: the first one that opens.
          const first = pickNextClip(queue, undefined, isWindows || isMac, unopenableShelfKeys) ?? queue.find((item) => !unopenableShelfKeys.has(shelfThumbnailKey(item.file)))?.file;
          if (first == null) {
            errorToast(i18n.t('No videos in this folder'));
            return;
          }
          setShelfFolder(folder);
          await batchOpenSingleFile(first.path);
          return;
        }

        // first check if it is a single directory, and if so, read it recursively
        if (
          newFilePaths.length === 1
          && (await lstat(firstNewFilePath)).isDirectory()
        ) {
          console.log('Reading directory...');
          invariant(firstNewFilePath != null);
          newFilePaths = await readDirRecursively(firstNewFilePath);
          if (newFilePaths.length === 0) {
            errorToast(i18n.t('No files found in folder'));
            return;
          }
        }

        // Only allow opening regular files
        for (const path of newFilePaths) {
          const fileStat = await lstat(path);

          if (!fileStat.isFile()) {
            errorToast(i18n.t('Cannot open anything else than regular files'));
            console.warn('Not a file:', path);
            return;
          }
        }

        if (newFilePaths.length > 1 && alwaysConcatMultipleFiles) {
          batchLoadPaths(newFilePaths);
          setConcatDialogOpen(true);
          return;
        }

        firstNewFilePath = newFilePaths[0]!;
        invariant(firstNewFilePath != null);

        // https://en.wikibooks.org/wiki/Inside_DVD-Video/Directory_Structure
        if (
          newFilePaths.length === 1
          && /^video_ts$/i.test(basename(firstNewFilePath))
        ) {
          if (mustDisallowVob()) return;
          newFilePaths = await readVideoTs(firstNewFilePath);
        }

        if (workingRef.current) {
          // Say why nothing happened, instead of ignoring the file (#60).
          showNotification({ icon: 'info', text: i18n.t('ClipPress is busy. Open the file again when the current task has finished.') });
          return;
        }
        try {
          setWorking({ text: i18n.t('Opening clip'), quiet: true });

          // If it's a project file (not llc) and we have an already opened file, import segments from the project
          const matchingImportProjectType = getImportProjectType(firstNewFilePath);
          if (matchingImportProjectType) {
            if (!checkFileOpened()) return;
            await loadEdlFile({
              path: firstNewFilePath,
              type: matchingImportProjectType,
              append: true,
            });
            return;
          }

          const filePathLowerCase = firstNewFilePath.toLowerCase();
          const isLlcProject = filePathLowerCase.endsWith('.llc');

          // Need to ask the user what to do if more than one option
          const inputOptions: {
            open?: string;
            project?: string;
            tracks?: string;
            subtitles?: string;
            addToBatch?: string;
            mergeWithCurrentFile?: string;
          } = {};

          if (newFilePaths.length === 1) {
            inputOptions.open = isFileOpened
              ? i18n.t('Open the file instead of the current one')
              : i18n.t('Open the file');
          }

          if (isFileOpened && newFilePaths.length === 1) {
            if (isLlcProject) {
              inputOptions.project = i18n.t(
                'Load segments from the new file, but keep the current media',
              );
            } else if (filePathLowerCase.endsWith('.srt')) {
              inputOptions.subtitles = i18n.t(
                'Convert subtitiles into segments',
              );
            }
            inputOptions.tracks = i18n.t(
              'Include all tracks from the new file',
            );
          }

          if (isFileOpened) {
            inputOptions.mergeWithCurrentFile = i18n.t(
              'Merge/concatenate with current file',
            );
          }
          if (batchFiles.length > 0 || newFilePaths.length > 1) inputOptions.addToBatch = i18n.t('Add the file to the batch list');

          const inputOptionsKeys = Object.keys(inputOptions);

          let openFileResponse: string | undefined;
          if (inputOptionsKeys.length === 1) [openFileResponse] = inputOptionsKeys;
          if (enableAskForFileOpenAction && inputOptionsKeys.length > 1 && simpleMode && inputOptions.open != null) {
            // Open or cancel, the rest under "More options": its audio, its video or both added to this recording, or
            // the other choices in plain words.
            openFileResponse = await askForFileOpenChoice({
              fileName: basename(firstNewFilePath),
              extras: [
                ...(inputOptions.tracks != null ? [
                  { key: 'tracksAudio', label: i18n.t('Its audio'), add: 'audio' as const },
                  { key: 'tracksVideo', label: i18n.t('Its video'), add: 'video' as const },
                  { key: 'tracks', label: i18n.t('Both'), add: 'both' as const },
                ] : []),
                ...(inputOptions.mergeWithCurrentFile != null ? [{ key: 'mergeWithCurrentFile', label: i18n.t('Join it after this recording') }] : []),
                ...(inputOptions.project != null ? [{ key: 'project', label: inputOptions.project }] : []),
                ...(inputOptions.subtitles != null ? [{ key: 'subtitles', label: inputOptions.subtitles }] : []),
                ...(inputOptions.addToBatch != null ? [{ key: 'addToBatch', label: inputOptions.addToBatch }] : []),
              ],
            });
          } else if (enableAskForFileOpenAction && inputOptionsKeys.length > 1) openFileResponse = await askForFileOpenAction(inputOptions);
          else if (newFilePaths.length === 1) openFileResponse = 'open';

          if (openFileResponse === 'open') {
            await userOpenSingleFile({ path: firstNewFilePath, isLlcProject });
            return;
          }
          if (openFileResponse === 'project') {
            await loadEdlFile({ path: firstNewFilePath, type: 'llc' });
            return;
          }
          if (openFileResponse === 'subtitles') {
            await loadEdlFile({ path: firstNewFilePath, type: 'srt' });
            return;
          }
          if (openFileResponse === 'tracks') {
            await addStreamSourceFile(firstNewFilePath);
            setStreamsSelectorShown(true);
            return;
          }
          if (openFileResponse === 'tracksAudio' || openFileResponse === 'tracksVideo') {
            await addStreamSourceFile(firstNewFilePath, openFileResponse === 'tracksAudio' ? 'audio' : 'video');
            setStreamsSelectorShown(true);
            return;
          }
          if (openFileResponse === 'addToBatch') {
            batchLoadPaths(newFilePaths, true);
            return;
          }
          if (openFileResponse === 'mergeWithCurrentFile') {
            const batchPaths = new Set<string>();
            if (filePath) batchPaths.add(filePath);
            newFilePaths.forEach((path) => batchPaths.add(path));
            batchLoadPaths([...batchPaths]);
            if (batchPaths.size > 1) setConcatDialogOpen(true);
          }
          // else: no match means dialog canceled or nothing useful to do:
        } finally {
          setWorking(undefined);
        }
      }, i18n.t('Failed to open file'));
    },
    [
      withErrorHandling,
      alwaysConcatMultipleFiles,
      workingRef,
      batchLoadPaths,
      setWorking,
      isFileOpened,
      batchFiles.length,
      enableAskForFileOpenAction,
      checkFileOpened,
      closeExportResultDialog,
      loadEdlFile,
      userOpenSingleFile,
      addStreamSourceFile,
      filePath,
      showNotification,
      simpleMode,
      shelfOrder,
      shelfExports,
      batchOpenSingleFile,
      unopenableShelfKeys,
    ],
  );

  const openFilesDialog = useCallback(async () => {
    // On Windows and Linux an open dialog can not be both a file selector and a directory selector, so if you set `properties` to `['openFile', 'openDirectory']` on these platforms, a directory selector will be shown. #1995
    const { canceled, filePaths } = await showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      defaultPath: lastOpenedPathRef.current!,
      title: t('Open file'),
    });
    if (canceled) return;
    userOpenFiles(filePaths);
  }, [t, userOpenFiles]);

  const openDirDialog = useCallback(async () => {
    const { canceled, filePaths } = await showOpenDialog({
      properties: ['openDirectory', 'multiSelections'],
      defaultPath: lastOpenedPathRef.current!,
      title: t('Open folder'),
    });
    if (canceled) return;
    userOpenFiles(filePaths);
  }, [t, userOpenFiles]);

  /** Opens a recording from the welcome screen's list. One that was moved or deleted can be found, with its edits (#16). */
  const openRecentFile = useCallback(async (path: string) => {
    if (await mainApi.pathExists(path)) {
      await userOpenFiles([path]);
      return;
    }
    if (workingRef.current) return;
    closeExportResultDialog();
    await withErrorHandling(async () => {
      // Its newest edits that can be read, wherever they are kept.
      const oldPlaceCopies = await findProjectFiles(getProjectLookupPaths(path, projectFileLocation, customOutDir, getProjectStoreEnv()));
      const { opened, unreadable } = await readNewestProjectCopy(oldPlaceCopies, loadLlcProject);
      for (const { path: copy, error } of unreadable) console.warn('Could not read the edits of a missing recording', copy, error);
      const project = opened?.project;
      const relocation = await relocateRecording({ oldMediaPath: path, project, projectPath: opened?.path });
      if (relocation == null || workingRef.current) return;
      // Moved together with edits kept next to it: whichever copy is newest, at the old place or the new, is opened
      // (the others are kept aside as usual), never an older one over a newer.
      const newPlaceCopies = await findProjectFiles(getProjectLookupPaths(relocation.mediaPath, projectFileLocation, customOutDir, getProjectStoreEnv()));
      const projectPath = newPlaceCopies.length > 0
        ? (await readNewestProjectCopy([...oldPlaceCopies, ...newPlaceCopies], loadLlcProject)).opened?.path
        : opened?.path;
      setWorking({ text: i18n.t('Opening clip'), quiet: true });
      try {
        await loadMedia({ filePath: relocation.mediaPath, projectPath, relocatedFrom: relocation.relocatedFrom });
      } finally {
        setWorking(undefined);
      }
    }, i18n.t('Failed to open file'));
  }, [closeExportResultDialog, customOutDir, loadMedia, projectFileLocation, relocateRecording, setWorking, userOpenFiles, withErrorHandling, workingRef]);

  const concatBatch = useCallback(() => {
    if (batchFiles.length < 2) {
      openFilesDialog();
      return;
    }

    setConcatDialogOpen(true);
  }, [batchFiles.length, openFilesDialog]);

  const togglePlaySelectedSegments = useCallback(
    () => togglePlay({
      resetPlaybackRate: true,
      requestPlaybackMode: 'play-selected-segments',
    }),
    [togglePlay],
  );
  const toggleLoopSelectedSegments = useCallback(
    () => togglePlay({
      resetPlaybackRate: true,
      requestPlaybackMode: 'loop-selected-segments',
    }),
    [togglePlay],
  );

  const copySegmentsToClipboard = useCallback(async () => {
    if (!isFileOpened || selectedSegments.length === 0) return;
    electron.clipboard.writeText(formatTsvHuman(selectedSegments));
  }, [isFileOpened, selectedSegments]);

  const showIncludeExternalStreamsDialog = useCallback(async () => {
    await withErrorHandling(async () => {
      const { canceled, filePaths } = await showOpenDialog({
        properties: ['openFile'],
        title: t('Include more tracks from other file'),
      });
      const [firstFilePath] = filePaths;
      if (canceled || firstFilePath == null) return;
      await addStreamSourceFile(firstFilePath);
    }, i18n.t('Failed to include track'));
  }, [addStreamSourceFile, t, withErrorHandling]);

  const toggleFullscreenVideo = useCallback(async () => {
    if (!screenfull.isEnabled) {
      console.warn('Fullscreen not allowed');
      return;
    }
    try {
      if (videoRef.current == null) {
        console.warn('No video tag to full screen');
        return;
      }
      invariant(videoContainerRef.current != null);
      await screenfull.toggle(videoContainerRef.current, {
        navigationUI: 'hide',
      });
    } catch (err) {
      console.error('Failed to toggle fullscreen', err);
    }
  }, [videoContainerRef, videoRef]);

  const onEditSegmentTags = useCallback(
    (index: number) => {
      setEditingSegmentTagsSegmentIndex(index);
      const seg = cutSegments[index];
      invariant(seg != null);
      setEditingSegmentTags(getSegmentTags(seg));
    },
    [cutSegments],
  );

  const editCurrentSegmentTags = useCallback(() => {
    onEditSegmentTags(currentSegIndexSafe);
  }, [currentSegIndexSafe, onEditSegmentTags]);

  const promptDownloadMediaUrlWrapper = useCallback(async () => {
    try {
      setWorking({ text: t('Downloading URL') });
      await withErrorHandling(async () => {
        const newCustomOutDir = await ensureWritableOutDir({
          outDir: customOutDir,
        });
        if (newCustomOutDir == null) {
          errorToast(i18n.t('Please select a working directory first'));
          return;
        }
        const outPath = getDownloadMediaOutPath(
          newCustomOutDir,
          `downloaded-media-${Date.now()}.mkv`,
        );
        const downloaded = await promptDownloadMediaUrl(outPath);
        if (downloaded) await loadMedia({ filePath: outPath });
      }, i18n.t('Failed to download URL'));
    } finally {
      setWorking();
    }
  }, [
    customOutDir,
    ensureWritableOutDir,
    loadMedia,
    setWorking,
    t,
    withErrorHandling,
  ]);

  type MainKeyboardAction = Exclude<KeyboardAction, 'goToTimecodeDirect'>;

  const mainActions = useMemo(() => {
    async function exportYouTube() {
      if (!checkFileOpened()) return;
      await openYouTubeChaptersDialog(formatYouTube(cutSegments));
    }

    function seekRelAccelerated(amount: number) {
      seekRel(seekAccelerationRef.current * amount);
      seekAccelerationRef.current *= keyboardSeekAccFactor;
    }

    const ret: Record<MainKeyboardAction, () => void> = {
      // NOTE: Do not change these keys because users have bound keys by these names in their config files
      // For actions, see also KeyboardShortcuts.jsx
      togglePlayNoResetSpeed: () => togglePlay(),
      togglePlayResetSpeed: () => togglePlay({ resetPlaybackRate: true }),
      togglePlayOnlyCurrentSegment: () => togglePlay({
        resetPlaybackRate: true,
        requestPlaybackMode: 'play-segment-once',
      }),
      toggleLoopOnlyCurrentSegment: () => togglePlay({
        resetPlaybackRate: true,
        requestPlaybackMode: 'loop-segment',
      }),
      toggleLoopStartEndOnlyCurrentSegment: () => togglePlay({
        resetPlaybackRate: true,
        requestPlaybackMode: 'loop-segment-start-end',
      }),
      togglePlaySelectedSegments,
      toggleLoopSelectedSegments,
      play: () => play(),
      pause,
      reducePlaybackRate: () => userChangePlaybackRate(-1),
      reducePlaybackRateMore: () => userChangePlaybackRate(-1, 2),
      increasePlaybackRate: () => userChangePlaybackRate(1),
      increasePlaybackRateMore: () => userChangePlaybackRate(1, 2),
      timelineToggleComfortZoom,
      captureSnapshot,
      captureSnapshotAsCoverArt,
      captureSnapshotToClipboard,
      setCutStart,
      setCutEnd,
      cleanupFilesDialog,
      splitCurrentSegment,
      focusSegmentAtCursor,
      selectSegmentsAtCursor,
      increaseRotation,
      goToTimecode: () => goToTimecode(),
      seekBackwards: () => seekRelAccelerated(-1 * keyboardNormalSeekSpeed),
      seekBackwards2: () => seekRelAccelerated(-1 * keyboardSeekSpeed2),
      seekBackwards3: () => seekRelAccelerated(-1 * keyboardSeekSpeed3),
      seekForwards: () => seekRelAccelerated(keyboardNormalSeekSpeed),
      seekForwards2: () => seekRelAccelerated(keyboardSeekSpeed2),
      seekForwards3: () => seekRelAccelerated(keyboardSeekSpeed3),
      // The simple editor: Ctrl+← / → step one frame (1% of the view only looks like a frame when zoomed in), and
      // Alt+← / → go to the clip edge before or after. Advanced mode keeps LosslessCut's.
      seekBackwardsPercent: () => (simpleMode ? shortStep(-1) : seekRelPercent(-0.01)),
      seekForwardsPercent: () => (simpleMode ? shortStep(1) : seekRelPercent(0.01)),
      seekBackwardsKeyframe: () => (simpleMode ? seekClipEdge(-1) : seekClosestKeyframe(-1)),
      seekForwardsKeyframe: () => (simpleMode ? seekClipEdge(1) : seekClosestKeyframe(1)),
      seekPreviousFrame: () => shortStep(-1),
      seekNextFrame: () => shortStep(1),
      // The simple editor's ↑ / ↓ also show the clip they select, so I and O then act on the clip in view.
      jumpPrevSegment: () => jumpSeg({ rel: -1, ...(simpleMode && { seek: true as const }) }),
      jumpSeekPrevSegment: () => jumpSeg({ rel: -1, seek: true }),
      jumpNextSegment: () => jumpSeg({ rel: 1, ...(simpleMode && { seek: true as const }) }),
      jumpSeekNextSegment: () => jumpSeg({ rel: 1, seek: true }),
      jumpFirstSegment: () => jumpSeg({ abs: 0 }),
      jumpSeekFirstSegment: () => jumpSeg({ abs: 0, seek: true }),
      jumpLastSegment: () => jumpSeg({ abs: cutSegments.length - 1 }),
      jumpSeekLastSegment: () => jumpSeg({ abs: cutSegments.length - 1, seek: true }),
      jumpCutStart,
      jumpCutEnd,
      jumpTimelineStart,
      jumpTimelineEnd,
      timelineZoomIn: () => zoomRel(1),
      timelineZoomOut: () => zoomRel(-1),
      batchPreviousFile: () => batchFileJump(-1, false),
      batchNextFile: () => batchFileJump(1, false),
      batchOpenPreviousFile: () => batchFileJump(-1, true),
      // With no batch list (simple mode never shows one), the shelf's next clip, as the top bar's Next clip.
      batchOpenNextFile: () => (batchFiles.length === 0 && simpleMode ? openNextClip() : batchFileJump(1, true)),
      batchOpenSelectedFile,
      closeBatch,
      removeCurrentSegment: () => removeSegment(currentSegIndexSafe, true),
      removeSelectedClips,
      startOver,
      removeCurrentCutpoint: () => removeSegment(currentSegIndexSafe),
      undo: () => editHistoryOrder.undo(editHistories),
      redo: () => editHistoryOrder.redo(editHistories),
      labelCurrentSegment,
      addSegment,
      duplicateCurrentSegment,
      toggleSegmentSpeedControls,
      addTextOverlay: addTextOverlayNow,
      // The same key finishes, as Done does.
      // Its shortcut closes the crop editor again, like Done (keeping a zoom that's still settling).
      editCurrentSegmentCrop: () => {
        if (editingCropSegmentId == null) editSegmentCrop(currentSegIndexSafe);
        else if (cropFinishRef.current != null) cropFinishRef.current();
        else setEditingCropSegmentId(undefined);
      },
      toggleLastCommands,
      export: () => onExportPress(),
      quickExport: () => quickExport(),
      quickExportPreset1: () => quickExport(0),
      quickExportPreset2: () => quickExport(1),
      quickExportPreset3: () => quickExport(2),
      quickExportPreset4: () => quickExport(3),
      quickExportPreset5: () => quickExport(4),
      quickExportPreset6: () => quickExport(5),
      quickExportPreset7: () => quickExport(6),
      quickExportPreset8: () => quickExport(7),
      quickExportPreset9: () => quickExport(8),
      extractCurrentSegmentFramesAsImages,
      extractSelectedSegmentsFramesAsImages,
      reorderSegsByStartTime,
      invertAllSegments,
      fillSegmentsGaps,
      combineOverlappingSegments,
      combineSelectedSegments,
      createFixedDurationSegments,
      createNumSegments,
      createFixedByteSizedSegments,
      createRandomSegments,
      alignSegmentTimesToKeyframes,
      shuffleSegments,
      clearSegments,
      toggleSegmentsList,
      toggleStreamsSelector,
      extractAllStreams,
      convertFormatCurrentFile: () => userHtml5ifyCurrentFile(),
      convertFormatBatch,
      concatBatch,
      toggleKeyframeCutMode: () => toggleKeyframeCut(true),
      toggleCaptureFormat,
      toggleStripAudio,
      toggleStripVideo,
      toggleStripSubtitle,
      toggleStripThumbnail,
      toggleStripCurrentFilter: () => applyEnabledStreamsFilter(),
      toggleStripAll,
      toggleDarkMode,
      setStartTimeOffset: askStartTimeOffset,
      deselectAllSegments,
      selectAllSegments,
      selectOnlyCurrentSegment,
      editCurrentSegmentTags,
      toggleCurrentSegmentSelected,
      invertSelectedSegments,
      removeSelectedSegments,
      fixInvalidDuration: tryFixInvalidDuration,
      shiftAllSegmentTimes,
      increaseVolume: () => setPlaybackVolume((val) => Math.min(1, val + 0.07)),
      decreaseVolume: () => setPlaybackVolume((val) => Math.max(0, val - 0.07)),
      makeCursorTimeZero: () => setStartTimeOffset(-commandedTimeRef.current),
      toggleMuted,
      copySegmentsToClipboard,
      reloadFile: () => setCacheBuster((v) => v + 1),
      quit: () => mainApi.quitApp(),
      closeCurrentFile: () => {
        closeFileWithConfirm();
      },
      exportYouTube,
      showStreamsSelector: handleShowStreamsSelectorClick,
      html5ify: () => userHtml5ifyCurrentFile({ ignoreRememberedValue: true }),
      openFilesDialog,
      openDirDialog,
      toggleSettings,
      openSendReportDialog: () => {
        openSendReportDialogWithState();
      },
      detectBlackScenes,
      detectSilentScenes,
      detectSceneChanges,
      readAllKeyframes,
      createSegmentsFromKeyframes,
      toggleWaveformMode,
      toggleShowThumbnails,
      toggleShowKeyframes,
      showIncludeExternalStreamsDialog,
      toggleFullscreenVideo,
      selectAllMarkers,
      selectSegmentsByLabel,
      selectSegmentsByExpr,
      labelSelectedSegments,
      mutateSegmentsByExpr,

      // also called from menu (note: no longer a toggle. Esc must be used to close it because it's a dialog now):
      toggleKeyboardShortcuts,
      generateOverviewWaveform,
    };

    return ret;
  }, [
    editingCropSegmentId,
    removeSelectedClips,
    startOver,
    batchFiles.length,
    openNextClip,
    simpleMode,
    editHistories,
    editHistoryOrder,
    togglePlaySelectedSegments,
    toggleLoopSelectedSegments,
    pause,
    timelineToggleComfortZoom,
    captureSnapshot,
    captureSnapshotAsCoverArt,
    captureSnapshotToClipboard,
    setCutStart,
    setCutEnd,
    cleanupFilesDialog,
    splitCurrentSegment,
    focusSegmentAtCursor,
    selectSegmentsAtCursor,
    increaseRotation,
    jumpCutStart,
    jumpCutEnd,
    jumpTimelineStart,
    jumpTimelineEnd,
    batchOpenSelectedFile,
    closeBatch,
    addSegment,
    duplicateCurrentSegment,
    toggleLastCommands,
    toggleSegmentSpeedControls,
    addTextOverlayNow,
    editSegmentCrop,
    extractCurrentSegmentFramesAsImages,
    extractSelectedSegmentsFramesAsImages,
    reorderSegsByStartTime,
    invertAllSegments,
    fillSegmentsGaps,
    combineOverlappingSegments,
    combineSelectedSegments,
    createFixedDurationSegments,
    createNumSegments,
    createFixedByteSizedSegments,
    createRandomSegments,
    alignSegmentTimesToKeyframes,
    shuffleSegments,
    clearSegments,
    toggleSegmentsList,
    toggleStreamsSelector,
    extractAllStreams,
    convertFormatBatch,
    concatBatch,
    toggleCaptureFormat,
    toggleStripAudio,
    toggleStripVideo,
    toggleStripSubtitle,
    toggleStripThumbnail,
    toggleStripAll,
    toggleDarkMode,
    askStartTimeOffset,
    deselectAllSegments,
    selectAllSegments,
    selectOnlyCurrentSegment,
    editCurrentSegmentTags,
    toggleCurrentSegmentSelected,
    invertSelectedSegments,
    removeSelectedSegments,
    tryFixInvalidDuration,
    shiftAllSegmentTimes,
    toggleMuted,
    copySegmentsToClipboard,
    handleShowStreamsSelectorClick,
    openFilesDialog,
    openDirDialog,
    toggleSettings,
    detectBlackScenes,
    detectSilentScenes,
    detectSceneChanges,
    readAllKeyframes,
    createSegmentsFromKeyframes,
    toggleWaveformMode,
    toggleShowThumbnails,
    toggleShowKeyframes,
    showIncludeExternalStreamsDialog,
    toggleFullscreenVideo,
    selectAllMarkers,
    selectSegmentsByLabel,
    selectSegmentsByExpr,
    labelSelectedSegments,
    mutateSegmentsByExpr,
    toggleKeyboardShortcuts,
    generateOverviewWaveform,
    checkFileOpened,
    cutSegments,
    seekRel,
    keyboardSeekAccFactor,
    togglePlay,
    play,
    userChangePlaybackRate,
    goToTimecode,
    keyboardNormalSeekSpeed,
    keyboardSeekSpeed2,
    keyboardSeekSpeed3,
    seekRelPercent,
    seekClosestKeyframe,
    seekClipEdge,
    shortStep,
    jumpSeg,
    zoomRel,
    batchFileJump,
    removeSegment,
    currentSegIndexSafe,
    labelCurrentSegment,
    onExportPress,
    quickExport,
    userHtml5ifyCurrentFile,
    toggleKeyframeCut,
    applyEnabledStreamsFilter,
    setPlaybackVolume,
    commandedTimeRef,
    closeFileWithConfirm,
    openSendReportDialogWithState,
  ]);

  const getKeyboardAction = useCallback(
    (action: MainKeyboardAction) => mainActions[action],
    [mainActions],
  );

  const keyUpActions = useMemo(() => {
    function seekReset() {
      seekAccelerationRef.current = 1;
    }
    return {
      seekBackwards: () => seekReset(),
      seekBackwards2: () => seekReset(),
      seekBackwards3: () => seekReset(),
      seekForwards: () => seekReset(),
      seekForwards2: () => seekReset(),
      seekForwards3: () => seekReset(),
    };
  }, []);

  const { keyboardLayoutMap, updateKeyboardLayout } = useKeyboard({
    keyBindings,
    keyUpActions,
    getKeyboardAction,
    closeExportConfirm,
    exportConfirmOpen,
  });

  useEffect(() => {
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    document.ondragover = dragPreventer;
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    document.ondragend = dragPreventer;

    electron.ipcRenderer.send('renderer-ready');
  }, []);

  useEffect(() => {
    electron.ipcRenderer.send(
      'setAskBeforeClose',
      askBeforeClose && isFileOpened,
    );
  }, [askBeforeClose, isFileOpened]);

  const extractSingleStream = useCallback(
    async (index: number) => {
      if (!filePath) return;

      if (workingRef.current) return;
      try {
        setWorking({ text: i18n.t('Extracting track') });
        // setStreamsSelectorShown(false);
        const [firstExtractedPath] = await extractStreams({
          customOutDir,
          streams: mainStreams.filter((s) => s.index === index),
        });
        if (!hideAllNotifications && firstExtractedPath != null) {
          showOsNotification(i18n.t('Track has been extracted'));
          openExportFinishedDialog({
            filePath: firstExtractedPath,
            children: i18n.t('Track has been extracted'),
          });
        }
      } catch (err) {
        showOsNotification(i18n.t('Failed to extract track'));

        if (err instanceof RefuseOverwriteError) {
          showRefuseToOverwrite();
        } else {
          errorToast(i18n.t('Failed to extract track'));
          console.error('Failed to extract track', err);
        }
      } finally {
        setWorking(undefined);
      }
    },
    [
      customOutDir,
      extractStreams,
      filePath,
      hideAllNotifications,
      mainStreams,
      openExportFinishedDialog,
      setWorking,
      showOsNotification,
      workingRef,
    ],
  );

  const batchFilePaths = useMemo(
    () => batchFiles.map((f) => f.path),
    [batchFiles],
  );

  const onVideoError = useCallback(async () => {
    const error = videoRef.current?.error;
    if (!error) return;
    if (!fileUri) return; // Probably MEDIA_ELEMENT_ERROR: Empty src attribute

    console.error('onVideoError', error.message, error.code);

    try {
      const PIPELINE_ERROR_READ = 2; // e.g. file has been moved after opening https://github.com/mifi/lossless-cut/issues/2423
      const PIPELINE_ERROR_DECODE = 3; // This usually happens when the user presses play or seeks, but the video is not actually playable. To reproduce: "RX100VII PCM audio timecode.MP4" or see https://github.com/mifi/lossless-cut/issues/804
      const MEDIA_ERR_SRC_NOT_SUPPORTED = 4; // Test: issue-668-3.20.1.m2ts - NOTE: DEMUXER_ERROR_COULD_NOT_OPEN and DEMUXER_ERROR_NO_SUPPORTED_STREAMS is also 4

      if (
        (// MEDIA_ERR_SRC_NOT_SUPPORTED generally means we need to convert to supported format,
          (error.code === MEDIA_ERR_SRC_NOT_SUPPORTED
          // _however_ this error can also happen half way into playback if the file has some corruption
          // but in that case we also get: "DEMUXER_ERROR_COULD_NOT_PARSE: FFmpegDemuxer: PTS is not defined 4"
          // and we don't want to auto convert in that case:
          && !error.message?.startsWith('DEMUXER_ERROR_COULD_NOT_PARSE'))
          || error.code === PIPELINE_ERROR_DECODE)
        && !usingPreviewFile // if we are already using preview file, we shouldn't try to do it again
        && filePath
        && !(
          error.code === MEDIA_ERR_SRC_NOT_SUPPORTED
          && error.message?.startsWith('DEMUXER_ERROR_COULD_NOT_PARSE')
        )
      ) {
        if (workingRef.current) return;
        try {
          setWorking({ text: i18n.t('Converting to supported format') });

          console.log('Trying to convert to supported format');

          // A valid duration is needed to create a html5ified dummy (`fastest`).
          if (
            !isDurationValid(parseFfprobeDuration(mainFileFormat?.duration))
          ) {
            throw new UserFacingError(i18n.t('Invalid duration'));
          }

          if (hasVideo || hasAudio) {
            await html5ifyAndLoadWithPreferences(
              customOutDir,
              filePath,
              'fastest',
              hasVideo,
              hasAudio,
            );
            showNotNativelySupportedMessage();
          }
        } catch (err) {
          if (err instanceof UserFacingError) {
            throw err;
          }
          console.error(err);
          showPlaybackFailedMessage();
        } finally {
          setWorking(undefined);
        }
      } else if (error.code === PIPELINE_ERROR_READ) {
        // file is not readable or was removed
        getSwal().toast.fire({
          icon: 'error',
          timer: 10000,
          text: i18n.t('Failed to read file. Perhaps it has been moved?'),
        });
      }
    } catch (err) {
      toastError(err);
    }
  }, [
    videoRef,
    fileUri,
    usingPreviewFile,
    filePath,
    workingRef,
    setWorking,
    mainFileFormat?.duration,
    hasVideo,
    hasAudio,
    html5ifyAndLoadWithPreferences,
    customOutDir,
    showNotNativelySupportedMessage,
  ]);

  const onVideoFocus = useCallback<FocusEventHandler<HTMLVideoElement>>((e) => {
    // prevent video element from stealing focus in fullscreen mode https://github.com/mifi/lossless-cut/issues/543#issuecomment-1868167775
    e.target.blur();
  }, []);

  // A click on the picture lets go of a selected text there, as on a design tool's canvas, instead of playing.
  const onVideoClick = useCallback(() => {
    const time = getRelevantTime();
    if (selectedOverlayId != null && overlayClips.some((overlayClip) => overlayClip.overlayId === selectedOverlayId && isOverlayActiveAtTime(overlayClip, time))) {
      setSelectedOverlayId(undefined);
      return;
    }
    togglePlay();
  }, [getRelevantTime, overlayClips, selectedOverlayId, togglePlay]);

  const tryExportEdlFile = useCallback(
    async (type: EdlExportType) => {
      if (!checkFileOpened() || selectedSegments.length === 0) return;
      await withErrorHandling(async () => {
        await exportEdlFile({
          type,
          cutSegments: selectedSegments,
          customOutDir,
          filePath,
          getFrameCount,
          customTagsByFile,
          paramsByStreamId,
          overlayClips,
        });
      }, i18n.t('Failed to export project'));
    },
    [
      checkFileOpened,
      customOutDir,
      customTagsByFile,
      filePath,
      getFrameCount,
      overlayClips,
      paramsByStreamId,
      selectedSegments,
      withErrorHandling,
    ],
  );

  const importEdlFile = useCallback(
    async (type: EdlImportType) => {
      if (!checkFileOpened()) return;

      await withErrorHandling(async () => {
        const edl = await askForEdlImport({
          type,
          fps: detectedFps,
          fileDuration,
        });
        if (edl.length > 0) {
          loadCutSegments({
            segments: edl,
            append: true,
            clampDuration: fileDuration,
          });
        }
      }, i18n.t('Failed to import project file'));
    },
    [
      checkFileOpened,
      detectedFps,
      fileDuration,
      loadCutSegments,
      withErrorHandling,
    ],
  );

  useEffect(() => {
    const openFiles = async (filePaths: string[]) => userOpenFiles(filePaths.map((p) => resolvePathIfNeeded(p)));

    async function actionWithCatch(fn: () => Promise<void>) {
      try {
        await fn();
      } catch (err) {
        handleError({ err });
      }
    }

    const allActions = [
      // actions with arguments:
      [
        'openFiles',
        async (...argsRaw: unknown[]) => {
          await openFiles(...openFilesActionArgsSchema.parse(argsRaw));
        },
      ] as const,
      [
        'goToTimecodeDirect',
        async (...argsRaw: unknown[]) => {
          await goToTimecodeDirect(
            ...goToTimecodeDirectArgsSchema.parse(argsRaw),
          );
        },
      ] as const,
      ...Object.entries({
        // todo separate actions per type and move them into mainActions? https://github.com/mifi/lossless-cut/issues/254#issuecomment-932649424
        importEdlFile,
        exportEdlFile: tryExportEdlFile,
        promptDownloadMediaUrl: promptDownloadMediaUrlWrapper,
      }).map(
        ([key, fn]) => [
          key,
          async (...args: unknown[]) => {
            await (fn as (...args2: unknown[]) => Promise<void>)(...args);
          },
        ] as const,
      ),
      // all main actions (no arguments):
      ...Object.entries(mainActions).map(
        ([key, fn]) => [
          key,
          async () => {
            fn();
          },
        ] as const,
      ),
    ];

    const allActionsMap = Object.fromEntries(allActions);

    const actionsWithCatch = allActions.map(
      ([key, fn]) => [
        key,
        (...args: Parameters<typeof fn>) => actionWithCatch(() => fn(...args)),
      ] as const,
    );

    async function tryApiAction(
      event: IpcRendererEvent,
      { id, action, args }: ApiActionRequest,
    ) {
      console.log('API action:', action, args);
      try {
        const fn = allActionsMap[action];
        if (!fn) throw new Error(`Action not found: ${action}`);
        // todo validate arguments
        await (args != null ? fn(...args) : fn());
      } catch (err) {
        console.error(err);
      } finally {
        // todo correlation ids
        event.sender.send('apiActionResponse', { id });
      }
    }

    const ipcActions = actionsWithCatch.map(
      ([key, fn]) => [
        key,
        (_event: IpcRendererEvent, ...args: Parameters<typeof fn>) => actionWithCatch(() => fn(...args)),
      ] as const,
    );

    ipcActions.forEach(([key, action]) => electron.ipcRenderer.on(key, action));
    electron.ipcRenderer.on('apiAction', tryApiAction);

    return () => {
      ipcActions.forEach(([key, action]) => electron.ipcRenderer.off(key, action));
      electron.ipcRenderer.off('apiAction', tryApiAction);
    };
  }, [
    checkFileOpened,
    customOutDir,
    detectedFps,
    filePath,
    getFrameCount,
    getKeyboardAction,
    goToTimecodeDirect,
    handleError,
    importEdlFile,
    loadCutSegments,
    mainActions,
    promptDownloadMediaUrlWrapper,
    selectedSegments,
    toggleKeyboardShortcuts,
    tryExportEdlFile,
    userOpenFiles,
  ]);

  // Edit > Undo/Redo (see menu.ts): typing in a focused text field, otherwise the editor's changes.
  useEffect(() => {
    function onEditMenuUndoRedo(_event: IpcRendererEvent, command: 'undo' | 'redo') {
      const focused = document.activeElement;
      const isTextField = (focused instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(focused.type))
        || focused instanceof HTMLTextAreaElement
        || (focused instanceof HTMLElement && focused.isContentEditable);
      if (isTextField) document.execCommand(command);
      else if (command === 'undo') editHistoryOrder.undo(editHistories);
      else editHistoryOrder.redo(editHistories);
    }
    electron.ipcRenderer.on('editMenuUndoRedo', onEditMenuUndoRedo);
    return () => { electron.ipcRenderer.off('editMenuUndoRedo', onEditMenuUndoRedo); };
  }, [editHistories, editHistoryOrder]);

  const handleBatchFilesDrop = useCallback<DragEventHandler<HTMLDivElement>>(
    async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!ev.dataTransfer) return;
      await withErrorHandling(async () => {
        const filePaths = [...ev.dataTransfer.files].map((f) => electron.webUtils.getPathForFile(f));
        await mainApi.focusWindow();
        batchLoadPaths(filePaths, true);
      });
    },
    [batchLoadPaths, withErrorHandling],
  );

  const handleStreamSourceFileDrop = useCallback<
    DragEventHandler<HTMLDivElement>
  >(
    async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!ev.dataTransfer) return;
      await withErrorHandling(async () => {
        const filePaths = [...ev.dataTransfer.files].map((f) => electron.webUtils.getPathForFile(f));
        if (filePaths.length !== 1) return;
        await mainApi.focusWindow();
        addStreamSourceFile(filePaths[0]!);
      });
    },
    [addStreamSourceFile, withErrorHandling],
  );

  useEffect(() => {
    async function onDrop(ev: DragEvent) {
      ev.preventDefault();
      if (!ev.dataTransfer || isSelfFileDrag()) return;
      const filePaths = [...ev.dataTransfer.files]
        .map((f) => electron.webUtils.getPathForFile(f))
        .filter(Boolean);
      if (filePaths.length === 0) return;
      await mainApi.focusWindow();
      userOpenFiles(filePaths);
    }
    const element = appDropRef.current;
    element?.addEventListener('drop', onDrop);
    return () => element?.removeEventListener('drop', onDrop);
  }, [userOpenFiles]);

  // Show where a dragged file will go: the overlay while a clip is open, the welcome screen's drop card otherwise.
  useEffect(() => {
    const element = appDropRef.current;
    if (element == null) return undefined;
    // `dragover` keeps firing while a file hovers the window; when it stops (left the window, Esc, dropped),
    // the overlay goes away even if no `dragleave` arrives.
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(hideTimeout);
      setFileDragActive(false);
    };
    const onDragOver = (ev: DragEvent) => {
      if (!ev.dataTransfer?.types.includes('Files') || isSelfFileDrag()) return;
      setFileDragActive(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(end, 350);
    };
    const onDragLeave = (ev: DragEvent) => {
      // relatedTarget is null when the pointer leaves the window.
      if (ev.relatedTarget == null) end();
    };
    element.addEventListener('dragenter', onDragOver);
    element.addEventListener('dragover', onDragOver);
    element.addEventListener('dragleave', onDragLeave);
    element.addEventListener('drop', end, true);
    return () => {
      clearTimeout(hideTimeout);
      element.removeEventListener('dragenter', onDragOver);
      element.removeEventListener('dragover', onDragOver);
      element.removeEventListener('dragleave', onDragLeave);
      element.removeEventListener('drop', end, true);
    };
  }, []);

  useEffect(() => {
    function onDrop(ev: DragEvent) {
      // default drop handler to prevent new electron window from popping up https://github.com/electron/electron/issues/39839
      ev.preventDefault();
    }
    document.body.addEventListener('drop', onDrop);
    return () => document.body.removeEventListener('drop', onDrop);
  }, []);

  const renderOutFmt = useCallback(
    (style: CSSProperties) => (
      <OutputFormatSelect
        style={style}
        detectedFileFormat={detectedFileFormat}
        fileFormat={fileFormat}
        onOutputFormatUserChange={onOutputFormatUserChange}
      />
    ),
    [detectedFileFormat, fileFormat, onOutputFormatUserChange],
  );

  // Which encoders work is checked in the background once a clip has opened, so an export doesn't wait for it:
  // after its filmstrip and waveform, while the video is paused (or at most 30 s on); advanced mode's lanes aren't
  // tracked, so a while after.
  useEffect(() => {
    if (filePath == null) return undefined;
    const timer = setTimeout(prefetchEncoderCapabilities, openWorkPending || playing ? 30_000 : (simpleMode ? 1500 : 8000));
    return () => clearTimeout(timer);
  }, [filePath, openWorkPending, playing, simpleMode]);
  const openWorkPendingRef = useRef(openWorkPending);
  useEffect(() => {
    openWorkPendingRef.current = openWorkPending;
  }, [openWorkPending]);

  // FFmpeg's self-check starts two processes; at launch it waits a moment, and for the first file to open (its
  // filmstrip and waveform, at most 30 s), so it doesn't compete with that (a broken FFmpeg shows up then anyway).
  // A changed FFmpeg path is checked at once.
  const startupCheckedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      startupCheckedRef.current = true;
      const info = await runStartupCheck({
        onError: ({ title, message }) => setGenericError({ title, err: message }),
      });
      if (!cancelled) setFfmpegInfo(info);
    };
    const delay = startupCheckedRef.current ? 0 : 3000;
    const waitUntil = Date.now() + 30_000;
    let timer = setTimeout(function run() {
      // At launch, a recording that's opening goes first.
      if (!startupCheckedRef.current && openWorkPendingRef.current && Date.now() < waitUntil) {
        timer = setTimeout(run, 500);
        return;
      }
      check();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customFfPath, setGenericError]);

  const appContext = useMemo<AppContextType>(
    () => ({
      working,
      setWorking,
      handleError,
      showGenericDialog,
      confirmDialog,
      keyboardLayoutMap,
      updateKeyboardLayout,
    }),
    [
      confirmDialog,
      handleError,
      keyboardLayoutMap,
      setWorking,
      showGenericDialog,
      updateKeyboardLayout,
      working,
    ],
  );

  const showLeftBar = batchFiles.length > 0;

  // Stable props for memoised children: a new object or arrow each render would re-render them every time
  // anything in the editor changes.
  const shelfProps = useMemo(() => ({
    folder: shelfFolder,
    queue: shelf.queue,
    currentPath: filePath,
    nextPath: nextClip?.path,
    caseInsensitive: isWindows || isMac,
    order: shelfOrder,
    onOrderChange: setShelfOrder,
    onOpen: openShelfClip,
    onChooseFolder: chooseShelfFolder,
    thumbnails: shelf.thumbnails,
    requestThumbnail: shelf.requestThumbnail,
  }), [chooseShelfFolder, filePath, nextClip?.path, openShelfClip, setShelfOrder, shelf.queue, shelf.requestThumbnail, shelf.thumbnails, shelfFolder, shelfOrder]);
  const audioHeader = useMemo(() => (
    <AudioTrackHeader
      previewVolume={playbackVolume}
      onPreviewVolumeChange={setPlaybackVolume}
      onTogglePreviewMuted={toggleMuted}
      gainControls={previewAudioGainControls}
      onGainChange={updateAudioGainForStream}
    />
  ), [playbackVolume, previewAudioGainControls, setPlaybackVolume, toggleMuted, updateAudioGainForStream]);
  const editCurrentSegmentCrop = useCallback(() => editSegmentCrop(currentSegIndexSafe), [currentSegIndexSafe, editSegmentCrop]);
  const closeConcatDialog = useCallback(() => setConcatDialogOpen(false), []);
  const closeKeyboardShortcuts = useCallback(() => {
    setKeyboardShortcutsVisible(false);
    setKeyboardShortcutsView(undefined);
  }, [setKeyboardShortcutsVisible]);

  function renderSubtitles() {
    if (!activeSubtitle) return null;
    return (
      <track
        default
        kind="subtitles"
        label={activeSubtitle.lang}
        srcLang="en"
        src={activeSubtitle.url}
      />
    );
  }

  // throw new Error('Test error boundary');

  const baseColorStyle = useMemo(
    () => ({
      color: 'var(--gray-12)',
      background: 'var(--gray-1)',
      colorScheme: darkMode ? 'only dark' : 'only light',
    }),
    [darkMode],
  );

  const rootClass = useMemo(
    () => [
      ...(darkMode ? ['dark-theme'] : []),
      ...(prefersReducedMotion ? ['no-animations'] : []),
    ].join(' '),
    [darkMode, prefersReducedMotion],
  );

  const rootStyle = useMemo<CSSProperties>(
    () => ({
      ...baseColorStyle,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      transition: darkModeTransition,
      background: 'var(--cp-app-bg)',
    }),
    [baseColorStyle],
  );

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <AppContext.Provider value={appContext}>
        <SegColorsContext.Provider value={segColorsContext}>
          <UserSettingsContext.Provider value={userSettingsContext}>
            <div ref={appDropRef} className={rootClass} style={rootStyle} id="app-root">
              <AppChrome keyBindingByAction={keyBindingByAction} />

              {isFileOpened && (
                <TopMenu
                  filePath={filePath}
                  currentClipName={currentClipName}
                  onCurrentClipNameChange={setCurrentClipName}
                  toggleSettings={toggleSettings}
                  numStreamsToCopy={numStreamsToCopy}
                  numStreamsTotal={numStreamsTotal}
                  setStreamsSelectorShown={setStreamsSelectorShown}
                  onOpenFiles={openFilesDialog}
                  onShelfShown={refreshShelf}
                  shelf={shelfProps}
                  nextClipName={simpleMode ? nextClip?.name : undefined}
                  onOpenNextClip={openNextClip}
                  nextClipKeys={keyBindingByAction['batchOpenNextFile']?.keys}
                  exportKeys={keyBindingByAction['export']?.keys}
                  onExportPress={onExportPress}
                  onQuickExportPress={quickExport}
                  segmentsToExport={segmentsToExport}
                />
              )}

              <div className={styles['mainArea']}>
                {!showRightBar && clipsPanelGone && isFileOpened && filePath != null && (
                  <ClipsPanelTab label={simpleMode ? t('Show clips') : t('Show sidebar')} keys={keyBindingByAction['toggleSegmentsList']?.keys} onClick={toggleSegmentsList} />
                )}
                <AnimatePresence>
                  {showLeftBar && isFileOpened && (
                    <BatchFilesList
                      selectedBatchFiles={selectedBatchFiles}
                      filePath={filePath}
                      width={leftBarWidth}
                      batchFiles={batchFiles}
                      setBatchFiles={setBatchFiles}
                      onBatchFileSelect={onBatchFileSelect}
                      batchListRemoveFile={batchListRemoveFile}
                      closeBatch={closeBatch}
                      onMergeFilesClick={concatBatch}
                      onBatchConvertToSupportedFormatClick={convertFormatBatch}
                      onDrop={handleBatchFilesDrop}
                    />
                  )}
                </AnimatePresence>

                <div className={styles['workspaceColumn']}>
                  {!isFileOpened ? (
                    <div className={styles['emptyStateShell']}>
                      <NoFileLoaded
                        onClick={openFilesDialog}
                        onOpenFolderClick={openDirDialog}
                        keyBindingByAction={keyBindingByAction}
                        dragging={fileDragActive && !working}
                        showSteps={recentFiles.length === 0 && nextClip == null}
                      >
                        {nextClip != null && (
                          <ShelfUpNext
                            file={nextClip}
                            thumbnail={shelf.thumbnails.get(shelfThumbnailKey(nextClip))}
                            requestThumbnail={shelf.requestThumbnail}
                            onOpen={openShelfClip}
                          />
                        )}
                        <RecentFiles
                          files={recentFiles}
                          customOutDir={customOutDir}
                          onOpen={openRecentFile}
                          onRemove={(path) => setRecentFiles((list) => removeRecentFile(list, path, isWindows || isMac))}
                          onClear={() => setRecentFiles([])}
                        />
                      </NoFileLoaded>
                    </div>
                  ) : (
                    <>
                      <div
                        className={styles['previewCard']}
                        ref={videoContainerRef}
                      >
                        <div
                          className="no-user-select"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            visibility:
                              !hasVideo || bigWaveformEnabled
                                ? 'hidden'
                                : undefined,
                          }}
                          onWheel={onTimelineWheel}
                        >
                          <SegmentCropPreview
                            videoWidth={activeVideoStream?.width ?? 1920}
                            videoHeight={activeVideoStream?.height ?? 1080}
                            rotation={effectiveRotation}
                            crop={previewCrop}
                            editing={editingCropSegment != null && !bigWaveformEnabled}
                            clipLabel={editingCropSegment != null ? (editingCropSegment.name || t('Clip {{number}}', { number: currentSegIndexSafe + 1 })) : undefined}
                            onChange={changeSegmentCrop}
                            onDone={() => setEditingCropSegmentId(undefined)}
                            doneKeys={keyBindingByAction['editCurrentSegmentCrop']?.keys}
                            finishRef={cropFinishRef}
                            frameContent={editingCropSegment != null && activeVideoStream?.width != null && activeVideoStream.height != null && (
                              // The export crops first and then draws the texts, so while cropping they sit in the frame.
                              <TextOverlayEditor
                                readOnly
                                overlayClips={overlayClips}
                                selectedOverlayId={undefined}
                                relevantTime={relevantTime}
                                videoWidth={activeVideoStream.width}
                                videoHeight={activeVideoStream.height}
                                rotation={effectiveRotation}
                              />
                            )}
                          >
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video
                              className={styles['video']}
                              tabIndex={-1}
                              muted={playbackVolume === 0 || compatPlayerEnabled}
                              ref={videoRef}
                              style={videoStyle}
                              src={fileUri}
                              onPlay={onStartPlaying}
                              onPause={onStopPlaying}
                              onAbort={() => { setVideoBusy(false); onVideoAbort(); }}
                              onDurationChange={onDurationChange}
                              onLoadedMetadata={() => setSegmentPreviewSpeed(previewSegmentSpeed)}
                              onTimeUpdate={onTimeUpdate}
                              onError={() => { setVideoBusy(false); onVideoError(); }}
                              onClick={onVideoClick}
                              onDoubleClick={toggleFullscreenVideo}
                              onFocusCapture={onVideoFocus}
                              onSeeked={onSeeked}
                              onLoadStart={() => {
                                setVideoBusy(true);
                                // A new load, even of the same recording: its first frame is waited for again.
                                onVideoLoaded(undefined);
                              }}
                              onWaiting={() => setVideoBusy(true)}
                              onLoadedData={() => {
                                setVideoBusy(false);
                                onVideoLoaded(filePath);
                                if (playOnOpen && filePath != null && autoPlayedPathRef.current !== filePath) {
                                  autoPlayedPathRef.current = filePath;
                                  play();
                                }
                                // For measuring how fast a file opens (read by tests; costs nothing).
                                performance.mark('clippress:video-loaded');
                              }}
                              onCanPlay={() => setVideoBusy(false)}
                              onPlaying={() => setVideoBusy(false)}
                              onEmptied={() => setVideoBusy(false)}
                            >
                              {renderSubtitles()}
                            </video>

                            <PreviewSpinner busy={videoBusy && fileUri != null && !compatPlayerEnabled} />

                            {filePath != null && compatPlayerEnabled && (
                            <MediaSourcePlayer
                              rotate={effectiveRotation}
                              filePath={filePath}
                              videoStream={activeVideoStream}
                              audioStreams={activeAudioStreams}
                              audioGainByStreamId={activeAudioGainByStreamId}
                              clipVolumes={previewClipVolumes}
                              masterVideoRef={videoRef}
                              mediaSourceQuality={mediaSourceQuality}
                              ffmpegHwaccel={ffmpegHwaccel}
                              onFailedChange={setCompatPlayerFailed}
                            />
                            )}
                          </SegmentCropPreview>
                          {activeVideoStream?.width != null
                        && activeVideoStream.height != null && editingCropSegment == null && (
                          <TextOverlayEditor
                            overlayClips={overlayClips}
                            selectedOverlayId={selectedOverlayId}
                            relevantTime={relevantTime}
                            videoWidth={activeVideoStream.width}
                            videoHeight={activeVideoStream.height}
                            rotation={effectiveRotation}
                            keysBlocked={exportConfirmOpen || streamsSelectorShown || settingsVisible || keyboardShortcutsVisible}
                            onSelectOverlay={setSelectedOverlayId}
                            onUpdateOverlay={updateOverlayClip}
                          />
                          )}
                        </div>

                        {bigWaveformEnabled && (
                        <BigWaveform
                          waveforms={waveforms}
                          relevantTime={relevantTime}
                          playing={playing}
                          fileDurationNonZero={fileDurationNonZero}
                          zoom={zoomUnrounded}
                          seekRel={seekRel}
                          darkMode={darkMode}
                        />
                        )}

                        {compatPlayerEnabled && compatPlayerFailed && (
                          <PreviewFailedCard hint={compatPlayerFailedCard.hint} action={compatPlayerFailedCard.action} />
                        )}

                        {compatPlayerEnabled && (
                        <div className={styles['previewNotice']}>
                          {isRotationSet ? (
                            <>
                              <MdRotate90DegreesCcw size={22} />
                              {t('Rotation preview')}
                            </>
                          ) : (
                            // The simple editor calls it what the "Make this recording playable" choice does.
                            simpleMode ? t('Instant preview') : t('FFmpeg-assisted playback')
                          )}

                          <div
                            style={{
                              cursor: 'pointer',
                              pointerEvents: 'initial',
                              padding: '.1em .25em',
                            }}
                            role="button"
                            onClick={() => incrementMediaSourceQuality()}
                            title={t('Select playback quality')}
                          >
                            {mediaSourceQualities[mediaSourceQuality]}
                          </div>

                          {!compatPlayerRequired && (
                          <FaRegTimesCircle
                            role="button"
                            style={{
                              cursor: 'pointer',
                              pointerEvents: 'initial',
                              verticalAlign: 'middle',
                            }}
                            onClick={handleHideCompatPlayerClick}
                          />
                          )}
                        </div>
                        )}

                        <div
                          className="no-user-select"
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            marginBottom: 10,
                            display: 'flex',
                            alignItems: 'flex-end',
                          }}
                        >
                          {/* The simple editor's sound controls are on its audio track; a recording without one has none. */}
                          {!simpleMode && (
                          <VolumeControl
                            playbackVolume={playbackVolume}
                            setPlaybackVolume={setPlaybackVolume}
                            onToggleMutedClick={toggleMuted}
                            audioGainControls={previewAudioGainControls}
                            onAudioGainChange={updateAudioGainForStream}
                          />
                          )}

                          {!simpleMode && shouldShowPlaybackStreamSelector && (
                          <PlaybackStreamSelector
                            subtitleStreams={subtitleStreams}
                            videoStreams={videoStreams}
                            audioStreams={audioStreams}
                            activeSubtitleStreamIndex={
                            activeSubtitleStreamIndex
                          }
                            activeVideoStreamIndex={activeVideoStreamIndex}
                            activeAudioStreamIndexes={activeAudioStreamIndexes}
                            onActiveSubtitleChange={onActiveSubtitleChange}
                            onActiveVideoStreamChange={
                            onActiveVideoStreamChange
                          }
                            onActiveAudioStreamsChange={
                            onActiveAudioStreamsChange
                          }
                          />
                          )}
                        </div>
                      </div>

                      <div
                        className={`no-user-select ${styles['editorCard']}`}
                        style={bottomStyle}
                      >
                        <BottomBar
                          zoom={zoom}
                          setZoom={zoomAbs}
                          timelineToggleComfortZoom={timelineToggleComfortZoom}
                          hasVideo={hasVideo}
                          isRotationSet={isRotationSet}
                          rotation={rotation}
                          increaseRotation={increaseRotation}
                          cleanupFilesDialog={cleanupFilesDialog}
                          captureSnapshot={captureSnapshot}
                          seekAbs={seekAbs}
                          currentSegIndexSafe={currentSegIndexSafe}
                          cutSegments={cutSegments}
                          currentCutSeg={currentCutSeg}
                          selectedSegments={selectedSegments}
                          setCutStart={setCutStart}
                          setCutEnd={setCutEnd}
                          setCurrentSegIndex={setCurrentSegIndex}
                          jumpCutEnd={jumpCutEnd}
                          jumpCutStart={jumpCutStart}
                          jumpTimelineStart={jumpTimelineStart}
                          jumpTimelineEnd={jumpTimelineEnd}
                          startTimeOffset={startTimeOffset}
                          setCutTime={setCutTime}
                          playing={playing}
                          shortStep={shortStep}
                          seekClosestKeyframe={seekClosestKeyframe}
                          togglePlay={togglePlay}
                          showThumbnails={showThumbnails}
                          toggleShowThumbnails={toggleShowThumbnails}
                          toggleWaveformMode={toggleWaveformMode}
                          waveformMode={waveformMode}
                          hasAudio={hasAudio}
                          keyframesEnabled={keyframesEnabled}
                          toggleShowKeyframes={toggleShowKeyframes}
                          detectedFps={detectedFps}
                          toggleLoopSelectedSegments={toggleLoopSelectedSegments}
                          isFileOpened={isFileOpened}
                          darkMode={darkMode}
                          outputPlaybackRate={outputPlaybackRate}
                          setOutputPlaybackRate={setOutputPlaybackRate}
                          formatTimecode={formatTimecode}
                          parseTimecode={parseTimecode}
                          playbackRate={playbackRate}
                          currentFrame={currentFrame}
                          playbackMode={playbackMode}
                          onAddTextOverlay={addTextOverlayNow}
                          onEditSegmentCrop={editCurrentSegmentCrop}
                          canEditSegmentCrop={!invertCutSegments && currentCutSeg?.end != null}
                          onSplitClip={splitCurrentSegment}
                          canSplitClip={canSplitAtPlayhead}
                          relevantTime={relevantTime}
                          fileDuration={fileDuration}
                          goToTimecode={goToTimecode}
                          formatTimeAndFrames={formatTimeAndFrames}
                          keyBindingByAction={keyBindingByAction}
                        />

                        <Timeline
                          edgeSnapCue={edgeSnapCue}
                          shouldShowKeyframes={shouldShowKeyframes}
                          waveforms={waveforms}
                          overviewWaveform={overviewWaveform}
                          shouldShowWaveform={shouldShowWaveform}
                          waveformEnabled={waveformEnabled}
                          waveformHeight={waveformHeight}
                          showThumbnails={showThumbnails}
                          neighbouringKeyFrames={neighbouringKeyFrames}
                          thumbnails={thumbnailsSorted}
                          filmstrip={filmstrip}
                          audioPeaks={audioPeaks}
                          audioTrackGainDb={audioTrackGainDb}
                          showAudioLane={showAudioLane}
                          onEditClipVolume={hasAudio && !invertCutSegments ? editClipVolume : undefined}
                          audioHeader={audioHeader}
                          getCurrentTime={getRelevantTime}
                          onScrubbingChange={onTimelineScrubbingChange}
                          commandedTime={commandedTime}
                          relevantTime={relevantTime}
                          commandedTimeRef={commandedTimeRef}
                          startTimeOffset={startTimeOffset}
                          zoom={zoom}
                          seekAbs={seekAbs}
                          fileDurationNonZero={timelineDuration}
                          cutSegments={cutSegments}
                          setCurrentSegIndex={onClipClick}
                          currentSegIndexSafe={currentSegIndexSafe}
                          currentCutSeg={currentCutSeg}
                          inverseCutSegments={inverseCutSegments}
                          formatTimecode={formatTimecode}
                          formatTimeAndFrames={formatTimeAndFrames}
                          zoomWindowStartTime={zoomWindowStartTime}
                          zoomWindowEndTime={zoomWindowEndTime}
                          onZoomWindowStartTimeChange={setZoomWindowStartTime}
                          onGenerateOverviewWaveformClick={generateOverviewWaveform}
                          playing={playing}
                          isFileOpened={isFileOpened}
                          onWheel={onTimelineWheel}
                          goToTimecode={goToTimecode}
                          darkMode={darkMode}
                          setCutTime={setCutTime}
                          setCutStart={setCutStart}
                          setCutEnd={setCutEnd}
                          overlayClips={overlayClips}
                          selectedOverlayId={selectedOverlayId}
                          onSelectOverlay={setSelectedOverlayId}
                          onUpdateOverlayClip={updateOverlayClip}
                          onDeleteOverlayClip={removeOverlayClip}
                          speedControlsSegmentIds={speedControlsSegmentIds}
                          onChangeSegmentSpeed={changeSegmentSpeed}
                          onEditSegmentSpeed={editSegmentSpeed}
                          onEditSegmentCrop={editSegmentCrop}
                          onToggleSegmentSpeedControls={toggleSpeedControlsForSegment}
                          onRemoveSegmentSpeed={removeSegmentSpeed}
                          onRemoveSegment={removeSegment}
                          removeSegmentKeys={keyBindingByAction['removeSelectedClips']?.keys}
                          menuKeys={timelineMenuKeys}
                          pickedClipIds={pickedClips}
                          hasVideo={hasVideo}
                        />
                      </div>
                    </>
                  )}
                </div>

                <AnimatePresence custom={clipsPanelAnimated} onExitComplete={() => setClipsPanelGone(true)}>
                  {showRightBar && isFileOpened && filePath != null && (
                    <SegmentList
                      animated={clipsPanelAnimated}
                      width={rightBarWidth}
                      currentSegIndex={currentSegIndexSafe}
                      cutSegments={cutSegments}
                      inverseCutSegments={inverseCutSegments}
                      getFrameCount={getFrameCount}
                      formatTimecode={formatTimecode}
                      onSegClick={onClipClick}
                      updateSegOrder={updateSegOrder}
                      updateSegOrders={updateSegOrders}
                      onLabelSegment={labelSegment}
                      currentCutSeg={currentCutSeg}
                      firstSegmentAtCursor={firstSegmentAtCursor}
                      addSegment={addSegment}
                      onDuplicateSegmentClick={duplicateSegment}
                      removeSegment={removeSegment}
                      onRemoveSelected={removeSelectedSegments}
                      toggleSegmentsList={toggleSegmentsList}
                      togglePanelKeys={keyBindingByAction['toggleSegmentsList']?.keys}
                      onRemovePicked={removeSelectedClips}
                      menuKeys={clipMenuKeys}
                      splitCurrentSegment={splitCurrentSegment}
                      selectedSegments={segmentsOrInverse.selected}
                      fileDuration={fileDuration}
                      onSelectSingleSegment={selectOnlySegment}
                      onToggleSegmentSelected={toggleSegmentSelected}
                      onDeselectAllSegments={deselectAllSegments}
                      onSelectAllSegments={selectAllSegments}
                      onInvertSelectedSegments={invertSelectedSegments}
                      onExtractSegmentsFramesAsImages={
                        extractSegmentsFramesAsImages
                      }
                      onExtractSelectedSegmentsFramesAsImages={
                        extractSelectedSegmentsFramesAsImages
                      }
                      jumpSegStart={jumpSegStart}
                      jumpSegEnd={jumpSegEnd}
                      onSelectSegmentsByLabel={selectSegmentsByLabel}
                      onSelectSegmentsByExpr={selectSegmentsByExpr}
                      onSelectAllMarkers={selectAllMarkers}
                      onMutateSegmentsByExpr={mutateSegmentsByExpr}
                      onLabelSelectedSegments={labelSelectedSegments}
                      updateSegAtIndex={updateSegAtIndex}
                      maxLabelLength={maxLabelLength}
                      editingSegmentTags={editingSegmentTags}
                      editingSegmentTagsSegmentIndex={
                        editingSegmentTagsSegmentIndex
                      }
                      setEditingSegmentTags={setEditingSegmentTags}
                      setEditingSegmentTagsSegmentIndex={
                        setEditingSegmentTagsSegmentIndex
                      }
                      onEditSegmentTags={onEditSegmentTags}
                      getSegEstimatedSize={getSegEstimatedSize}
                      onEditSpeed={editSegmentSpeed}
                      onEditCrop={editSegmentCrop}
                      renamingSegId={renamingSegId}
                      setRenamingSegId={setRenamingSegId}
                      pickedClipIds={pickedClips}
                      onPickClipsInBox={onPickClipsInBox}
                      onStartOver={startOver}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Dialogs */}

              {/* Outside the preview: portal events still bubble through React parents, e.g. a wheel to the crop editor. */}
              {clipVolumeEditor != null && clipVolumeEditorSegment != null && (
                <ClipVolumePopover
                  anchor={clipVolumeEditor.anchor}
                  clipLabel={clipVolumeEditorSegment.name || t('Clip {{number}}', { number: clipVolumeEditorIndex + 1 })}
                  audioGainDb={clipVolumeEditorSegment.audioGainDb}
                  audioMuted={clipVolumeEditorSegment.audioMuted === true}
                  trackGainDb={sharedTrackGainDb}
                  onChange={onClipVolumeChange}
                  onClose={closeClipVolumeEditor}
                />
              )}

              <ExportConfirm
                areWeCutting={areWeCutting}
                segmentsOrInverse={segmentsOrInverse}
                segmentsToExport={segmentsToExport}
                willMerge={willMerge}
                visible={exportConfirmOpen}
                onClosePress={closeExportConfirm}
                onExportConfirm={onExportConfirm}
                renderOutFmt={renderOutFmt}
                outputDir={outputDir}
                numStreamsTotal={numStreamsTotal}
                numStreamsToCopy={numStreamsToCopy}
                onShowStreamsSelectorClick={handleShowStreamsSelectorClick}
                outFormat={fileFormat}
                cutFileTemplate={cutFileTemplate}
                cutMergedFileTemplate={cutMergedFileTemplate}
                generateCutFileNames={
                  isSizeLimitedExport
                    ? generateSizeLimitedCustomCutFileNames
                    : generateCutFileNames
                }
                generateCutMergedFileNames={
                  isSizeLimitedExport
                    ? generateSizeLimitedCustomCutMergedFileNames
                    : generateCutMergedFileNames
                }
                generateAutoCutFileNames={
                  isSizeLimitedExport
                    ? generateSizeLimitedAutoCutFileNames
                    : undefined
                }
                generateAutoCutMergedFileNames={
                  isSizeLimitedExport
                    ? generateSizeLimitedAutoCutMergedFileNames
                    : undefined
                }
                currentSegIndexSafe={currentSegIndexSafe}
                mainCopiedThumbnailStreams={mainCopiedThumbnailStreams}
                needSmartCut={needSmartCut}
                isEncoding={isEncodingUi}
                encBitrate={encBitrate}
                setEncBitrate={setEncBitrate}
                toggleSettings={toggleSettings}
                outputPlaybackRate={outputPlaybackRate}
                lossyMode={lossyMode}
                neighbouringKeyFrames={neighbouringKeyFrames}
                findNearestKeyFrameTime={findNearestKeyFrameTime}
                sizeLimitedSourceVideoStream={sizeLimitedStreams.videoStream}
                sizeLimitedSourceFps={sizeLimitedSourceFps}
                sizeLimitedSourceRotation={effectiveRotation}
                sizeLimitedHasAudio={sizeLimitedStreams.audioStream != null}
                hasOverlayClips={hasOverlayClips}
              />

              <Dialog.Root
                open={streamsSelectorShown}
                onOpenChange={setStreamsSelectorShown}
              >
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content style={{ width: simpleMode ? '34em' : '80em' }}>
                    <Dialog.Title>{t('Tracks')}</Dialog.Title>
                    <Dialog.Description>
                      {simpleMode
                        ? t('Choose which video and audio tracks to keep.')
                        : t(
                          'Click to select which tracks to keep when exporting:',
                        )}
                    </Dialog.Description>

                    {mainStreams && filePath != null && (
                      <StreamsSelector
                        mainFilePath={filePath}
                        mainFileFormat={mainFileFormat}
                        mainFileChapters={mainFileChapters}
                        allFilesMeta={allFilesMeta}
                        externalFilesMeta={externalFilesMeta}
                        setExternalFilesMeta={setExternalFilesMeta}
                        showAddStreamSourceDialog={
                          showIncludeExternalStreamsDialog
                        }
                        mainFileStreams={mainStreams}
                        isCopyingStreamId={isCopyingStreamId}
                        toggleCopyStreamId={toggleCopyStreamId}
                        setCopyStreamIdsForPath={setCopyStreamIdsForPath}
                        onExtractAllStreamsPress={extractAllStreams}
                        onExtractStreamPress={extractSingleStream}
                        shortestFlag={shortestFlag}
                        setShortestFlag={setShortestFlag}
                        nonCopiedExtraStreams={nonCopiedExtraStreams}
                        customTagsByFile={customTagsByFile}
                        setCustomTagsByFile={setCustomTagsByFile}
                        paramsByStreamId={paramsByStreamId}
                        updateStreamParams={updateStreamParams}
                        formatTimecode={formatTimecode}
                        loadSubtitleTrackToSegments={
                          loadSubtitleTrackToSegments
                        }
                        toggleCopyStreamIds={toggleCopyStreamIds}
                        changeEnabledStreamsFilter={changeEnabledStreamsFilter}
                        toggleCopyAllStreamsForPath={
                          toggleCopyAllStreamsForPath
                        }
                        onStreamSourceFileDrop={handleStreamSourceFileDrop}
                        simpleMode={simpleMode}
                      />
                    )}

                    <Dialog.CloseButton />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              <LastCommands
                visible={lastCommandsVisible}
                onTogglePress={toggleLastCommands}
                ffmpegCommandLog={ffmpegCommandLog}
                setFfmpegCommandLog={setFfmpegCommandLog}
              />

              <Dialog.Root open={settingsVisible} onOpenChange={toggleSettings}>
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content
                    aria-describedby={undefined}
                    // Focus the dialog itself, not the first tab, so opening Settings doesn't draw a focus ring on "General".
                    onOpenAutoFocus={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
                    }}
                    style={{
                      width: 'min(52rem, 92vw)',
                      height: 'min(38rem, 86vh)',
                      padding: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div className={styles['settingsDialogHeader']}>
                      <Dialog.Title style={{ margin: 0 }}>{t('Settings')}</Dialog.Title>
                    </div>

                    <div className={styles['settingsDialogBody']}>
                      <Settings
                        category={settingsCategory}
                        setCategory={setSettingsCategory}
                        onKeyboardShortcutsDialogRequested={() => {
                          // From Settings: every action, the advanced ones too.
                          setKeyboardShortcutsView('all');
                          toggleKeyboardShortcuts();
                        }}
                        askForCleanupChoices={changeCleanupChoices}
                        onProjectFileLocationChange={changeProjectFileLocation}
                        showAdvancedSettings={showAdvancedSettings}
                        setShowAdvancedSettings={setShowAdvancedSettings}
                      />
                    </div>
                    <Dialog.CloseButton />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              <ConcatDialog
                isShown={batchFiles.length > 0 && concatDialogOpen}
                onHide={closeConcatDialog}
                paths={batchFilePaths}
                mergedFileTemplate={mergedFileTemplateOrDefault}
                generateMergedFileNames={generateMergedFileNames}
                onConcat={userConcatFiles}
                setAlwaysConcatMultipleFiles={setAlwaysConcatMultipleFiles}
                alwaysConcatMultipleFiles={alwaysConcatMultipleFiles}
                fileFormat={fileFormat}
                setFileFormat={setFileFormat}
                detectedFileFormat={detectedFileFormat}
                setDetectedFileFormat={setDetectedFileFormat}
                onOutputFormatUserChange={onOutputFormatUserChange}
              />

              {/* Loaded the first time it's opened, not at every start */}
              {keyboardShortcutsVisible && (
                <Suspense fallback={null}>
                  <KeyboardShortcuts
                    isShown={keyboardShortcutsVisible}
                    onHide={closeKeyboardShortcuts}
                    keyBindings={keyBindings}
                    setKeyBindings={setKeyBindings}
                    currentCutSeg={currentCutSeg}
                    resetKeyBindings={resetKeyBindings}
                    getKeyboardAction={getKeyboardAction}
                    initialView={keyboardShortcutsView}
                    onChangeShortcutsRequested={() => {
                      closeKeyboardShortcuts();
                      setSettingsCategory('shortcuts');
                      setSettingsVisible(true);
                    }}
                  />
                </Suspense>
              )}

              {isFileOpened && fileDragActive && !working && (
                <div className={styles['dropOverlay']} aria-hidden>
                  <div className={styles['dropOverlayCard']}>
                    <FiDownload />
                    {t('Drop to open')}
                  </div>
                </div>
              )}

              {/* This should probably be last, so that it's always on top */}
              <AnimatePresence>
                {working && (
                  <Working
                    text={working.text}
                    detailText={working.detailText}
                    phase={working.phase}
                    quiet={working.quiet}
                    progress={progress}
                    onAbortClick={abortWorking}
                  />
                )}
              </AnimatePresence>

              <GenericDialog
                dialog={genericDialog}
                onOpenChange={(open) => !open && closeGenericDialog()}
              />

              {editingSpeedSegment != null && (
                <SegmentSpeedDialog
                  key={editingSpeedSegment.segId}
                  segment={editingSpeedSegment}
                  fileDuration={fileDuration}
                  formatTimecode={formatTimecode}
                  onApply={(speed) => {
                    changeSegmentSpeed(editingSpeedSegment.segId, speed);
                    setEditingSpeedSegmentId(undefined);
                  }}
                  onClose={() => setEditingSpeedSegmentId(undefined)}
                />
              )}

              <WhatsNew />
              <UpdateNotice visible={!settingsVisible} overClipsPanel={showRightBar && isFileOpened && filePath != null} />

              <ErrorDialog
                error={genericError}
                onOpenChange={(open) => !open && setGenericError(undefined)}
              />
            </div>

            <SwalContainer darkMode={darkMode} style={baseColorStyle} />
            <TooltipLayer />
            <MenuHost />
          </UserSettingsContext.Provider>
        </SegColorsContext.Provider>
      </AppContext.Provider>
    </MotionConfig>
  );
}

export default memo(App);
