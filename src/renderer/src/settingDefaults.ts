import type { Config } from '../../common/types.js';

/**
 * The defaults of Settings' dropdowns and switches, as in configStore.ts (settingDefaults.test.ts checks they match), for
 * the ↺ beside each one that's off its default.
 */
const settingDefaults = {
  language: 'en',
  reducedMotion: 'never',
  exportProgressStyle: 'pictures-sparks',
  timecodeFormat: 'timecodeWithDecimalFraction',
  invertCutSegments: false,
  enableImportChapters: 'ask',
  sizeLimitVideoFormat: 'hevc',
  treatOutputFileModifiedTimeAsStart: true,
  treatInputFileModifiedTimeAsStart: true,
  captureFormat: 'jpeg',
  captureFrameMethod: 'videotag',
  captureFrameFileNameFormat: 'timestamp',
  projectFileLocation: 'app',
  // Switches.
  exportConfirmEnabled: true,
  hideOsNotifications: undefined,
  hideNotifications: undefined,
  askBeforeClose: false,
  enableAdvancedMode: false,
  enableAskForFileOpenAction: true,
  storeWindowBounds: true,
  preferStrongColors: false,
  playOnOpen: false,
  enableAutoHtml5ify: true,
  autoLoadTimecode: false,
  exportGpuAcceleration: true,
  copyAfterExport: true,
  trashSourceAfterExport: false,
  keyframeCut: true,
  autoSaveProjectFile: true,
  trashProjectWithSource: true,
  enableNativeHevc: true,
  ffmpegHwaccel: 'none',
  allowMultipleInstances: false,
} as const satisfies Partial<Config>;

export default settingDefaults;
