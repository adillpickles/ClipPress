process.traceDeprecation = true;
process.traceProcessWarnings = true;

/* eslint-disable import/first */
// eslint-disable-next-line import/no-extraneous-dependencies
import electron, { BrowserWindow, type BrowserWindowConstructorOptions, nativeTheme, shell, app, ipcMain, Notification, type NotificationConstructorOptions } from 'electron';
import i18n from 'i18next';
import debounce from 'lodash.debounce/index.js';
import yargsParser from 'yargs-parser';
import JSON5 from 'json5';
import remote from '@electron/remote/main/index.js';
import { stat } from 'node:fs/promises';
import assert from 'node:assert';
import timers from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import electronUnhandled from 'electron-unhandled';
import type { Asyncify } from 'type-fest';
import mitt from 'mitt';

import logger, { flushFileLogger, loadFileLogger } from './logger.js';
import menu from './menu.js';
import * as configStore from './configStore.js';
import { isLinux, isWindows, isMac, platform, arch, pathExists } from './util.js';
import { appName } from './common.js';
import isDev from './isDev.js';
import isStoreBuild from './isStoreBuild.js';
import { getAboutPanelOptions } from './aboutPanel.js';
import * as i18nCommon from './i18nCommon.js';
import './i18n.js';
import type { ApiActionRequest, Config } from '../common/types.js';
import { isSafeKey } from './objectKeys.js';
import { isAllowedAppNavigation, isExternallyOpenableUrl } from './navigation.js';
import * as ffmpeg from './ffmpeg.js';
import * as compatPlayer from './compatPlayer.js';
import { canCopyFiles, copyFilesToClipboard, startFileDrag, warmCopyHelper } from './fileClipboard.js';
import { forgetEncoderCheck, readSavedEncoderCheck, saveEncoderCheck } from './encoderCheck.js';
import { downloadMediaUrl } from './ffmpeg.js';
import type UpdateController from './updateController.js';
import type { UpdateStatus } from '../common/updates.js';
import getEffectiveSimpleMode from '../common/interfaceMode.js';
import CloseGuard from './closeGuard.js';
import type { CloseDecision } from './closeGuard.js';


electronUnhandled({ showDialog: true, logger: (err) => logger.error('electron-unhandled', err) });

// https://chromestatus.com/feature/5748496434987008
// https://peter.sh/experiments/chromium-command-line-switches/
// https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/runtime_enabled_features.json5
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');
// Windows 11's thin scroll bars, shown while scrolling and without arrows, wherever the app doesn't draw its own (the
// open list of a dropdown, which can't be styled).
if (isWindows) app.commandLine.appendSwitch('enable-features', 'FluentOverlayScrollbar');

remote.initialize();


app.name = appName;

if (isWindows) {
  // in order to set the title on OS notifications on Windows, this needs to be set to app.name
  // https://github.com/mifi/lossless-cut/pull/2139
  // https://stackoverflow.com/a/65863174/6519037
  app.setAppUserModelId(app.name);
}

let filesToOpen: string[] = [];

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null;

let askBeforeClose = false;
let rendererReady = false;
let newVersion: string | undefined;
let disableNetworking: boolean;
let autoUpdatesPromise: Promise<UpdateController> | undefined;
let autoUpdates: UpdateController | undefined;
let updateCheckScheduled = false;
let closeGuard: CloseGuard | undefined;
/** Windows asked to end the session (shutdown, restart, sign-out), or an app to close (Restart Manager). */
let sessionEnding = false;

function getAutoUpdates() {
  autoUpdatesPromise ??= import('./autoUpdates.js').then(({ default: createAutoUpdates }) => createAutoUpdates({
    offline: !!disableNetworking,
    storeBuild: isStoreBuild,
    onChange: (status: UpdateStatus) => {
      if (mainWindow == null || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('update-status', status);
      if (newVersion !== status.version) {
        newVersion = status.version;
        // The updater callback runs after the window and menu have been initialized.
        // eslint-disable-next-line no-use-before-define
        updateMenu();
      }
    },
  })).then((updates) => {
    autoUpdates = updates;
    if (sessionEnding) updates.holdInstallation();
    return updates;
  });
  return autoUpdatesPromise;
}

/**
 * Windows is ending the session, so this run must never start the installer of an update: it could
 * be cut off half-way, after removing the installed app. A close that was already in progress
 * still quits normally (the session ending does not by itself), which would otherwise install.
 * A downloaded update is installed on a later quit instead.
 */
function holdUpdateInstallation() {
  if (sessionEnding) return;
  sessionEnding = true;
  logger.info('The session is ending: not installing an update when this run quits');
  // At once, before any later event can quit (or once loaded, see getAutoUpdates).
  autoUpdates?.holdInstallation();
}

async function checkForUpdates() {
  mainWindow?.webContents.send('showUpdates');
  return (await getAutoUpdates()).check(true);
}

const getUpdateStatus = async () => (await getAutoUpdates()).getStatus();
const downloadUpdate = async () => (await getAutoUpdates()).download();
const approveUpdateInstall = async () => (await getAutoUpdates()).approveInstall();

function acknowledgeAppVersion() {
  // Write before the renderer updates its state; its initial-save guard must
  // never swallow the version acknowledgement under React StrictMode.
  if (configStore.get('lastAppVersion') !== app.getVersion()) configStore.set('lastAppVersion', app.getVersion());
}

const openFiles = (paths: string[]) => mainWindow!.webContents.send('openFiles', paths);

let apiActionRequestsId = 0;
const apiActionRequests = new Map<number, () => void>();

async function sendApiAction(action: string, args?: unknown[]) {
  try {
    const id = apiActionRequestsId;
    apiActionRequestsId += 1;
    mainWindow!.webContents.send('apiAction', { id, action, args } satisfies ApiActionRequest);
    await new Promise<void>((resolve) => apiActionRequests.set(id, resolve));
  } catch (err) {
    logger.error('sendApiAction', err);
  }
}

export type AppEvent = {
  eventName: 'export-complete',
  paths?: string[],
} | {
  eventName: 'export-start',
  path: string,
}

const appEventEmitter = mitt<{ appEvent: AppEvent }>();

ipcMain.on('appEvent', (_e, appEvent: AppEvent) => {
  appEventEmitter.emit('appEvent', appEvent);
});

async function onAwaitAppEvent(awaitEventName: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<AppEvent>((resolve, reject) => {
    const onAbort = () => {
      // The two callbacks remove each other when either event wins.
      // eslint-disable-next-line no-use-before-define
      appEventEmitter.off('appEvent', handler);
      reject(signal.reason);
    };
    const handler = (appEvent: AppEvent) => {
      if (appEvent.eventName === awaitEventName) {
        appEventEmitter.off('appEvent', handler);
        signal.removeEventListener('abort', onAbort);
        resolve(appEvent);
      }
    };
    appEventEmitter.on('appEvent', handler);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// https://github.com/electron/electron/issues/526#issuecomment-563010533
function getSavedBounds() {
  const bounds = configStore.get('windowBounds');
  const options: BrowserWindowConstructorOptions = {};
  const primaryWorkArea = electron.screen.getPrimaryDisplay().workArea;
  if (bounds) {
    const area = electron.screen.getDisplayMatching(bounds).workArea;
    // If the saved position still valid (the window is entirely inside the display area), use it.
    if (
      bounds.x >= area.x
      && bounds.y >= area.y
      && bounds.x + bounds.width <= area.x + area.width
      && bounds.y + bounds.height <= area.y + area.height
    ) {
      options.x = bounds.x;
      options.y = bounds.y;
    }
    // If the saved size is still valid, use it.
    if (bounds.width <= area.width || bounds.height <= area.height) {
      options.width = Math.min(bounds.width, area.width);
      options.height = Math.min(bounds.height, area.height);
    }
  } else {
    options.width = Math.min(1480, primaryWorkArea.width);
    options.height = Math.min(940, primaryWorkArea.height);
  }
  return {
    options,
    isMaximized: bounds != null ? bounds.isMaximized : false,
  };
}

function createWindow() {
  const darkMode = configStore.get('darkMode');
  // todo follow darkMode setting when user switches
  // https://www.electronjs.org/docs/latest/tutorial/dark-mode
  if (darkMode) nativeTheme.themeSource = 'dark';

  const savedBounds = getSavedBounds();

  mainWindow = new BrowserWindow({
    ...savedBounds.options,
    darkTheme: true,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const }
      : {
        frame: false,
        titleBarStyle: 'hidden' as const,
        autoHideMenuBar: true,
      }),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      // https://github.com/electron/electron/issues/5107
      webSecurity: !isDev,
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
    },
    backgroundColor: darkMode ? '#111317' : '#f5f7fb',
    minWidth: 960,
    minHeight: 680,
  });

  if (!isMac) {
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  }

  if (savedBounds.isMaximized) mainWindow.maximize();

  remote.enable(mainWindow.webContents);


  // Incremental hardening: never open a child window, and never navigate the app
  // window away from its own document. Full contextIsolation:true / nodeIntegration:false
  // migration is tracked separately.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only hand http(s) to the OS. shell.openExternal on e.g. file: or ms-msdt: is a
    // code execution primitive.
    if (isExternallyOpenableUrl(url)) {
      shell.openExternal(url).catch((err) => logger.error('Failed to open external URL', err));
    } else {
      logger.warn('Blocked window.open for non-http(s) URL', url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAllowedAppNavigation({ navigationUrl, currentUrl: mainWindow?.webContents.getURL(), isDev })) return;
    logger.warn('Blocked navigation', navigationUrl);
    event.preventDefault();
  });

  if (isDev) mainWindow.loadURL('http://localhost:3001');
  // Need to useloadFile for special characters https://github.com/mifi/lossless-cut/issues/40
  else mainWindow.loadFile('out/renderer/index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    apiActionRequests.forEach((resolve) => resolve());
    apiActionRequests.clear();
  });

  // TODO replace with `windowStatePersistence` in the future? https://github.com/electron/rfcs/pull/16
  const debouncedSaveWindowState = debounce(() => {
    if (!mainWindow || !configStore.get('storeWindowBounds')) return;
    const { x, y, width, height } = mainWindow.getNormalBounds();
    const isMaximized = mainWindow.isMaximized();
    configStore.set('windowBounds', { x, y, width, height, isMaximized });
  }, 500);

  const window = mainWindow;
  const guard = new CloseGuard({
    shouldConfirm: () => askBeforeClose,
    confirm: async () => {
      const { response } = await electron.dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 0,
        cancelId: 1,
        title: i18n.t('Confirm quit'),
        message: i18n.t('Are you sure you want to quit?'),
      });
      return response === 0;
    },
    canAskRenderer: () => rendererReady && !window.webContents.isDestroyed() && !window.webContents.isCrashed(),
    askRenderer: (id) => window.webContents.send('close-requested', id),
    showNotResponding: async (signal, reason) => {
      logger.warn('Offering to quit without saving', { reason });
      const { response } = await electron.dialog.showMessageBox(window, {
        type: 'warning',
        buttons: [i18n.t('Keep waiting'), i18n.t('Quit without saving')],
        defaultId: 0,
        cancelId: 0,
        ...(reason === 'unresponsive' ? {
          title: i18n.t('ClipPress is not responding'),
          message: i18n.t('ClipPress is not responding, so it cannot make sure that your latest project changes are saved.'),
        } : {
          title: i18n.t('ClipPress is still saving'),
          message: i18n.t('ClipPress is still getting your project saved before it closes.'),
        }),
        detail: i18n.t('You can keep waiting, or quit now and lose the changes that are not saved yet.'),
        signal,
      });
      logger.info('Not-responding dialog closed', { quitWithoutSaving: response === 1, withdrawn: signal.aborted });
      return response === 1 ? 'close' : 'wait';
    },
    close: () => {
      logger.info('Closing the main window');
      if (!window.isDestroyed()) window.close();
    },
    ackTimeoutMs: 5000,
    onError: (err) => logger.error('Failed to get ready to close', err),
  });
  closeGuard = guard;

  // The renderer saves the project before the window closes (see CloseGuard). This also keeps a
  // downloaded update from being installed on quit before then, or at all if the user cancels.
  mainWindow.on('close', (e) => {
    if (guard.handleClose()) {
      debouncedSaveWindowState.flush();
      return;
    }
    e.preventDefault();
  });
  // The page refuses to unload while it has unsaved changes (see CloseGuard.onUnloadPrevented).
  mainWindow.webContents.on('will-prevent-unload', (e) => {
    if (guard.onUnloadPrevented()) {
      logger.info('Unloading the page although it has unsaved changes: closing without saving');
      e.preventDefault();
    } else {
      logger.info('The page has unsaved changes: not unloading it yet');
    }
  });
  mainWindow.on('unresponsive', () => guard.onResponsiveChange(false));
  mainWindow.on('responsive', () => guard.onResponsiveChange(true));
  mainWindow.webContents.on('render-process-gone', () => {
    rendererReady = false;
    guard.onRendererGone();
  });
  // A new page replaced the old one (a reload). Not `did-start-navigation`: that is also emitted
  // for navigations that `will-navigate` then blocks, which leave the page as it was.
  mainWindow.webContents.on('did-navigate', () => {
    rendererReady = false;
    guard.onRendererNavigated();
  });

  // Windows ends a session (shutdown, restart, sign-out) without closing windows or quitting, so
  // the close above does not happen. Save a waiting change at least, and install no update now.
  const onSessionEnding = () => {
    holdUpdateInstallation();
    if (!window.webContents.isDestroyed()) window.webContents.send('save-project-now');
  };
  mainWindow.on('query-session-end', onSessionEnding);
  mainWindow.on('session-end', onSessionEnding);

  mainWindow.on('maximize', debouncedSaveWindowState);
  mainWindow.on('unmaximize', debouncedSaveWindowState);
  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
}

// The renderer reports the interface mode (setSimpleMode); until then, the one the saved settings give.
let menuSimpleMode: boolean | undefined;

function updateMenu() {
  assert(mainWindow);
  menu({ app, mainWindow, newVersion, isStoreBuild, simpleMode: menuSimpleMode ?? getEffectiveSimpleMode({ enableAdvancedMode: configStore.get('enableAdvancedMode'), simpleMode: configStore.get('simpleMode') }), onCheckForUpdates: () => { checkForUpdates().catch((error: unknown) => logger.warn('Update check failed', error)); } });
}

async function changeLanguage(language: string | null) {
  try {
    await i18n.changeLanguage(language ?? undefined);
    updateMenu();
    // https://www.electronjs.org/docs/latest/api/app#appsetaboutpaneloptionsoptions
    app.setAboutPanelOptions(getAboutPanelOptions());
  } catch (err) {
    logger.error('Failed to set language', err);
  }
}

function openFilesEventually(paths: string[]) {
  if (rendererReady) openFiles(paths);
  else filesToOpen = paths;
}

// https://github.com/electron/electron/issues/3657
// https://github.com/mifi/lossless-cut/issues/357
// https://github.com/mifi/lossless-cut/issues/639
// https://github.com/mifi/lossless-cut/issues/591
function parseCliArgs(rawArgv = process.argv) {
  const ignoreFirstArgs = process.defaultApp ? 2 : 1;
  // production: First arg is the ClipPress executable
  // dev: First 2 args are electron and the index.js
  const argsWithoutAppName = rawArgv.length > ignoreFirstArgs ? rawArgv.slice(ignoreFirstArgs) : [];

  return yargsParser(argsWithoutAppName, {
    boolean: ['disable-networking'],
    string: ['settings-json', 'config-dir', 'lossy-mode'],
  });
}

const argv = parseCliArgs();

// Checked by hand: zod would add about 40 ms to every start for this one option.
const lossyVideoEncoders = ['libx264', 'libx265', 'libsvtav1'] as const;
export interface LossyMode { videoEncoder: typeof lossyVideoEncoders[number] }
function parseLossyMode(value: unknown): LossyMode {
  const videoEncoder = typeof value === 'object' && value != null ? (value as { videoEncoder?: unknown }).videoEncoder : undefined;
  if (!lossyVideoEncoders.includes(videoEncoder as LossyMode['videoEncoder'])) throw new Error(`--lossy-mode needs videoEncoder: ${lossyVideoEncoders.join(', ')}`);
  return { videoEncoder: videoEncoder as LossyMode['videoEncoder'] };
}
// eslint-disable-next-line prefer-destructuring
const lossyMode = argv['lossyMode'] ? parseLossyMode(JSON5.parse(argv['lossyMode'])) : undefined;


if (argv['localesPath'] != null) i18nCommon.setCustomLocalesPath(argv['localesPath']);


function safeRequestSingleInstanceLock(additionalData: Record<string, unknown>) {
  if (process.mas) return true; // todo remove when dropping support for MacOS 13 https://github.com/electron/electron/issues/35540#issuecomment-2173130321

  // using additionalData because the built in "argv" passing is a bit broken:
  // https://github.com/electron/electron/issues/20322
  return app.requestSingleInstanceLock(additionalData);
}

// This promise will be fulfilled when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Call this immediately, to make sure we don't miss it (race condition)
const readyPromise = app.whenReady();

/**
 * Tells the user their settings were lost, and where the old file went.
 *
 * Losing every preference is the kind of thing someone will otherwise put down to the
 * app being flaky. Shown once per start, and only when there was actually something
 * unreadable on disk. The copy is offered rather than opened, because the file is broken
 * and there is nothing useful to do with it except keep it.
 */
function reportPreservedCorruptConfig() {
  const preserved = configStore.getPreservedCorruptConfig();
  if (preserved == null) return;

  const showOldFileButton = 0;
  const response = electron.dialog.showMessageBoxSync({
    type: 'warning',
    buttons: [i18n.t('Show the old file'), i18n.t('Close')],
    defaultId: 1,
    cancelId: 1,
    title: i18n.t('Settings could not be read'),
    message: i18n.t('Your settings file could not be read, so ClipPress started with its default settings.'),
    detail: i18n.t('The unreadable file was kept at:\n{{backupPath}}', { backupPath: preserved.backupPath }),
  });

  if (response === showOldFileButton) shell.showItemInFolder(preserved.backupPath);
}

async function init() {
  try {
    logger.info('ClipPress version', app.getVersion(), { isDev });
    await configStore.init({ customConfigDir: argv['configDir'] });
    logger.info('Initialized config store');

    const allowMultipleInstances = configStore.get('allowMultipleInstances');
    const language = configStore.get('language');

    if (!allowMultipleInstances && !safeRequestSingleInstanceLock({ argv: process.argv })) {
      logger.info('Found running instance, quitting');
      await flushFileLogger().catch(() => undefined);
      app.quit();
      return;
    }

    // On macOS, the system enforces single instance automatically when users try to open a second instance of your app in Finder, and the open-file and open-url events will be emitted for that.
    // However when users start your app in command line, the system's single instance mechanism will be bypassed, and you have to use this method to ensure single instance.
    // This can be tested with one terminal: npx electron .
    // and another terminal: npx electron . path/to/file.mp4
    app.on('second-instance', (_event, _commandLine, _workingDirectory, additionalData) => {
      // Someone tried to run a second instance, we should focus our window.
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }

      if (!(additionalData != null && typeof additionalData === 'object' && 'argv' in additionalData) || !Array.isArray(additionalData.argv)) return;

      const argv2 = parseCliArgs(additionalData.argv);

      logger.info('second-instance', argv2);

      if (argv2['keyboardAction']) sendApiAction(argv2['keyboardAction'], argv2._.map((arg) => JSON.parse(String(arg))));
      else if (argv2._ && argv2._.length > 0) openFilesEventually(argv2._.map(String));
    });

    // Quit when all windows are closed.
    app.on('window-all-closed', () => {
      app.quit();
    });

    app.on('activate', () => {
      // On OS X it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) {
        createWindow();
      }
    });

    ipcMain.on('renderer-ready', () => {
      rendererReady = true;
      if (filesToOpen.length > 0) openFiles(filesToOpen);
      if (!updateCheckScheduled && !disableNetworking && !isStoreBuild && !isDev && configStore.get('enableUpdateCheck')) {
        updateCheckScheduled = true;
        setTimeout(() => {
          getAutoUpdates().then((updates) => updates.check()).catch((error: unknown) => logger.warn('Update check failed', error));
        }, 8000).unref();
      }
    });

    // Mac OS open with ClipPress
    // Emitted when the user wants to open a file with the application. The open-file event is usually emitted when the application is already open and the OS wants to reuse the application to open the file.
    app.on('open-file', (event, path) => {
      openFilesEventually([path]);
      event.preventDefault(); // recommended in docs https://www.electronjs.org/docs/latest/api/app#event-open-file-macos
    });

    ipcMain.on('setAskBeforeClose', (_e, val) => {
      askBeforeClose = val;
    });

    ipcMain.on('close-request-ack', (e, id: number) => {
      if (e.sender === mainWindow?.webContents) closeGuard?.onAcknowledged(id);
    });
    ipcMain.on('close-request-decision', (e, id: number, decision: CloseDecision) => {
      if (e.sender === mainWindow?.webContents) closeGuard?.onDecision(id, decision);
    });

    ipcMain.on('setLanguage', (_e, newLanguage) => changeLanguage(newLanguage));
    ipcMain.on('setSimpleMode', (_e, simpleMode: unknown) => {
      if (typeof simpleMode !== 'boolean' || simpleMode === menuSimpleMode) return;
      menuSimpleMode = simpleMode;
      updateMenu();
    });

    ipcMain.handle('tryTrashItem', async (_e, path) => {
      try {
        await stat(path);
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
      }
      await shell.trashItem(path);
    });

    ipcMain.handle('showItemInFolder', (_e, path) => shell.showItemInFolder(path));

    ipcMain.on('apiActionResponse', (_e, { id }) => {
      const resolve = apiActionRequests.get(id);
      apiActionRequests.delete(id);
      resolve?.();
    });

    logger.info('Waiting for app to become ready');
    await readyPromise;

    logger.info('CLI arguments', argv);
    // Only if no files to open already (open-file might have already added some files)
    if (filesToOpen.length === 0) filesToOpen = argv._.map(String);
    const { settingsJson } = argv;

    ({ disableNetworking } = argv);

    if (settingsJson != null) {
      logger.info('initializing settings', settingsJson);
      const parsedSettings = JSON5.parse(settingsJson, (key, value) => (isSafeKey(key) ? value : undefined)) as Record<string, unknown>;
      Object.entries(parsedSettings).forEach(([key, value]) => {
        if (!isSafeKey(key)) return;
        // @ts-expect-error todo use zod?
        configStore.set(key, value);
      });
    }

    const { httpApi } = argv;

    if (httpApi != null) {
      const { default: HttpServer } = await import('./httpServer.js');
      const port = typeof httpApi === 'number' ? httpApi : 8080;
      const { startHttpServer } = HttpServer({ port, onKeyboardAction: sendApiAction, onAwaitAppEvent });
      await startHttpServer();
      logger.info('HTTP API listening on port', port);
    }


    if (isDev) {
      // Kept external by the build; packaged apps never resolve this development dependency.
      // eslint-disable-next-line import/no-extraneous-dependencies
      import('electron-devtools-installer')
        .then(({ installExtension, REACT_DEVELOPER_TOOLS }) => installExtension(REACT_DEVELOPER_TOOLS))
        .then((extension) => logger.info('Added Extension', extension.name))
        .catch((err: unknown) => logger.error('Failed to add extension', err));
    }

    createWindow();
    // Needed for the first FFmpeg run, but not to show the window.
    ffmpeg.loadExeca().catch((err: unknown) => logger.error('Failed to load execa', err));
    loadFileLogger().catch((err: unknown) => logger.error('Failed to load the file log', err));
    // will also updateMenu and set about panel options
    await changeLanguage(language);

    // Only after changeLanguage, so this is not the one message shown in English.
    reportPreservedCorruptConfig();
  } catch (err) {
    logger.error('Failed to initialize', err);
    // The file log may not be loaded yet this early: load and flush it, so the failure is in app.log.
    await flushFileLogger().catch(() => undefined);
    electron.dialog.showErrorBox('ClipPress could not start', err instanceof Error ? err.message : String(err));
    app.quit();
  }
}

function focusWindow() {
  try {
    app.focus({ steal: true });
  } catch (err) {
    logger.error('Failed to focus window', err);
  }
}

function quitApp() {
  // allow HTTP API to respond etc.
  timers.setTimeout(1000).then(() => electron.app.quit());
}

const hasDisabledNetworking = () => !!disableNetworking;

const setProgressBar = (v: number) => mainWindow?.setProgressBar(v);

function sendOsNotification(options: NotificationConstructorOptions) {
  if (!Notification.isSupported()) return;
  const notification = new Notification(options);
  notification.on('failed', (_e, error) => logger.warn('Notification failed', error));
  notification.show();
}

/** The title bar's menu buttons, as plain data in one call (reading a remote menu item costs a call per property). */
function getMenuBarItems() {
  const applicationMenu = electron.Menu.getApplicationMenu();
  if (applicationMenu == null) return [];
  return applicationMenu.items.flatMap((item, index) => (
    item.visible !== false && item.submenu != null && item.role !== 'appMenu'
      ? [{ index, key: String(item.id || item.label || index), label: item.label }]
      : []
  ));
}

/** The keys a role's item answers to, which Electron doesn't say (only a user-given accelerator). */
const roleAccelerators: Partial<Record<string, string>> = {
  undo: 'CmdOrCtrl+Z',
  redo: process.platform === 'darwin' ? 'Shift+CmdOrCtrl+Z' : 'Ctrl+Y',
  cut: 'CmdOrCtrl+X',
  copy: 'CmdOrCtrl+C',
  paste: 'CmdOrCtrl+V',
  selectall: 'CmdOrCtrl+A',
  togglefullscreen: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
  resetzoom: 'CmdOrCtrl+0',
  zoomin: 'CmdOrCtrl+Plus',
  zoomout: 'CmdOrCtrl+-',
  toggledevtools: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
};

export interface AppMenuItem {
  label: string,
  type: string,
  checked: boolean,
  enabled: boolean,
  visible: boolean,
  accelerator: string | undefined,
  /** The app action the item runs (menu.ts), for its key binding. */
  id: string | undefined,
  /** Where it is: indexes from the menu bar down. */
  path: number[],
  submenu: AppMenuItem[] | undefined,
}

const serializeMenu = (source: electron.Menu, path: number[]): AppMenuItem[] => source.items.map((item, index) => ({
  label: item.label,
  type: item.type,
  checked: item.checked,
  enabled: item.enabled,
  visible: item.visible,
  accelerator: (typeof item.accelerator === 'string' ? item.accelerator : undefined) ?? (item.role != null ? roleAccelerators[item.role.toLowerCase()] : undefined),
  id: item.id || undefined,
  path: [...path, index],
  submenu: item.submenu != null ? serializeMenu(item.submenu, [...path, index]) : undefined,
}));

/** One of the menu bar's menus, as plain data for the title bar to draw in the app's own style. */
function getMenuBarMenu(index: number) {
  const submenu = electron.Menu.getApplicationMenu()?.items[index]?.submenu;
  return submenu != null ? serializeMenu(submenu, [index]) : [];
}

/** Runs the menu bar's item at `path`, as clicking it in a system menu would. */
function clickMenuItem(path: number[]) {
  const [first, ...rest] = path;
  let item = first != null ? electron.Menu.getApplicationMenu()?.items[first] : undefined;
  for (const index of rest) item = item?.submenu?.items[index];
  if (item == null || !item.enabled) return;
  item.click(undefined, mainWindow ?? undefined, mainWindow?.webContents);
}

const remoteApi = {
  pathExists,
  getMenuBarItems,
  getMenuBarMenu,
  clickMenuItem,
  downloadMediaUrl,
  // Loaded when first used, not at every start.
  fileTypeFromFile: async (path: string) => (await import('file-type/node')).fileTypeFromFile(path),
  focusWindow,
  quitApp,
  setProgressBar,
  sendOsNotification,
  canCopyFiles: () => canCopyFiles,
  copyFilesToClipboard,
  // The page's settings writes: asynchronous, so writing the whole settings file never holds up the page (it did on
  // every open, for the recent files). Ordered with the page's other calls, so a later read sees it.
  setConfig: <T extends keyof Config>(key: T, value: Config[T]) => configStore.set(key, value),
  warmCopyHelper,
  readSavedEncoderCheck,
  saveEncoderCheck,
  forgetEncoderCheck,
  startFileDrag: async (paths: string[], iconDataUrl?: string) => {
    if (mainWindow != null) await startFileDrag(mainWindow.webContents, paths, iconDataUrl);
  },
  getUpdateStatus,
  checkForUpdates,
  downloadUpdate,
  approveUpdateInstall,
  acknowledgeAppVersion,
  /** For what the window does in the background and should be in the file log (its own console isn't kept). */
  log: (level: 'info' | 'warn', message: string) => (level === 'warn' ? logger.warn(message) : logger.info(message)),
};

export type RemoteApi = typeof remoteApi;

export type RemoteRpcApi = {
  [K in keyof RemoteApi]: Asyncify<RemoteApi[K]>;
};

// using @electron/remote
const remoteApiLegacy = {
  ffmpeg,
  i18n: i18nCommon,
  compatPlayer,
  configStore,
  isLinux,
  isWindows,
  isMac,
  platform,
  arch,
  isDev,
  lossyMode,
  pathToFileURL,
  hasDisabledNetworking,
};

export type RemoteApiLegacy = typeof remoteApiLegacy;


// @ts-expect-error don't know how to type
app.addListener('remote-require', (event: { returnValue: RemoteApiLegacy }, _webContents: unknown, moduleName: string) => {
  if (moduleName === './index.js') {
    // eslint-disable-next-line no-param-reassign
    event.returnValue = remoteApiLegacy;
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle('__electron_rpc__', async (_event, method: keyof RemoteApi, args: any[]) => {
  const fn = remoteApi[method];
  assert(fn, `Unknown API method: ${method}`);
  // @ts-expect-error don't know how to type
  return fn(...args);
});

// cannot top level await because app.whenReady will hang forever
// eslint-disable-next-line unicorn/prefer-top-level-await
init();
