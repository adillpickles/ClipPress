// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import semver from 'semver';
import type { CancellationToken } from 'electron-updater';

import * as configStore from './configStore.js';
import { getInstallationDir } from './installation.js';
import logger from './logger.js';
import UpdateController from './updateController.js';
import { cleanUpdaterCacheOnce } from './updaterCache.js';
import type { UpdateStatus } from '../common/updates.js';

export default function createAutoUpdates({ offline, storeBuild, onChange }: {
  offline: boolean,
  storeBuild: boolean,
  onChange: (status: UpdateStatus) => void,
}) {
  const getReason = (): UpdateStatus['reason'] => {
    if (offline) return 'offline';
    if (!app.isPackaged) return 'development';
    if (process.platform !== 'win32' || process.arch !== 'x64' || storeBuild) return 'platform';
    // Only a copy the installer installed can be replaced by the installer.
    if (getInstallationDir() == null) return 'portable';
    // The installer deletes the installation folder, and with it settings that are still there.
    if (configStore.areSettingsInInstallationFolder()) return 'settings-in-installation-folder';
    if (configStore.get('allowMultipleInstances')) return 'multiple-instances';
    return undefined;
  };
  const reason = getReason();
  const preferences = () => ({ enabled: configStore.get('enableUpdateCheck'), mode: configStore.get('updateMode') });
  const controller = new UpdateController({
    currentVersion: app.getVersion(),
    supported: reason == null,
    reason,
    preferences: preferences(),
    onChange,
    onError: (error) => logger.warn('Update failed; keeping the current app', error instanceof Error ? error.message : String(error)),
    loadBackend: async () => {
      if (reason != null) {
        const { checkNewVersion } = await import('./updateChecker.js');
        return {
          check: async () => { const version = await checkNewVersion(); return version != null ? { version, available: true } : undefined; },
          download: async () => undefined,
          cancel: () => undefined,
          installOnQuit: () => undefined,
        };
      }
      // What the last update left behind goes first, so it can't touch a new download.
      const cleaned = await cleanUpdaterCacheOnce({ resourcesPath: process.resourcesPath, appName: app.getName(), runningVersion: app.getVersion() });
      if (cleaned.length > 0) logger.info('Removed what the last update left behind', cleaned);
      const { default: electronUpdater } = await import('electron-updater');
      const { autoUpdater, CancellationToken: Token } = electronUpdater;
      autoUpdater.logger = logger;
      // Whole downloads: a differential one needs the last installer kept beside it (~150 MB, for ever).
      autoUpdater.disableDifferentialDownload = true;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.autoRunAppAfterInstall = false;
      autoUpdater.allowDowngrade = false;
      autoUpdater.allowPrerelease = semver.prerelease(app.getVersion()) != null;
      // Errors also reject check/download promises; logging an event prevents
      // an unhandled EventEmitter error without opening a disruptive dialog.
      autoUpdater.on('error', (error: Error) => logger.warn('Updater error', error.message));
      autoUpdater.signals.progress(({ percent }) => controller.progress(percent));
      let token: CancellationToken | undefined;
      // Restart: once ClipPress has really quit (its window closed through the usual guard, edits saved), install
      // and open the new version. Installing earlier would let the installer close the app mid-save. Registered before
      // electron-updater's own quit handler (added at download), which installs without reopening and so stands
      // aside once this has started it.
      app.once('quit', () => {
        if (controller.takeRestart()) autoUpdater.quitAndInstall(true, true);
      });
      return {
        check: async () => {
          const result = await autoUpdater.checkForUpdates();
          return result != null ? { version: result.updateInfo.version, available: result.isUpdateAvailable } : undefined;
        },
        download: async () => {
          token = new Token();
          try { await autoUpdater.downloadUpdate(token); } finally { token = undefined; }
        },
        cancel: () => token?.cancel(),
        installOnQuit: (enabled) => { autoUpdater.autoInstallOnAppQuit = enabled; },
      };
    },
  });
  configStore.onUpdateSettingsChange(() => {
    if (configStore.get('allowMultipleInstances')) controller.disableInstallation('multiple-instances');
    controller.setPreferences(preferences());
  });
  return controller;
}
