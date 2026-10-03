// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import type { CancellationToken } from 'electron-updater';

import * as configStore from './configStore.js';
import logger from './logger.js';
import UpdateController from './updateController.js';
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
    if (configStore.get('allowMultipleInstances')) return 'multiple-instances';
    if (process.env['PORTABLE_EXECUTABLE_DIR'] != null || !existsSync(join(process.resourcesPath, 'clippress-installed'))) return 'portable';
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
      const { default: electronUpdater } = await import('electron-updater');
      const { autoUpdater, CancellationToken: Token } = electronUpdater;
      autoUpdater.logger = logger;
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
  configStore.onUpdateSettingsChange(() => controller.setPreferences(preferences()));
  return controller;
}
