import Store from 'electron-store';
// eslint-disable-next-line import/no-extraneous-dependencies
import electron from 'electron';
import { join, dirname } from 'node:path';
import assert from 'node:assert';
import { access, copyFile } from 'node:fs/promises';

import type { KeyBinding, Config } from '../common/types.js';
import logger from './logger.js';
import { preserveUnreadableConfig, readStoredConfigKeys } from './configFileRecovery.js';
import { moveSettingsOutOfInstallFolder, noteSettingsFoldersForInstaller } from './installFolderConfig.js';
import { getInstallationDir, isWindowsFolderInside } from './installation.js';
import { isWindows, pathExists } from './util.js';
import { fallbackLng } from './i18nCommon.js';
import { addQuickExportKeyBindings, defaultQuickExportPresets, migrateQuickExportPresets, normalizeQuickExportPresets, quickExportKeyBindings } from '../common/quickExport.js';

const { app } = electron;


const defaultKeyBindings: KeyBinding[] = [
  { keys: 'ShiftLeft+Equal', action: 'addSegment' },
  { keys: 'Space', action: 'togglePlayResetSpeed' },
  { keys: 'KeyK', action: 'togglePlayNoResetSpeed' },
  { keys: 'KeyJ', action: 'reducePlaybackRate' },
  { keys: 'ShiftLeft+KeyJ', action: 'reducePlaybackRateMore' },
  { keys: 'KeyL', action: 'increasePlaybackRate' },
  { keys: 'ShiftLeft+KeyL', action: 'increasePlaybackRateMore' },
  { keys: 'KeyZ', action: 'timelineToggleComfortZoom' },
  { keys: 'ShiftLeft+KeyZ', action: 'makeCursorTimeZero' },
  { keys: 'Comma', action: 'seekPreviousFrame' },
  { keys: 'Period', action: 'seekNextFrame' },
  { keys: 'KeyC', action: 'captureSnapshot' },
  { keys: 'ControlLeft+KeyC', action: 'copySegmentsToClipboard' },
  { keys: 'MetaLeft+KeyC', action: 'copySegmentsToClipboard' },
  { keys: 'ShiftLeft+KeyC', action: 'captureSnapshotToClipboard' },

  { keys: 'KeyI', action: 'setCutStart' },
  { keys: 'KeyO', action: 'setCutEnd' },
  { keys: 'Backspace', action: 'removeCurrentCutpoint' },
  { keys: 'KeyB', action: 'splitCurrentSegment' },
  // R is crop in photo editors; it used to rotate the export, unseen in the simple editor (rotation is still bindable).
  { keys: 'KeyR', action: 'editCurrentSegmentCrop' },
  { keys: 'ControlLeft+KeyR', action: 'toggleSegmentSpeedControls' },
  { keys: 'MetaLeft+KeyR', action: 'toggleSegmentSpeedControls' },
  { keys: 'KeyG', action: 'goToTimecode' },
  { keys: 'KeyT', action: 'addTextOverlay' },
  { keys: 'ShiftLeft+KeyT', action: 'toggleStripCurrentFilter' },

  { keys: 'ArrowLeft', action: 'seekBackwards' },
  { keys: 'ControlLeft+ShiftLeft+ArrowLeft', action: 'seekBackwards2' },
  { keys: 'ControlLeft+ArrowLeft', action: 'seekBackwardsPercent' },
  { keys: 'MetaLeft+ArrowLeft', action: 'seekBackwardsPercent' },
  { keys: 'AltLeft+ArrowLeft', action: 'seekBackwardsKeyframe' },
  { keys: 'ShiftLeft+ArrowLeft', action: 'jumpCutStart' },

  { keys: 'ArrowRight', action: 'seekForwards' },
  { keys: 'ControlLeft+ShiftLeft+ArrowRight', action: 'seekForwards2' },
  { keys: 'ControlLeft+ArrowRight', action: 'seekForwardsPercent' },
  { keys: 'MetaLeft+ArrowRight', action: 'seekForwardsPercent' },
  { keys: 'AltLeft+ArrowRight', action: 'seekForwardsKeyframe' },
  { keys: 'ShiftLeft+ArrowRight', action: 'jumpCutEnd' },

  { keys: 'ControlLeft+Home', action: 'jumpTimelineStart' },
  { keys: 'ControlLeft+End', action: 'jumpTimelineEnd' },

  { keys: 'PageUp', action: 'jumpFirstSegment' },
  { keys: 'ArrowUp', action: 'jumpPrevSegment' },
  { keys: 'ShiftLeft+AltLeft+PageUp', action: 'jumpSeekFirstSegment' },
  { keys: 'ShiftLeft+AltLeft+ArrowUp', action: 'jumpSeekPrevSegment' },
  { keys: 'ControlLeft+ArrowUp', action: 'timelineZoomIn' },
  { keys: 'MetaLeft+ArrowUp', action: 'timelineZoomIn' },
  { keys: 'ShiftLeft+ArrowUp', action: 'batchPreviousFile' },
  { keys: 'ControlLeft+ShiftLeft+ArrowUp', action: 'batchOpenPreviousFile' },

  { keys: 'PageDown', action: 'jumpLastSegment' },
  { keys: 'ArrowDown', action: 'jumpNextSegment' },
  { keys: 'ShiftLeft+AltLeft+PageDown', action: 'jumpSeekLastSegment' },
  { keys: 'ShiftLeft+AltLeft+ArrowDown', action: 'jumpSeekNextSegment' },
  { keys: 'ControlLeft+ArrowDown', action: 'timelineZoomOut' },
  { keys: 'MetaLeft+ArrowDown', action: 'timelineZoomOut' },
  { keys: 'ShiftLeft+ArrowDown', action: 'batchNextFile' },
  { keys: 'ControlLeft+ShiftLeft+ArrowDown', action: 'batchOpenNextFile' },

  { keys: 'ShiftLeft+Enter', action: 'batchOpenSelectedFile' },

  // https://github.com/mifi/lossless-cut/issues/610
  { keys: 'ControlLeft+KeyZ', action: 'undo' },
  { keys: 'MetaLeft+KeyZ', action: 'undo' },
  { keys: 'ControlLeft+ShiftLeft+KeyZ', action: 'redo' },
  { keys: 'MetaLeft+ShiftLeft+KeyZ', action: 'redo' },
  // The usual Windows redo, as in Edit > Redo.
  { keys: 'ControlLeft+KeyY', action: 'redo' },

  { keys: 'KeyF', action: 'toggleFullscreenVideo' },

  { keys: 'Enter', action: 'labelCurrentSegment' },

  { keys: 'Delete', action: 'removeSelectedClips' },

  { keys: 'KeyE', action: 'export' },
  ...quickExportKeyBindings,
  { keys: 'ShiftLeft+Slash', action: 'toggleKeyboardShortcuts' },

  { keys: 'AltLeft+ArrowUp', action: 'increaseVolume' },
  { keys: 'AltLeft+ArrowDown', action: 'decreaseVolume' },
  { keys: 'KeyM', action: 'toggleMuted' },
];

const defaults: Config = {
  version: 2,
  lastAppVersion: app.getVersion(),
  captureFormat: 'jpeg',
  enableCustomOutDir: false,
  recentCustomOutDirs: [],
  recentFiles: [],
  shelfOrder: 'date',
  shelfExports: [],
  keyframeCut: true,
  autoMerge: false,
  autoDeleteMergedSegments: true,
  segmentsToChaptersOnly: false,
  enableSmartCut: false,
  timecodeFormat: 'timecodeWithDecimalFraction',
  invertCutSegments: false,
  autoExportExtraStreams: true,
  exportConfirmEnabled: true,
  trashSourceAfterExport: false,
  trashProjectWithSource: true,
  askBeforeClose: false,
  enableImportChapters: 'ask',
  enableAskForFileOpenAction: true,
  playbackVolume: 0.3, // so that we don't shock new users with loud volume
  autoSaveProjectFile: true,
  wheelSensitivity: 0.2,
  waveformHeight: 40,
  language: fallbackLng,
  ffmpegExperimental: false,
  preserveChapters: true,
  preserveMetadata: 'default',
  preserveMetadataOnMerge: false,
  preserveMovData: false,
  movFastStart: true,
  avoidNegativeTs: 'make_zero',
  hideNotifications: undefined,
  hideOsNotifications: undefined,
  autoLoadTimecode: false,
  segmentsToChapters: false,
  simpleMode: true,
  enableAdvancedMode: false,
  outSegTemplate: undefined,
  mergedFileTemplate: undefined,
  mergedFilesTemplate: undefined,
  keyboardSeekAccFactor: 1.03,
  keyboardNormalSeekSpeed: 1,
  keyboardSeekSpeed2: 10,
  keyboardSeekSpeed3: 60,
  treatInputFileModifiedTimeAsStart: true,
  treatOutputFileModifiedTimeAsStart: true,
  outFormatLocked: undefined,
  safeOutputFileName: true,
  windowBounds: undefined,
  enableAutoHtml5ify: true,
  keyBindings: defaultKeyBindings,
  customFfPath: undefined,
  storeProjectInWorkingDir: true,
  projectFileLocation: 'app',
  enableOverwriteOutput: true,
  mouseWheelZoomModifierKey: 'ctrl',
  mouseWheelFrameSeekModifierKey: 'alt',
  mouseWheelKeyframeSeekModifierKey: 'shift',
  segmentMouseModifierKey: 'shift',
  captureFrameMethod: 'videotag', // we don't default to ffmpeg because ffmpeg might choose a frame slightly off
  captureFrameQuality: 0.95,
  captureFrameFileNameFormat: 'timestamp',
  enableNativeHevc: true,
  enableUpdateCheck: true,
  updateMode: 'automatic',
  cleanupChoices: {
    trashTmpFiles: true, askForCleanup: true, closeFile: true, cleanupAfterExport: false,
  },
  allowMultipleInstances: false,
  darkMode: true,
  preferStrongColors: false,
  outputFileNameMinZeroPadding: 1,
  cutFromAdjustmentFrames: 0,
  cutToAdjustmentFrames: 0,
  invertTimelineScroll: undefined,
  storeWindowBounds: true,
  waveformMode: undefined,
  thumbnailsEnabled: false,
  keyframesEnabled: true,
  reducedMotion: 'user',
  ffmpegHwaccel: 'none',
  exportGpuAcceleration: true,
  exportEncodeMode: 'lossless',
  sizeLimitMb: 20,
  sizeLimitCodec: 'h264',
  sizeLimitQuality: 'fast',
  sizeLimitControlMode: 'simple',
  sizeLimitPreset: 'quality',
  sizeLimitSimpleResolution: 'auto',
  sizeLimitSimpleResolutionTouched: false,
  sizeLimitSimpleFps: 'auto',
  sizeLimitSimpleFpsTouched: false,
  sizeLimitAdvancedResolution: 'source',
  sizeLimitAdvancedFps: 'source',
  sizeLimitAdvancedEncoder: 'av1_nvenc',
  sizeLimitAdvancedTwoPass: false,
  sizeLimitAdvancedAv1CpuPreset: 6,
  sizeLimitAdvancedAv1NvencPreset: 'p6',
  sizeLimitAdvancedH264CpuPreset: 'slow',
  sizeLimitAdvancedH264NvencPreset: 'p4',
  sizeLimitSeparateNamingMode: 'auto',
  sizeLimitMergedNamingMode: 'auto',
  sizeLimitCutFileTemplate: undefined,
  sizeLimitCutMergedFileTemplate: undefined,
  quickExportPresets: defaultQuickExportPresets,
};

const configFileName = 'config.json'; // note: this is also hard-coded inside electron-store

// look for a config.json file next to the executable
// For portable app: https://github.com/mifi/lossless-cut/issues/645
// Not for an installed copy, whose executable's folder is replaced by every update (see init).
async function lookForNeighbourConfigFile() {
  try {
    // https://github.com/mifi/lossless-cut/issues/645#issuecomment-1001363314
    // https://stackoverflow.com/questions/46307797/how-to-get-the-original-path-of-a-portable-electron-app
    // https://github.com/electron-userland/electron-builder/blob/master/docs/configuration/nsis.md
    if (!isWindows || process.windowsStore) return undefined;
    const appExeDir = process.env['PORTABLE_EXECUTABLE_DIR'] || dirname(app.getPath('exe'));
    const customConfigPath = join(appExeDir, configFileName);
    if (await pathExists(customConfigPath)) return appExeDir;

    return undefined;
  } catch (err) {
    logger.error('Failed to get custom storage path', err);
    return undefined;
  }
}

let store: Store;
const updateSettingsEvents = new EventTarget();
export const onUpdateSettingsChange = (listener: () => void) => updateSettingsEvents.addEventListener('change', listener);

export function get<T extends keyof Config>(key: T): Config[T] {
  return store.get(key);
}

/** One disk read and one bridge response, with no remote object proxies in the renderer. */
export const getSnapshotJson = () => JSON.stringify(store.store);

export function set<T extends keyof Config>(key: T, val: Config[T]) {
  if (val === undefined) store.delete(key);
  else store.set(key, val);
  if (key === 'enableUpdateCheck' || key === 'updateMode' || key === 'allowMultipleInstances') updateSettingsEvents.dispatchEvent(new Event('change'));
}

export function reset<T extends keyof Config>(key: T) {
  set(key, defaults[key]);
}

async function tryCreateStore({ customStoragePath }: { customStoragePath: string | undefined }) {
  for (let i = 0; i < 5; i += 1) {
    try {
      store = new Store({
        defaults,
        clearInvalidConfig: false,
        ...(customStoragePath != null ? { cwd: customStoragePath } : {}),
      });
      return;
    } catch (err) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 2000));
      logger.error('Failed to create config store, retrying', err);
    }
  }

  throw new Error('Timed out while creating config store');
}

let customStoragePath: string | undefined;

/**
 * The config file itself, in whichever directory electron-store was pointed at.
 *
 * `customStoragePath` is a directory — electron-store is given it as `cwd` and writes
 * `config.json` inside it — so the file name has to be joined on in both cases. It used
 * to be appended only for the default location, which left the portable build (always a
 * neighbour config dir on Windows) handing a directory to `copyFile` and to the
 * "show config file" menu item.
 */
export const getConfigPath = () => join(customStoragePath ?? app.getPath('userData'), configFileName);

/** The folder ClipPress keeps its own files in: the portable settings folder if there is one, else app data. */
export const getDataDir = () => customStoragePath ?? app.getPath('userData');

async function tryBackupConfigFile(oldConfigVersion: number, appVersion: string) {
  try {
    const configPath = getConfigPath();
    const backupPath = `${configPath}.backup-v${appVersion}-${oldConfigVersion}-${Date.now()}`;
    await copyFile(configPath, backupPath);
    logger.info(`Backed up config file to ${backupPath}`);
  } catch (err) {
    logger.error('Failed to backup config file', err);
  }
}

export interface PreservedCorruptConfig {
  configPath: string,
  backupPath: string,
}

let preservedCorruptConfig: PreservedCorruptConfig | undefined;

/** Set when startup found an unreadable config file and kept a copy of it. */
export const getPreservedCorruptConfig = () => preservedCorruptConfig;

/**
 * Preserves unreadable settings before opening the store, which is configured to refuse
 * invalid JSON instead of silently clearing it.
 *
 * electron-store's `clearInvalidConfig` default means a config file that does not parse
 * is silently replaced by an empty one, and the next `set()` writes over it for good. We
 * cannot recover the settings automatically — we do not know what was in there — but we
 * can make sure the file itself still exists and say so.
 */
async function preserveUnreadableConfigFile() {
  preservedCorruptConfig = await preserveUnreadableConfig(getConfigPath());
  if (preservedCorruptConfig != null) {
    logger.error(`Config file could not be read; kept a copy at ${preservedCorruptConfig.backupPath} and starting from defaults`);
  }
}

/** Settings are kept in the installation folder of an installed copy, so installing an update would delete them. */
let settingsInInstallationFolder = false;

/** Whether installing an update now would delete settings (see init). Updates are then not installed. */
export const areSettingsInInstallationFolder = () => settingsInInstallationFolder;

/**
 * See moveSettingsOutOfInstallFolder. Never stops startup: the settings in app data are used
 * regardless, and an import that failed part-way is finished at the next start. Resolves with
 * whether settings are still left in the installation folder.
 */
async function importSettingsFromInstallFolder(installDir: string) {
  const outcome = await moveSettingsOutOfInstallFolder({ installDir, configDir: app.getPath('userData'), now: new Date() });
  if (outcome.imported != null) logger.info('Moved the settings file out of the installation folder, which updates delete', outcome.imported);
  if (outcome.settingsLeft) {
    logger.error('Settings are still in the installation folder: not installing updates in this run, and trying again at the next start', outcome.error);
  }
  return outcome.settingsLeft;
}

/** Whether the folder `dir` is inside the installation folder. If that cannot be told, it may be. */
async function isInInstallationFolder(dir: string, installDir: string) {
  try {
    return await isWindowsFolderInside(dir, installDir);
  } catch (err) {
    logger.error('Could not tell whether a settings folder is inside the installation folder, so taking it to be', dir, err);
    return true;
  }
}

/**
 * For an installed copy: keeps its settings out of the installation folder, which every update and
 * reinstall deletes, and resolves with whether settings are still in it (see areSettingsInInstallationFolder).
 */
async function keepSettingsOutOfInstallationFolder(installDir: string, customConfigDir: string | undefined) {
  // The folder of the settings in use when given with --config-dir (the user's choice: never moved,
  // but never deleted by an update either), and the app-data folder that settings are moved into.
  // By what the folders are, not how their paths are written: through a junction, say.
  let settingsDirInside: string | undefined;
  for (const dir of [customConfigDir, app.getPath('userData')]) {
    // eslint-disable-next-line no-await-in-loop
    if (dir != null && await isInInstallationFolder(dir, installDir)) {
      settingsDirInside = dir;
      break;
    }
  }
  // Also for an installer run by hand, which cannot know where --config-dir points (or pointed at
  // an earlier start). The installer installs nothing while one of these folders has settings.
  let noted: string[] = [];
  try {
    noted = await noteSettingsFoldersForInstaller({
      installDir,
      settingsDir: settingsDirInside,
      stillHasSettings: async (dir) => {
        try {
          await access(join(dir, configFileName));
        } catch (err) {
          // Unless they are certainly gone (moved out, say), they may still be there.
          if (err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return false;
        }
        return isInInstallationFolder(dir, installDir);
      },
    });
  } catch (err) {
    logger.error('Could not tell the installer about settings in the installation folder', settingsDirInside, err);
  }
  if (settingsDirInside != null) {
    logger.warn('A settings folder is inside the installation folder, which updates and reinstalls delete: not installing updates', settingsDirInside);
    return true;
  }
  // An installed copy never keeps settings next to its executable: updates delete that folder.
  // Also with --config-dir: a later start without it uses them, and an update must not delete them.
  const settingsLeft = await importSettingsFromInstallFolder(installDir);
  if (noted.length > 0) {
    logger.warn('Settings folders used at earlier starts are still inside the installation folder: not installing updates', noted);
    return true;
  }
  return settingsLeft;
}

export async function init({ customConfigDir }: { customConfigDir: string | undefined }) {
  const installDir = getInstallationDir();
  if (installDir != null) settingsInInstallationFolder = await keepSettingsOutOfInstallationFolder(installDir, customConfigDir);
  customStoragePath = customConfigDir ?? (installDir == null ? await lookForNeighbourConfigFile() : undefined);
  if (customStoragePath) logger.info('customStoragePath', customStoragePath);

  await preserveUnreadableConfigFile();
  const storedKeys = await readStoredConfigKeys(getConfigPath());

  await tryCreateStore({ customStoragePath });

  if (!['automatic', 'ask'].includes(store.get('updateMode'))) set('updateMode', defaults.updateMode);
  // 'date' and 'name' from before the shelf could be turned round still mean oldest first and A to Z.
  if (!['date', 'date-desc', 'name', 'name-desc'].includes(store.get('shelfOrder'))) set('shelfOrder', defaults.shelfOrder);

  // migrate old configs:
  const enableTransferTimestamps = store.get('enableTransferTimestamps'); // todo remove after a while
  if (enableTransferTimestamps != null) {
    logger.info('Migrating enableTransferTimestamps');
    store.delete('enableTransferTimestamps');
    set('treatOutputFileModifiedTimeAsStart', enableTransferTimestamps ? true : undefined);
  }

  const cleanupChoices = store.get('cleanupChoices'); // todo remove after a while
  if (cleanupChoices != null && cleanupChoices.closeFile == null) {
    logger.info('Migrating cleanupChoices.closeFile');
    set('cleanupChoices', { ...cleanupChoices, closeFile: true });
  }

  // "Move the original to the trash" + "Do this automatically after each export" in the clean-up dialog is now the
  // Export setting "Move the original to the Recycle Bin after export", which never deletes permanently.
  // Only an unattended setup (no "Ask me each time") becomes the switch, and the old automatic trigger is
  // retired so that turning the switch off really stops it. Asked-each-time setups keep asking.
  const legacyCleanupChoices = store.get('cleanupChoices') as (Config['cleanupChoices'] & { trashSourceFile?: boolean }) | undefined;
  if (!storedKeys.has('trashSourceAfterExport') && legacyCleanupChoices?.cleanupAfterExport && legacyCleanupChoices.trashSourceFile && !legacyCleanupChoices.askForCleanup) {
    logger.info('Migrating cleanupChoices.trashSourceFile to trashSourceAfterExport');
    set('trashSourceAfterExport', true);
    set('cleanupChoices', { ...legacyCleanupChoices, trashSourceFile: false } as Config['cleanupChoices']);
  }

  const customOutDir = store.get('customOutDir'); // todo remove after a while
  if (customOutDir != null) {
    logger.info('Migrating customOutDir to recentCustomOutDirs');
    store.delete('customOutDir');
    set('recentCustomOutDirs', [customOutDir]);
    set('enableCustomOutDir', customOutDir != null);
  }

  const hasSizeLimitControlMode = storedKeys.has('sizeLimitControlMode');
  const hasSizeLimitPreset = storedKeys.has('sizeLimitPreset');
  const hasSizeLimitAdvancedEncoder = storedKeys.has('sizeLimitAdvancedEncoder');
  const hasSizeLimitAdvancedTwoPass = storedKeys.has('sizeLimitAdvancedTwoPass');

  const hasLegacySizeLimitSettings = storedKeys.has('sizeLimitCodec') || storedKeys.has('sizeLimitQuality');
  if (hasLegacySizeLimitSettings && (!hasSizeLimitControlMode || !hasSizeLimitPreset || !hasSizeLimitAdvancedEncoder || !hasSizeLimitAdvancedTwoPass)) {
    logger.info('Migrating size-limited export mode settings');

    const sizeLimitCodec = store.get('sizeLimitCodec');
    const sizeLimitQuality = store.get('sizeLimitQuality');

    if (sizeLimitQuality === 'fast') {
      if (!hasSizeLimitControlMode) set('sizeLimitControlMode', 'simple');
      if (!hasSizeLimitPreset) set('sizeLimitPreset', 'fast');
      if (!hasSizeLimitAdvancedEncoder) set('sizeLimitAdvancedEncoder', 'h264_nvenc');
      if (!hasSizeLimitAdvancedTwoPass) set('sizeLimitAdvancedTwoPass', false);
    } else if (sizeLimitCodec === 'av1') {
      if (!hasSizeLimitControlMode) set('sizeLimitControlMode', 'simple');
      if (!hasSizeLimitPreset) set('sizeLimitPreset', 'max_quality');
      if (!hasSizeLimitAdvancedEncoder) set('sizeLimitAdvancedEncoder', 'av1_cpu');
      if (!hasSizeLimitAdvancedTwoPass) set('sizeLimitAdvancedTwoPass', false);
    } else {
      if (!hasSizeLimitControlMode) set('sizeLimitControlMode', 'advanced');
      if (!hasSizeLimitPreset) set('sizeLimitPreset', 'max_quality');
      if (!hasSizeLimitAdvancedEncoder) set('sizeLimitAdvancedEncoder', 'h264_cpu');
      if (!hasSizeLimitAdvancedTwoPass) set('sizeLimitAdvancedTwoPass', true);
    }
  }

  const storedSizeLimitPreset = store.get('sizeLimitPreset') as string | undefined;
  if (storedSizeLimitPreset === 'ultra_fast') {
    logger.info('Migrating ultra_fast size-limited preset to fast');
    set('sizeLimitPreset', 'fast');
  }

  if (!store.has('sizeLimitSimpleResolution')) set('sizeLimitSimpleResolution', defaults.sizeLimitSimpleResolution);
  if (!store.has('sizeLimitSimpleResolutionTouched')) set('sizeLimitSimpleResolutionTouched', defaults.sizeLimitSimpleResolutionTouched);
  if (!store.has('sizeLimitSimpleFps')) set('sizeLimitSimpleFps', defaults.sizeLimitSimpleFps);
  if (!store.has('sizeLimitSimpleFpsTouched')) set('sizeLimitSimpleFpsTouched', defaults.sizeLimitSimpleFpsTouched);
  if (!store.has('sizeLimitAdvancedResolution')) set('sizeLimitAdvancedResolution', defaults.sizeLimitAdvancedResolution);
  if (!store.has('sizeLimitAdvancedFps')) set('sizeLimitAdvancedFps', defaults.sizeLimitAdvancedFps);
  if (!store.has('sizeLimitAdvancedAv1CpuPreset')) set('sizeLimitAdvancedAv1CpuPreset', defaults.sizeLimitAdvancedAv1CpuPreset);
  if (!store.has('sizeLimitAdvancedAv1NvencPreset')) set('sizeLimitAdvancedAv1NvencPreset', defaults.sizeLimitAdvancedAv1NvencPreset);
  if (!store.has('sizeLimitAdvancedH264CpuPreset')) set('sizeLimitAdvancedH264CpuPreset', defaults.sizeLimitAdvancedH264CpuPreset);
  if (!store.has('sizeLimitAdvancedH264NvencPreset')) set('sizeLimitAdvancedH264NvencPreset', defaults.sizeLimitAdvancedH264NvencPreset);

  const hasSizeLimitSeparateNamingMode = storedKeys.has('sizeLimitSeparateNamingMode');
  const hasSizeLimitMergedNamingMode = storedKeys.has('sizeLimitMergedNamingMode');

  if (!hasSizeLimitSeparateNamingMode || !hasSizeLimitMergedNamingMode) {
    logger.info('Migrating size-limited export naming mode settings');

    const legacySeparateTemplate = store.get('outSegTemplate');
    const legacyMergedTemplate = store.get('mergedFileTemplate');

    // eslint-disable-next-line no-template-curly-in-string
    const legacyDefaultCutFileTemplate = '${FILENAME}-${CUT_FROM}-${CUT_TO}${SEG_SUFFIX}${EXT}';
    // eslint-disable-next-line no-template-curly-in-string
    const legacyDefaultCutMergedFileTemplate = '${FILENAME}-cut-merged-${EPOCH_MS}${EXT}';

    if (!hasSizeLimitSeparateNamingMode) {
      set('sizeLimitSeparateNamingMode', legacySeparateTemplate != null && legacySeparateTemplate !== legacyDefaultCutFileTemplate ? 'custom_template' : 'auto');
    }

    if (!hasSizeLimitMergedNamingMode) {
      set('sizeLimitMergedNamingMode', legacyMergedTemplate != null && legacyMergedTemplate !== legacyDefaultCutMergedFileTemplate ? 'custom_template' : 'auto');
    }
  }

  // Preserve templates saved before size-limited and lossless naming were separated.
  if (store.get('sizeLimitCutFileTemplate') == null && store.get('sizeLimitSeparateNamingMode') === 'custom_template') {
    set('sizeLimitCutFileTemplate', store.get('outSegTemplate'));
  }
  if (store.get('sizeLimitCutMergedFileTemplate') == null && store.get('sizeLimitMergedNamingMode') === 'custom_template') {
    set('sizeLimitCutMergedFileTemplate', store.get('mergedFileTemplate'));
  }

  // const configVersion: number = store.get('version');

  const keyBindings = (store.get('keyBindings') as KeyBinding[]).map(({ keys, action }) => ({ keysStr: keys, keys: keys.split('+'), action }));

  // assume that if there is one binding with ctrl, then it's the old format where keys were stored as strings like "Ctrl+Shift+S". We want to migrate to the new format where keys are stored as "ControlLeft+ShiftLeft+KeyS"
  // todo remove after a while
  if (keyBindings.some(({ keys }) => keys.some((k) => k.toLowerCase() === 'ctrl'))) {
    await tryBackupConfigFile(1, app.getVersion());

    const newBindings = keyBindings.map(({ keys: keysOrig, keysStr, action }) => {
      try {
        assert(keysOrig.length > 0 && keysOrig.every((k) => k.length > 0), 'Invalid keys');

        const map: Record<string, string> = {
          /* eslint-disable quote-props */
          'esc': 'Escape',
          '1': 'Digit1',
          '2': 'Digit2',
          '3': 'Digit3',
          '4': 'Digit4',
          '5': 'Digit5',
          '6': 'Digit6',
          '7': 'Digit7',
          '8': 'Digit8',
          '9': 'Digit9',
          '0': 'Digit0',
          '-': 'Minus',
          '=': 'Equal',
          'backspace': 'Backspace',
          'tab': 'Tab',
          'q': 'KeyQ',
          'w': 'KeyW',
          'e': 'KeyE',
          'r': 'KeyR',
          't': 'KeyT',
          'y': 'KeyY',
          'u': 'KeyU',
          'i': 'KeyI',
          'o': 'KeyO',
          'p': 'KeyP',
          '[': 'BracketLeft',
          ']': 'BracketRight',
          'enter': 'Enter',
          'a': 'KeyA',
          's': 'KeyS',
          'd': 'KeyD',
          'f': 'KeyF',
          'g': 'KeyG',
          'h': 'KeyH',
          'j': 'KeyJ',
          'k': 'KeyK',
          'l': 'KeyL',
          ';': 'Semicolon',
          '\'': 'Quote',
          '`': 'Backquote',
          '\\': 'Backslash',
          'z': 'KeyZ',
          'x': 'KeyX',
          'c': 'KeyC',
          'v': 'KeyV',
          'b': 'KeyB',
          'n': 'KeyN',
          'm': 'KeyM',
          ',': 'Comma',
          '.': 'Period',
          '/': 'Slash',
          '*': 'NumpadMultiply',
          'space': 'Space',
          'capslock': 'CapsLock',
          'f1': 'F1',
          'f2': 'F2',
          'f3': 'F3',
          'f4': 'F4',
          'f5': 'F5',
          'f6': 'F6',
          'f7': 'F7',
          'f8': 'F8',
          'f9': 'F9',
          'f10': 'F10',
          'pause': 'Pause',
          'f11': 'F11',
          'f12': 'F12',
          'f13': 'F13',
          'f14': 'F14',
          'f15': 'F15',
          'f16': 'F16',
          'f17': 'F17',
          'f18': 'F18',
          'f19': 'F19',
          'f20': 'F20',
          'f21': 'F21',
          'f22': 'F22',
          'f23': 'F23',
          'f24': 'F24',
          '(': 'NumpadParenLeft',
          ')': 'NumpadParenRight',
          'help': 'Help',
          'numlock': 'NumLock',
          'home': 'Home',
          'up': 'ArrowUp',
          'pageup': 'PageUp',
          'left': 'ArrowLeft',
          'right': 'ArrowRight',
          'end': 'End',
          'down': 'ArrowDown',
          'pagedown': 'PageDown',
          'ins': 'Insert',
          'del': 'Delete',

          // modifiers
          'ctrl': 'ControlLeft',
          'shift': 'ShiftLeft',
          'alt': 'AltLeft',
          'meta': 'MetaLeft',
          /* eslint-enable quote-props */
        };

        const newKeys = keysOrig.flatMap((k) => {
          if (k === 'plus') return ['shift', '='];
          if (k === 'command') return ['meta'];
          if (k === 'option') return ['alt'];
          if (k === 'return') return ['enter'];
          if (k === 'escape') return ['esc'];
          return [k];
        }).map((k) => {
          const mapped = map[k.toLowerCase()];
          assert(mapped != null, `Unknown key: ${k}`);
          return mapped;
        });

        return { keys: newKeys.join('+'), action };
      } catch (err) {
        logger.error('Failed to migrate old keyboard binding', keysStr, action, err);
        return { keys: keysStr, action };
      }
    });
    set('keyBindings', newBindings);

    logger.info('Migrated config to version 2');
    set('version', 2);
  }

  if (store.get('segmentSpeedShortcutsMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    const addedBindings = defaultKeyBindings.filter((binding) => binding.action === 'toggleSegmentSpeedControls'
      && !existingBindings.some((existing) => existing.keys === binding.keys || existing.action === binding.action));
    if (addedBindings.length > 0) set('keyBindings', [...existingBindings, ...addedBindings]);
    store.set('segmentSpeedShortcutsMigrated', true);
  }

  // T used to toggle "strip all tracks", which silently left every track out of the next export
  // when pressed by accident. It now adds text. Settings still holding that old default get the new
  // one; a T the user bound to something else is left alone, and strip-all stays bindable.
  if (store.get('textShortcutMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    const withoutOldDefault = existingBindings.filter((existing) => !(existing.keys === 'KeyT' && existing.action === 'toggleStripAll'));
    const tIsFree = !withoutOldDefault.some((existing) => existing.keys === 'KeyT');
    const hasTextBinding = withoutOldDefault.some((existing) => existing.action === 'addTextOverlay');
    const migrated = tIsFree && !hasTextBinding ? [...withoutOldDefault, { keys: 'KeyT', action: 'addTextOverlay' as const }] : withoutOldDefault;
    if (migrated.length !== existingBindings.length || migrated.some((binding, i) => binding !== existingBindings[i])) set('keyBindings', migrated);
    store.set('textShortcutMigrated', true);
  }

  // Ctrl+Y redo for existing settings too, unless Ctrl+Y (either Ctrl key) already does something.
  if (store.get('redoCtrlYShortcutMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    const isCtrlY = (keys: string) => { const parts = keys.split('+'); return parts.length === 2 && parts.includes('KeyY') && (parts.includes('ControlLeft') || parts.includes('ControlRight')); };
    if (!existingBindings.some((existing) => isCtrlY(existing.keys))) set('keyBindings', [...existingBindings, { keys: 'ControlLeft+KeyY', action: 'redo' }]);
    store.set('redoCtrlYShortcutMigrated', true);
  }

  // Quick export presets still at their first defaults: Discord 20 MB, Email 17 MB, and a real name for the first.
  if (store.get('quickExportPresetsMigrated') !== true) {
    const existingPresets = normalizeQuickExportPresets(store.get('quickExportPresets'));
    const migratedPresets = migrateQuickExportPresets(existingPresets);
    if (migratedPresets.some((preset, i) => preset !== existingPresets[i])) set('quickExportPresets', migratedPresets);
    store.set('quickExportPresetsMigrated', true);
  }

  // Single keys that did something hard to notice by accident: D opened the clean-up dialog, R rotated the export.
  // Settings still holding those defaults lose D, and R zooms / crops instead (if that has no key of its own).
  if (store.get('riskyLetterShortcutsMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    const cropBound = existingBindings.some((existing) => existing.action === 'editCurrentSegmentCrop');
    const migrated = existingBindings.flatMap((existing): KeyBinding[] => {
      if (existing.keys === 'KeyD' && existing.action === 'cleanupFilesDialog') return [];
      if (existing.keys === 'KeyR' && existing.action === 'increaseRotation') return cropBound ? [] : [{ keys: 'KeyR', action: 'editCurrentSegmentCrop' }];
      return [existing];
    });
    if (migrated.length !== existingBindings.length || migrated.some((binding, i) => binding !== existingBindings[i])) set('keyBindings', migrated);
    store.set('riskyLetterShortcutsMigrated', true);
  }

  // Delete removes the selected clips, for existing settings too, unless Delete already does something.
  if (store.get('deleteClipsShortcutMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    if (!existingBindings.some((existing) => existing.keys === 'Delete' || existing.action === 'removeSelectedClips')) set('keyBindings', [...existingBindings, { keys: 'Delete', action: 'removeSelectedClips' as const }]);
    store.set('deleteClipsShortcutMigrated', true);
  }

  // Ctrl+E and Ctrl+1/2/3 (quick exports) for existing settings too, where those keys are still free.
  if (store.get('quickExportShortcutsMigrated') !== true) {
    const existingBindings = store.get('keyBindings') as KeyBinding[];
    const withQuickExports = addQuickExportKeyBindings(existingBindings);
    if (withQuickExports !== existingBindings) set('keyBindings', withQuickExports);
    store.set('quickExportShortcutsMigrated', true);
  }
}
