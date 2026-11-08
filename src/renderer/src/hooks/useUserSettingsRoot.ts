import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import i18n from 'i18next';
import type { Transition } from 'motion/react';

import type { Config } from '../../../common/types.js';
import getEffectiveSimpleMode from '../../../common/interfaceMode.js';

import { errorToast } from '../swal';
import isDev from '../isDev';
import mainApi from '../mainApi';
import { mySpring, emitter as animationsEmitter } from '../animations';

const { configStore } = window.require('@electron/remote').require('./index.js');

export default function useUserSettingsRoot() {
  const firstUpdateRef = useRef(true);
  const [initialSettings] = useState<Config>(() => JSON.parse(configStore.getSnapshotJson()));

  function safeSetConfig<T extends keyof Config>(keyValue: Record<T, Config[T]>) {
    const entry = Object.entries(keyValue)[0]!;
    const key = entry[0] as T;
    const value = entry[1] as Config[T];

    // Prevent flood-saving all config during mount
    if (firstUpdateRef.current) return;

    if (isDev) console.log('save', key, value);
    // Without waiting: a synchronous write held up the page for as long as the settings file took to write.
    mainApi.setConfig(key, value).catch((err: unknown) => {
      console.error('Failed to set config', key, err);
      errorToast(i18n.t('Unable to save your preferences. Try to disable any anti-virus'));
    });
  }

  function safeGetConfig<T extends keyof Config>(key: T) {
    return initialSettings[key];
  }

  // From https://reactjs.org/docs/hooks-reference.html#lazy-initial-state
  // If the initial state is the result of an expensive computation, you may provide a function instead, which will be executed only on the initial render
  // Without this there was a huge performance issue https://github.com/mifi/lossless-cut/issues/1097
  const safeGetConfigInitial = <T extends keyof Config>(key: T) => () => safeGetConfig(key);

  const [lastAppVersion, setLastAppVersion] = useState(safeGetConfigInitial('lastAppVersion'));
  useEffect(() => safeSetConfig({ lastAppVersion }), [lastAppVersion]);
  const [captureFormat, setCaptureFormat] = useState(safeGetConfigInitial('captureFormat'));
  useEffect(() => safeSetConfig({ captureFormat }), [captureFormat]);
  const [recentCustomOutDirs, setRecentCustomOutDirs] = useState(safeGetConfigInitial('recentCustomOutDirs'));
  useEffect(() => safeSetConfig({ recentCustomOutDirs }), [recentCustomOutDirs]);
  const [recentFiles, setRecentFiles] = useState(safeGetConfigInitial('recentFiles'));
  useEffect(() => safeSetConfig({ recentFiles }), [recentFiles]);
  const [shelfOrder, setShelfOrder] = useState(safeGetConfigInitial('shelfOrder'));
  useEffect(() => safeSetConfig({ shelfOrder }), [shelfOrder]);
  const [shelfExports, setShelfExports] = useState(safeGetConfigInitial('shelfExports'));
  useEffect(() => safeSetConfig({ shelfExports }), [shelfExports]);
  const [enableCustomOutDir, setEnableCustomOutDir] = useState(safeGetConfigInitial('enableCustomOutDir'));
  useEffect(() => safeSetConfig({ enableCustomOutDir }), [enableCustomOutDir]);
  const [keyframeCut, setKeyframeCut] = useState(safeGetConfigInitial('keyframeCut'));
  useEffect(() => safeSetConfig({ keyframeCut }), [keyframeCut]);
  const [preserveMetadata, setPreserveMetadata] = useState(safeGetConfigInitial('preserveMetadata'));
  useEffect(() => safeSetConfig({ preserveMetadata }), [preserveMetadata]);
  const [preserveMetadataOnMerge, setPreserveMetadataOnMerge] = useState(safeGetConfigInitial('preserveMetadataOnMerge'));
  useEffect(() => safeSetConfig({ preserveMetadataOnMerge }), [preserveMetadataOnMerge]);
  const [preserveMovData, setPreserveMovData] = useState(safeGetConfigInitial('preserveMovData'));
  useEffect(() => safeSetConfig({ preserveMovData }), [preserveMovData]);
  const [preserveChapters, setPreserveChapters] = useState(safeGetConfigInitial('preserveChapters'));
  useEffect(() => safeSetConfig({ preserveChapters }), [preserveChapters]);
  const [movFastStart, setMovFastStart] = useState(safeGetConfigInitial('movFastStart'));
  useEffect(() => safeSetConfig({ movFastStart }), [movFastStart]);
  const [avoidNegativeTs, setAvoidNegativeTs] = useState(safeGetConfigInitial('avoidNegativeTs'));
  useEffect(() => safeSetConfig({ avoidNegativeTs }), [avoidNegativeTs]);
  const [autoMerge, setAutoMerge] = useState(safeGetConfigInitial('autoMerge'));
  useEffect(() => safeSetConfig({ autoMerge }), [autoMerge]);
  const [timecodeFormat, setTimecodeFormat] = useState(safeGetConfigInitial('timecodeFormat'));
  useEffect(() => safeSetConfig({ timecodeFormat }), [timecodeFormat]);
  const [invertCutSegments, setInvertCutSegments] = useState(safeGetConfigInitial('invertCutSegments'));
  useEffect(() => safeSetConfig({ invertCutSegments }), [invertCutSegments]);
  const [autoExportExtraStreams, setAutoExportExtraStreams] = useState(safeGetConfigInitial('autoExportExtraStreams'));
  useEffect(() => safeSetConfig({ autoExportExtraStreams }), [autoExportExtraStreams]);
  const [askBeforeClose, setAskBeforeClose] = useState(safeGetConfigInitial('askBeforeClose'));
  useEffect(() => safeSetConfig({ askBeforeClose }), [askBeforeClose]);
  const [enableImportChapters, setEnableImportChapters] = useState(safeGetConfigInitial('enableImportChapters'));
  useEffect(() => safeSetConfig({ enableImportChapters }), [enableImportChapters]);
  const [enableAskForFileOpenAction, setEnableAskForFileOpenAction] = useState(safeGetConfigInitial('enableAskForFileOpenAction'));
  useEffect(() => safeSetConfig({ enableAskForFileOpenAction }), [enableAskForFileOpenAction]);
  const [playbackVolume, setPlaybackVolume] = useState(safeGetConfigInitial('playbackVolume'));
  // Saved once it stops changing: a save rewrites the whole settings file in a synchronous call (~30 ms), and the
  // volume changes many times a second while a key is held or the slider dragged.
  const savedPlaybackVolumeRef = useRef(playbackVolume);
  useEffect(() => {
    if (playbackVolume === savedPlaybackVolumeRef.current) return undefined;
    const timer = setTimeout(() => {
      savedPlaybackVolumeRef.current = playbackVolume;
      safeSetConfig({ playbackVolume });
    }, 400);
    return () => clearTimeout(timer);
  }, [playbackVolume]);
  const [autoSaveProjectFile, setAutoSaveProjectFile] = useState(safeGetConfigInitial('autoSaveProjectFile'));
  useEffect(() => safeSetConfig({ autoSaveProjectFile }), [autoSaveProjectFile]);
  const [wheelSensitivity, setWheelSensitivity] = useState(safeGetConfigInitial('wheelSensitivity'));
  useEffect(() => safeSetConfig({ wheelSensitivity }), [wheelSensitivity]);
  const [waveformHeight, setWaveformHeight] = useState(safeGetConfigInitial('waveformHeight'));
  useEffect(() => safeSetConfig({ waveformHeight }), [waveformHeight]);
  const [invertTimelineScroll, setInvertTimelineScroll] = useState(safeGetConfigInitial('invertTimelineScroll'));
  useEffect(() => safeSetConfig({ invertTimelineScroll }), [invertTimelineScroll]);
  const [language, setLanguage] = useState(safeGetConfigInitial('language'));
  useEffect(() => safeSetConfig({ language }), [language]);
  const [ffmpegExperimental, setFfmpegExperimental] = useState(safeGetConfigInitial('ffmpegExperimental'));
  useEffect(() => safeSetConfig({ ffmpegExperimental }), [ffmpegExperimental]);
  const [hideNotifications, setHideNotifications] = useState(safeGetConfigInitial('hideNotifications'));
  useEffect(() => safeSetConfig({ hideNotifications }), [hideNotifications]);
  const [hideOsNotifications, setHideOsNotifications] = useState(safeGetConfigInitial('hideOsNotifications'));
  useEffect(() => safeSetConfig({ hideOsNotifications }), [hideOsNotifications]);
  const [autoLoadTimecode, setAutoLoadTimecode] = useState(safeGetConfigInitial('autoLoadTimecode'));
  useEffect(() => safeSetConfig({ autoLoadTimecode }), [autoLoadTimecode]);
  const [autoDeleteMergedSegments, setAutoDeleteMergedSegments] = useState(safeGetConfigInitial('autoDeleteMergedSegments'));
  useEffect(() => safeSetConfig({ autoDeleteMergedSegments }), [autoDeleteMergedSegments]);
  const [exportConfirmEnabled, setExportConfirmEnabled] = useState(safeGetConfigInitial('exportConfirmEnabled'));
  useEffect(() => safeSetConfig({ exportConfirmEnabled }), [exportConfirmEnabled]);
  const [trashSourceAfterExport, setTrashSourceAfterExport] = useState(safeGetConfigInitial('trashSourceAfterExport'));
  useEffect(() => safeSetConfig({ trashSourceAfterExport }), [trashSourceAfterExport]);
  const [trashProjectWithSource, setTrashProjectWithSource] = useState(safeGetConfigInitial('trashProjectWithSource'));
  useEffect(() => safeSetConfig({ trashProjectWithSource }), [trashProjectWithSource]);
  const [copyAfterExport, setCopyAfterExport] = useState(safeGetConfigInitial('copyAfterExport'));
  useEffect(() => safeSetConfig({ copyAfterExport }), [copyAfterExport]);
  const [playOnOpen, setPlayOnOpen] = useState(safeGetConfigInitial('playOnOpen'));
  useEffect(() => safeSetConfig({ playOnOpen }), [playOnOpen]);
  const [segmentsToChapters, setSegmentsToChapters] = useState(safeGetConfigInitial('segmentsToChapters'));
  useEffect(() => safeSetConfig({ segmentsToChapters }), [segmentsToChapters]);
  const [savedSimpleMode, setSimpleMode] = useState(safeGetConfigInitial('simpleMode'));
  useEffect(() => safeSetConfig({ simpleMode: savedSimpleMode }), [savedSimpleMode]);
  const [enableAdvancedMode, setEnableAdvancedMode] = useState(safeGetConfigInitial('enableAdvancedMode'));
  useEffect(() => safeSetConfig({ enableAdvancedMode }), [enableAdvancedMode]);
  // The mode the app runs in. Kept apart from the saved one, so turning advanced mode off and on again restores it.
  const simpleMode = getEffectiveSimpleMode({ enableAdvancedMode, simpleMode: savedSimpleMode });
  const [cutFileTemplate, setCutFileTemplate] = useState(safeGetConfigInitial('outSegTemplate'));
  useEffect(() => safeSetConfig({ outSegTemplate: cutFileTemplate }), [cutFileTemplate]);
  const [cutMergedFileTemplate, setCutMergedFileTemplate] = useState(safeGetConfigInitial('mergedFileTemplate'));
  useEffect(() => safeSetConfig({ mergedFileTemplate: cutMergedFileTemplate }), [cutMergedFileTemplate]);
  const [mergedFileTemplate, setMergedFileTemplate] = useState(safeGetConfigInitial('mergedFilesTemplate'));
  useEffect(() => safeSetConfig({ mergedFilesTemplate: mergedFileTemplate }), [mergedFileTemplate]);
  const [keyboardSeekAccFactor, setKeyboardSeekAccFactor] = useState(safeGetConfigInitial('keyboardSeekAccFactor'));
  useEffect(() => safeSetConfig({ keyboardSeekAccFactor }), [keyboardSeekAccFactor]);
  const [keyboardNormalSeekSpeed, setKeyboardNormalSeekSpeed] = useState(safeGetConfigInitial('keyboardNormalSeekSpeed'));
  useEffect(() => safeSetConfig({ keyboardNormalSeekSpeed }), [keyboardNormalSeekSpeed]);
  const [keyboardSeekSpeed2, setKeyboardSeekSpeed2] = useState(safeGetConfigInitial('keyboardSeekSpeed2'));
  useEffect(() => safeSetConfig({ keyboardSeekSpeed2 }), [keyboardSeekSpeed2]);
  const [keyboardSeekSpeed3, setKeyboardSeekSpeed3] = useState(safeGetConfigInitial('keyboardSeekSpeed3'));
  useEffect(() => safeSetConfig({ keyboardSeekSpeed3 }), [keyboardSeekSpeed3]);

  const [treatInputFileModifiedTimeAsStart, setTreatInputFileModifiedTimeAsStart] = useState(safeGetConfigInitial('treatInputFileModifiedTimeAsStart'));
  useEffect(() => safeSetConfig({ treatInputFileModifiedTimeAsStart }), [treatInputFileModifiedTimeAsStart]);
  const [treatOutputFileModifiedTimeAsStart, setTreatOutputFileModifiedTimeAsStart] = useState(safeGetConfigInitial('treatOutputFileModifiedTimeAsStart'));
  useEffect(() => safeSetConfig({ treatOutputFileModifiedTimeAsStart }), [treatOutputFileModifiedTimeAsStart]);

  const [outFormatLocked, setOutFormatLocked] = useState(safeGetConfigInitial('outFormatLocked'));
  useEffect(() => safeSetConfig({ outFormatLocked }), [outFormatLocked]);
  const [safeOutputFileName, setSafeOutputFileName] = useState(safeGetConfigInitial('safeOutputFileName'));
  useEffect(() => safeSetConfig({ safeOutputFileName }), [safeOutputFileName]);
  const [enableAutoHtml5ify, setEnableAutoHtml5ify] = useState(safeGetConfigInitial('enableAutoHtml5ify'));
  useEffect(() => safeSetConfig({ enableAutoHtml5ify }), [enableAutoHtml5ify]);
  const [segmentsToChaptersOnly, setSegmentsToChaptersOnly] = useState(safeGetConfigInitial('segmentsToChaptersOnly'));
  useEffect(() => safeSetConfig({ segmentsToChaptersOnly }), [segmentsToChaptersOnly]);
  const [keyBindings, setKeyBindings] = useState(safeGetConfigInitial('keyBindings'));
  useEffect(() => safeSetConfig({ keyBindings }), [keyBindings]);
  const [enableSmartCut, setEnableSmartCut] = useState(safeGetConfigInitial('enableSmartCut'));
  useEffect(() => safeSetConfig({ enableSmartCut }), [enableSmartCut]);
  const [customFfPath, setCustomFfPath] = useState(safeGetConfigInitial('customFfPath'));
  useEffect(() => safeSetConfig({ customFfPath }), [customFfPath]);
  const [clipsFolder, setClipsFolder] = useState(safeGetConfigInitial('clipsFolder'));
  useEffect(() => safeSetConfig({ clipsFolder }), [clipsFolder]);
  const [clipsFolderOfferDismissed, setClipsFolderOfferDismissed] = useState(safeGetConfigInitial('clipsFolderOfferDismissed'));
  useEffect(() => safeSetConfig({ clipsFolderOfferDismissed }), [clipsFolderOfferDismissed]);
  const [projectFileLocation, setProjectFileLocation] = useState(safeGetConfigInitial('projectFileLocation'));
  useEffect(() => safeSetConfig({ projectFileLocation }), [projectFileLocation]);
  const [enableOverwriteOutput, setEnableOverwriteOutput] = useState(safeGetConfigInitial('enableOverwriteOutput'));
  useEffect(() => safeSetConfig({ enableOverwriteOutput }), [enableOverwriteOutput]);
  const [mouseWheelZoomModifierKey, setMouseWheelZoomModifierKey] = useState(safeGetConfigInitial('mouseWheelZoomModifierKey'));
  useEffect(() => safeSetConfig({ mouseWheelZoomModifierKey }), [mouseWheelZoomModifierKey]);
  const [mouseWheelFrameSeekModifierKey, setMouseWheelFrameSeekModifierKey] = useState(safeGetConfigInitial('mouseWheelFrameSeekModifierKey'));
  useEffect(() => safeSetConfig({ mouseWheelFrameSeekModifierKey }), [mouseWheelFrameSeekModifierKey]);
  const [mouseWheelKeyframeSeekModifierKey, setMouseWheelKeyframeSeekModifierKey] = useState(safeGetConfigInitial('mouseWheelKeyframeSeekModifierKey'));
  useEffect(() => safeSetConfig({ mouseWheelKeyframeSeekModifierKey }), [mouseWheelKeyframeSeekModifierKey]);
  const [segmentMouseModifierKey, setSegmentMouseModifierKey] = useState(safeGetConfigInitial('segmentMouseModifierKey'));
  useEffect(() => safeSetConfig({ segmentMouseModifierKey }), [segmentMouseModifierKey]);
  const [extraMouseModifierKeys, setExtraMouseModifierKeys] = useState(safeGetConfigInitial('extraMouseModifierKeys'));
  useEffect(() => safeSetConfig({ extraMouseModifierKeys }), [extraMouseModifierKeys]);
  const [captureFrameMethod, setCaptureFrameMethod] = useState(safeGetConfigInitial('captureFrameMethod'));
  useEffect(() => safeSetConfig({ captureFrameMethod }), [captureFrameMethod]);
  const [captureFrameQuality, setCaptureFrameQuality] = useState(safeGetConfigInitial('captureFrameQuality'));
  useEffect(() => safeSetConfig({ captureFrameQuality }), [captureFrameQuality]);
  const [captureFrameFileNameFormat, setCaptureFrameFileNameFormat] = useState(safeGetConfigInitial('captureFrameFileNameFormat'));
  useEffect(() => safeSetConfig({ captureFrameFileNameFormat }), [captureFrameFileNameFormat]);
  const [enableNativeHevc, setEnableNativeHevc] = useState(safeGetConfigInitial('enableNativeHevc'));
  useEffect(() => safeSetConfig({ enableNativeHevc }), [enableNativeHevc]);
  const [enableUpdateCheck, setEnableUpdateCheck] = useState(safeGetConfigInitial('enableUpdateCheck'));
  useEffect(() => safeSetConfig({ enableUpdateCheck }), [enableUpdateCheck]);
  const [updateMode, setUpdateMode] = useState(safeGetConfigInitial('updateMode'));
  useEffect(() => safeSetConfig({ updateMode }), [updateMode]);
  const [cleanupChoices, setCleanupChoices] = useState(safeGetConfigInitial('cleanupChoices'));
  useEffect(() => safeSetConfig({ cleanupChoices }), [cleanupChoices]);
  const [allowMultipleInstances, setAllowMultipleInstances] = useState(safeGetConfigInitial('allowMultipleInstances'));
  useEffect(() => safeSetConfig({ allowMultipleInstances }), [allowMultipleInstances]);
  const [darkMode, setDarkMode] = useState(safeGetConfigInitial('darkMode'));
  useEffect(() => safeSetConfig({ darkMode }), [darkMode]);
  const [preferStrongColors, setPreferStrongColors] = useState(safeGetConfigInitial('preferStrongColors'));
  useEffect(() => safeSetConfig({ preferStrongColors }), [preferStrongColors]);
  const [exportProgressStyle, setExportProgressStyle] = useState(safeGetConfigInitial('exportProgressStyle'));
  useEffect(() => safeSetConfig({ exportProgressStyle }), [exportProgressStyle]);
  const [outputFileNameMinZeroPadding, setOutputFileNameMinZeroPadding] = useState(safeGetConfigInitial('outputFileNameMinZeroPadding'));
  useEffect(() => safeSetConfig({ outputFileNameMinZeroPadding }), [outputFileNameMinZeroPadding]);
  const [cutFromAdjustmentFrames, setCutFromAdjustmentFrames] = useState(safeGetConfigInitial('cutFromAdjustmentFrames'));
  useEffect(() => safeSetConfig({ cutFromAdjustmentFrames }), [cutFromAdjustmentFrames]);
  const [cutToAdjustmentFrames, setCutToAdjustmentFrames] = useState(safeGetConfigInitial('cutToAdjustmentFrames'));
  useEffect(() => safeSetConfig({ cutToAdjustmentFrames }), [cutToAdjustmentFrames]);
  const [storeWindowBounds, setStoreWindowBounds] = useState(safeGetConfigInitial('storeWindowBounds'));
  useEffect(() => safeSetConfig({ storeWindowBounds }), [storeWindowBounds]);
  const [waveformMode, setWaveformMode] = useState(safeGetConfigInitial('waveformMode'));
  useEffect(() => safeSetConfig({ waveformMode }), [waveformMode]);
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState(safeGetConfigInitial('thumbnailsEnabled'));
  useEffect(() => safeSetConfig({ thumbnailsEnabled }), [thumbnailsEnabled]);
  const [keyframesEnabled, setKeyframesEnabled] = useState(safeGetConfigInitial('keyframesEnabled'));
  useEffect(() => safeSetConfig({ keyframesEnabled }), [keyframesEnabled]);
  const [reducedMotion, setReducedMotion] = useState(safeGetConfigInitial('reducedMotion'));
  useEffect(() => safeSetConfig({ reducedMotion }), [reducedMotion]);
  const [ffmpegHwaccel, setFfmpegHwaccel] = useState(safeGetConfigInitial('ffmpegHwaccel'));
  useEffect(() => safeSetConfig({ ffmpegHwaccel }), [ffmpegHwaccel]);
  const [exportGpuAcceleration, setExportGpuAcceleration] = useState(safeGetConfigInitial('exportGpuAcceleration'));
  useEffect(() => safeSetConfig({ exportGpuAcceleration }), [exportGpuAcceleration]);
  const [exportEncodeMode, setExportEncodeMode] = useState(safeGetConfigInitial('exportEncodeMode'));
  useEffect(() => safeSetConfig({ exportEncodeMode }), [exportEncodeMode]);
  const [sizeLimitMb, setSizeLimitMb] = useState(safeGetConfigInitial('sizeLimitMb'));
  useEffect(() => safeSetConfig({ sizeLimitMb }), [sizeLimitMb]);
  const [sizeLimitControlMode, setSizeLimitControlMode] = useState(safeGetConfigInitial('sizeLimitControlMode'));
  useEffect(() => safeSetConfig({ sizeLimitControlMode }), [sizeLimitControlMode]);
  const [sizeLimitPreset, setSizeLimitPreset] = useState(safeGetConfigInitial('sizeLimitPreset'));
  useEffect(() => safeSetConfig({ sizeLimitPreset }), [sizeLimitPreset]);
  const [sizeLimitVideoFormat, setSizeLimitVideoFormat] = useState(safeGetConfigInitial('sizeLimitVideoFormat'));
  useEffect(() => safeSetConfig({ sizeLimitVideoFormat }), [sizeLimitVideoFormat]);
  const [sizeLimitSimpleResolution, setSizeLimitSimpleResolution] = useState(safeGetConfigInitial('sizeLimitSimpleResolution'));
  useEffect(() => safeSetConfig({ sizeLimitSimpleResolution }), [sizeLimitSimpleResolution]);
  const [sizeLimitSimpleResolutionTouched, setSizeLimitSimpleResolutionTouched] = useState(safeGetConfigInitial('sizeLimitSimpleResolutionTouched'));
  useEffect(() => safeSetConfig({ sizeLimitSimpleResolutionTouched }), [sizeLimitSimpleResolutionTouched]);
  const [sizeLimitSimpleFps, setSizeLimitSimpleFps] = useState(safeGetConfigInitial('sizeLimitSimpleFps'));
  useEffect(() => safeSetConfig({ sizeLimitSimpleFps }), [sizeLimitSimpleFps]);
  const [sizeLimitSimpleFpsTouched, setSizeLimitSimpleFpsTouched] = useState(safeGetConfigInitial('sizeLimitSimpleFpsTouched'));
  useEffect(() => safeSetConfig({ sizeLimitSimpleFpsTouched }), [sizeLimitSimpleFpsTouched]);
  const [sizeLimitAdvancedResolution, setSizeLimitAdvancedResolution] = useState(safeGetConfigInitial('sizeLimitAdvancedResolution'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedResolution }), [sizeLimitAdvancedResolution]);
  const [sizeLimitAdvancedFps, setSizeLimitAdvancedFps] = useState(safeGetConfigInitial('sizeLimitAdvancedFps'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedFps }), [sizeLimitAdvancedFps]);
  const [sizeLimitAdvancedEncoder, setSizeLimitAdvancedEncoder] = useState(safeGetConfigInitial('sizeLimitAdvancedEncoder'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedEncoder }), [sizeLimitAdvancedEncoder]);
  const [sizeLimitAdvancedTwoPass, setSizeLimitAdvancedTwoPass] = useState(safeGetConfigInitial('sizeLimitAdvancedTwoPass'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedTwoPass }), [sizeLimitAdvancedTwoPass]);
  const [sizeLimitAdvancedAv1CpuPreset, setSizeLimitAdvancedAv1CpuPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedAv1CpuPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedAv1CpuPreset }), [sizeLimitAdvancedAv1CpuPreset]);
  const [sizeLimitAdvancedAv1NvencPreset, setSizeLimitAdvancedAv1NvencPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedAv1NvencPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedAv1NvencPreset }), [sizeLimitAdvancedAv1NvencPreset]);
  const [sizeLimitAdvancedH264CpuPreset, setSizeLimitAdvancedH264CpuPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedH264CpuPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedH264CpuPreset }), [sizeLimitAdvancedH264CpuPreset]);
  const [sizeLimitAdvancedH264NvencPreset, setSizeLimitAdvancedH264NvencPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedH264NvencPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedH264NvencPreset }), [sizeLimitAdvancedH264NvencPreset]);
  const [sizeLimitAdvancedHevcCpuPreset, setSizeLimitAdvancedHevcCpuPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedHevcCpuPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedHevcCpuPreset }), [sizeLimitAdvancedHevcCpuPreset]);
  const [sizeLimitAdvancedHevcNvencPreset, setSizeLimitAdvancedHevcNvencPreset] = useState(safeGetConfigInitial('sizeLimitAdvancedHevcNvencPreset'));
  useEffect(() => safeSetConfig({ sizeLimitAdvancedHevcNvencPreset }), [sizeLimitAdvancedHevcNvencPreset]);
  const [sizeLimitSeparateNamingMode, setSizeLimitSeparateNamingMode] = useState(safeGetConfigInitial('sizeLimitSeparateNamingMode'));
  useEffect(() => safeSetConfig({ sizeLimitSeparateNamingMode }), [sizeLimitSeparateNamingMode]);
  const [sizeLimitMergedNamingMode, setSizeLimitMergedNamingMode] = useState(safeGetConfigInitial('sizeLimitMergedNamingMode'));
  useEffect(() => safeSetConfig({ sizeLimitMergedNamingMode }), [sizeLimitMergedNamingMode]);
  const [sizeLimitCutFileTemplate, setSizeLimitCutFileTemplate] = useState(safeGetConfigInitial('sizeLimitCutFileTemplate'));
  useEffect(() => safeSetConfig({ sizeLimitCutFileTemplate }), [sizeLimitCutFileTemplate]);
  const [sizeLimitCutMergedFileTemplate, setSizeLimitCutMergedFileTemplate] = useState(safeGetConfigInitial('sizeLimitCutMergedFileTemplate'));
  useEffect(() => safeSetConfig({ sizeLimitCutMergedFileTemplate }), [sizeLimitCutMergedFileTemplate]);
  const [quickExportPresets, setQuickExportPresets] = useState(safeGetConfigInitial('quickExportPresets'));
  useEffect(() => safeSetConfig({ quickExportPresets }), [quickExportPresets]);


  const resetKeyBindings = useCallback(() => {
    configStore.reset('keyBindings');
    setKeyBindings((JSON.parse(configStore.getSnapshotJson()) as Config).keyBindings);
  }, []);

  /**
   * Settings' "Reset all settings": everything the Settings screen sets, back to its default (configStore's), shortcuts
   * included. Not what isn't set there: recent files, the clips list's order, the window, the theme. Where projects are
   * kept is changed by Settings itself, which moves them.
   */
  const resetAllSettings = useCallback(() => {
    const setters: { [K in keyof Config]?: (value: Config[K]) => void } = {
      language: setLanguage,
      clipsFolder: setClipsFolder,
      exportConfirmEnabled: setExportConfirmEnabled,
      hideOsNotifications: setHideOsNotifications,
      hideNotifications: setHideNotifications,
      askBeforeClose: setAskBeforeClose,
      enableAdvancedMode: setEnableAdvancedMode,
      enableAskForFileOpenAction: setEnableAskForFileOpenAction,
      storeWindowBounds: setStoreWindowBounds,
      preferStrongColors: setPreferStrongColors,
      reducedMotion: setReducedMotion,
      exportProgressStyle: setExportProgressStyle,
      timecodeFormat: setTimecodeFormat,
      waveformHeight: setWaveformHeight,
      playOnOpen: setPlayOnOpen,
      invertCutSegments: setInvertCutSegments,
      enableAutoHtml5ify: setEnableAutoHtml5ify,
      autoLoadTimecode: setAutoLoadTimecode,
      enableImportChapters: setEnableImportChapters,
      keyframeCut: setKeyframeCut,
      sizeLimitVideoFormat: setSizeLimitVideoFormat,
      exportGpuAcceleration: setExportGpuAcceleration,
      enableCustomOutDir: setEnableCustomOutDir,
      cleanupChoices: setCleanupChoices,
      copyAfterExport: setCopyAfterExport,
      trashSourceAfterExport: setTrashSourceAfterExport,
      quickExportPresets: setQuickExportPresets,
      autoExportExtraStreams: setAutoExportExtraStreams,
      treatInputFileModifiedTimeAsStart: setTreatInputFileModifiedTimeAsStart,
      treatOutputFileModifiedTimeAsStart: setTreatOutputFileModifiedTimeAsStart,
      captureFormat: setCaptureFormat,
      captureFrameMethod: setCaptureFrameMethod,
      captureFrameQuality: setCaptureFrameQuality,
      captureFrameFileNameFormat: setCaptureFrameFileNameFormat,
      keyBindings: setKeyBindings,
      autoSaveProjectFile: setAutoSaveProjectFile,
      trashProjectWithSource: setTrashProjectWithSource,
      enableUpdateCheck: setEnableUpdateCheck,
      updateMode: setUpdateMode,
      customFfPath: setCustomFfPath,
      enableNativeHevc: setEnableNativeHevc,
      ffmpegHwaccel: setFfmpegHwaccel,
      allowMultipleInstances: setAllowMultipleInstances,
    };
    const keys = Object.keys(setters) as (keyof Config)[];
    keys.forEach((key) => configStore.reset(key));
    const fresh = JSON.parse(configStore.getSnapshotJson()) as Config;
    keys.forEach((key) => (setters[key] as (value: unknown) => void)(fresh[key]));
  }, []);

  // NOTE! This useEffect must be placed after all usages of firstUpdateRef.current (safeSetConfig)
  useEffect(() => {
    firstUpdateRef.current = false;
    return () => {
      firstUpdateRef.current = true;
    };
  }, []);

  const toggleDarkMode = useCallback(() => setDarkMode((v) => !v), []);

  // Settings > Appearance > Reduce motion, off unless turned on: Windows' own setting isn't followed, so nobody sees a
  // stiller ClipPress without having asked for it (owner, 2026-11-07). An older "System default" counts as off.
  const prefersReducedMotion = reducedMotion === 'always';

  useEffect(() => {
    animationsEmitter.emit('reducedMotion', prefersReducedMotion);
    // The stylesheets' reduced-motion rules hang off this class, not the system's media query.
    document.documentElement.classList.toggle('reduce-motion', prefersReducedMotion);
  }, [prefersReducedMotion]);

  const springAnimation = useMemo<Transition>(() => (prefersReducedMotion ? { duration: 0 } : mySpring), [prefersReducedMotion]);

  const customOutDir = useMemo(() => (enableCustomOutDir ? recentCustomOutDirs[0] : undefined), [enableCustomOutDir, recentCustomOutDirs]);

  const setCustomOutDir = useCallback((newDir: string | undefined) => {
    if (newDir) {
      setRecentCustomOutDirs((prev) => [
        newDir,
        ...prev.filter((d) => d !== newDir),
      ].slice(0, 5)); // keep only the 5 most recent dirs
      setEnableCustomOutDir(true);
    } else {
      setEnableCustomOutDir(false);
    }
  }, []);

  // Note: settings are reported when reporting errors
  // 🚨 Must be JSON-serializable!
  const settings = useMemo(() => ({
    lastAppVersion,
    captureFormat,
    recentCustomOutDirs,
    enableCustomOutDir,
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
    enableAdvancedMode,
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
    clipsFolderOfferDismissed,
    projectFileLocation,
    enableOverwriteOutput,
    mouseWheelZoomModifierKey,
    mouseWheelFrameSeekModifierKey,
    mouseWheelKeyframeSeekModifierKey,
    segmentMouseModifierKey,
    extraMouseModifierKeys,
    captureFrameMethod,
    captureFrameQuality,
    captureFrameFileNameFormat,
    enableNativeHevc,
    enableUpdateCheck,
    updateMode,
    cleanupChoices,
    allowMultipleInstances,
    darkMode,
    preferStrongColors,
    exportProgressStyle,
    outputFileNameMinZeroPadding,
    cutFromAdjustmentFrames,
    cutToAdjustmentFrames,
    storeWindowBounds,
    waveformMode,
    thumbnailsEnabled,
    keyframesEnabled,
    reducedMotion,
    ffmpegHwaccel,
    exportGpuAcceleration,
    exportEncodeMode,
    sizeLimitMb,
    sizeLimitControlMode,
    sizeLimitPreset,
    sizeLimitVideoFormat,
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
    sizeLimitAdvancedHevcCpuPreset,
    sizeLimitAdvancedHevcNvencPreset,
    sizeLimitSeparateNamingMode,
    sizeLimitMergedNamingMode,
    sizeLimitCutFileTemplate,
    sizeLimitCutMergedFileTemplate,
    quickExportPresets,
  }), [
    lastAppVersion,
    captureFormat,
    recentCustomOutDirs,
    enableCustomOutDir,
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
    enableAdvancedMode,
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
    clipsFolderOfferDismissed,
    projectFileLocation,
    enableOverwriteOutput,
    mouseWheelZoomModifierKey,
    mouseWheelFrameSeekModifierKey,
    mouseWheelKeyframeSeekModifierKey,
    segmentMouseModifierKey,
    extraMouseModifierKeys,
    captureFrameMethod,
    captureFrameQuality,
    captureFrameFileNameFormat,
    enableNativeHevc,
    enableUpdateCheck,
    updateMode,
    cleanupChoices,
    allowMultipleInstances,
    darkMode,
    preferStrongColors,
    exportProgressStyle,
    outputFileNameMinZeroPadding,
    cutFromAdjustmentFrames,
    cutToAdjustmentFrames,
    storeWindowBounds,
    waveformMode,
    thumbnailsEnabled,
    keyframesEnabled,
    reducedMotion,
    ffmpegHwaccel,
    exportGpuAcceleration,
    exportEncodeMode,
    sizeLimitMb,
    sizeLimitControlMode,
    sizeLimitPreset,
    sizeLimitVideoFormat,
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
    sizeLimitAdvancedHevcCpuPreset,
    sizeLimitAdvancedHevcNvencPreset,
    sizeLimitSeparateNamingMode,
    sizeLimitMergedNamingMode,
    sizeLimitCutFileTemplate,
    sizeLimitCutMergedFileTemplate,
    quickExportPresets,
  ]);

  const root = useMemo(() => ({
    settings,

    springAnimation,
    customOutDir,

    // Kept out of `settings`, which is attached to error reports: these are file paths.
    recentFiles,
    setRecentFiles,
    shelfExports,
    setShelfExports,
    shelfOrder,
    setShelfOrder,
    clipsFolder,

    // setters
    setLastAppVersion,
    setCaptureFormat,
    setCustomOutDir,
    setRecentCustomOutDirs,
    setKeyframeCut,
    setPreserveMetadata,
    setPreserveMetadataOnMerge,
    setPreserveMovData,
    setPreserveChapters,
    setMovFastStart,
    setAvoidNegativeTs,
    setAutoMerge,
    setTimecodeFormat,
    setInvertCutSegments,
    setAutoExportExtraStreams,
    setAskBeforeClose,
    setEnableImportChapters,
    setEnableAskForFileOpenAction,
    setPlaybackVolume,
    setAutoSaveProjectFile,
    setWheelSensitivity,
    setWaveformHeight,
    setInvertTimelineScroll,
    setLanguage,
    setFfmpegExperimental,
    setHideNotifications,
    setHideOsNotifications,
    setAutoLoadTimecode,
    setAutoDeleteMergedSegments,
    setExportConfirmEnabled,
    setTrashSourceAfterExport,
    setTrashProjectWithSource,
    setCopyAfterExport,
    setPlayOnOpen,
    setSegmentsToChapters,
    setSimpleMode,
    setEnableAdvancedMode,
    setCutFileTemplate,
    setCutMergedFileTemplate,
    setMergedFileTemplate,
    setKeyboardSeekAccFactor,
    setKeyboardNormalSeekSpeed,
    setKeyboardSeekSpeed2,
    setKeyboardSeekSpeed3,
    setTreatInputFileModifiedTimeAsStart,
    setTreatOutputFileModifiedTimeAsStart,
    setOutFormatLocked,
    setSafeOutputFileName,
    setEnableAutoHtml5ify,
    setSegmentsToChaptersOnly,
    setKeyBindings,
    resetKeyBindings,
    resetAllSettings,
    setEnableSmartCut,
    setCustomFfPath,
    setClipsFolder,
    setClipsFolderOfferDismissed,
    setProjectFileLocation,
    setEnableOverwriteOutput,
    setMouseWheelZoomModifierKey,
    setMouseWheelFrameSeekModifierKey,
    setMouseWheelKeyframeSeekModifierKey,
    setSegmentMouseModifierKey,
    setExtraMouseModifierKeys,
    setCaptureFrameMethod,
    setCaptureFrameQuality,
    setCaptureFrameFileNameFormat,
    setEnableNativeHevc,
    setEnableUpdateCheck,
    setUpdateMode,
    setCleanupChoices,
    setAllowMultipleInstances,
    toggleDarkMode,
    setPreferStrongColors,
    setExportProgressStyle,
    setOutputFileNameMinZeroPadding,
    setCutFromAdjustmentFrames,
    setCutToAdjustmentFrames,
    setStoreWindowBounds,
    setWaveformMode,
    setThumbnailsEnabled,
    setKeyframesEnabled,
    prefersReducedMotion,
    setReducedMotion,
    setFfmpegHwaccel,
    setExportGpuAcceleration,
    setExportEncodeMode,
    setSizeLimitMb,
    setSizeLimitControlMode,
    setSizeLimitPreset,
    setSizeLimitVideoFormat,
    setSizeLimitSimpleResolution,
    setSizeLimitSimpleResolutionTouched,
    setSizeLimitSimpleFps,
    setSizeLimitSimpleFpsTouched,
    setSizeLimitAdvancedResolution,
    setSizeLimitAdvancedFps,
    setSizeLimitAdvancedEncoder,
    setSizeLimitAdvancedTwoPass,
    setSizeLimitAdvancedAv1CpuPreset,
    setSizeLimitAdvancedAv1NvencPreset,
    setSizeLimitAdvancedH264CpuPreset,
    setSizeLimitAdvancedH264NvencPreset,
    setSizeLimitAdvancedHevcCpuPreset,
    setSizeLimitAdvancedHevcNvencPreset,
    setSizeLimitSeparateNamingMode,
    setSizeLimitMergedNamingMode,
    setSizeLimitCutFileTemplate,
    setSizeLimitCutMergedFileTemplate,
    setQuickExportPresets,
  }), [settings, springAnimation, customOutDir, setCustomOutDir, resetKeyBindings, resetAllSettings, toggleDarkMode, prefersReducedMotion, recentFiles, shelfExports, shelfOrder, clipsFolder]);

  // The preview volume beside the rest, not in `settings`: dragging its slider changes it at every step, and every
  // component that reads the settings would draw again with it. Only the player and the volume control need it.
  return { root, playbackVolume };
}

export type UserSettingsRoot = ReturnType<typeof useUserSettingsRoot>['root'];
