import semver from 'semver';

import type { UpdatePreferences, UpdateStatus } from '../common/updates.js';

export interface UpdateBackend {
  check: () => Promise<{ version: string, available: boolean } | undefined>,
  download: () => Promise<void>,
  cancel: () => void,
  installOnQuit: (enabled: boolean) => void,
}

export function isApplicableUpdate(currentVersion: string, version: string) {
  return semver.valid(currentVersion) != null && semver.valid(version) != null
    && semver.gt(version, currentVersion)
    && (semver.prerelease(currentVersion) != null || semver.prerelease(version) == null);
}

/** No Electron imports: policy can be tested without launching or replacing an app. */
export default class UpdateController {
  private state: UpdateStatus;

  private preferences: UpdatePreferences;

  private approved = false;

  private backend: UpdateBackend | undefined;

  private backendPromise: Promise<UpdateBackend> | undefined;

  private checkPromise: Promise<UpdateStatus> | undefined;

  private downloadPromise: Promise<UpdateStatus> | undefined;

  private generation = 0;

  private readonly options: {
    currentVersion: string,
    supported: boolean,
    reason?: UpdateStatus['reason'],
    preferences: UpdatePreferences,
    loadBackend: () => Promise<UpdateBackend>,
    onChange: (status: UpdateStatus) => void,
    onError: (error: unknown) => void,
  };

  constructor(options: UpdateController['options']) {
    this.options = options;
    this.preferences = options.preferences;
    this.state = { supported: options.supported, reason: options.reason, phase: 'idle', installOnQuit: false, manual: false };
  }

  getStatus = () => ({ ...this.state });

  private publish(patch: Partial<UpdateStatus>) {
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.getStatus());
  }

  private getBackend() {
    this.backendPromise ??= this.options.loadBackend().then((backend) => {
      this.backend = backend;
      backend.installOnQuit(false);
      return backend;
    }).catch((error: unknown) => {
      this.backendPromise = undefined;
      throw error;
    });
    return this.backendPromise;
  }

  setPreferences(preferences: UpdatePreferences) {
    const revoked = !preferences.enabled || (preferences.mode === 'ask' && this.preferences.mode !== 'ask');
    this.preferences = preferences;
    if (revoked) {
      this.approved = false;
      this.generation += 1;
      this.backend?.cancel();
      if (this.state.phase === 'downloading') this.publish({ phase: 'available', percent: undefined });
    }
    const installOnQuit = this.state.phase === 'ready'
      && (this.approved || (preferences.enabled && preferences.mode === 'automatic'));
    this.backend?.installOnQuit(installOnQuit);
    this.publish({ installOnQuit });
    if (this.options.supported && this.state.phase === 'available' && preferences.enabled && preferences.mode === 'automatic') this.download(false);
  }

  progress(percent: number) {
    if (this.state.phase !== 'downloading') return;
    const rounded = Math.max(0, Math.min(100, Math.floor(percent)));
    if (rounded !== this.state.percent) this.publish({ percent: rounded });
  }

  check(manual = false): Promise<UpdateStatus> {
    if (this.checkPromise != null) return this.checkPromise;
    if (this.downloadPromise != null || this.state.phase === 'ready') return Promise.resolve(this.getStatus());
    if ((!manual && !this.preferences.enabled) || ['offline', 'development', 'multiple-instances'].includes(this.state.reason ?? '')) return Promise.resolve(this.getStatus());
    this.checkPromise = this.performCheck(manual).finally(() => { this.checkPromise = undefined; });
    return this.checkPromise;
  }

  private async performCheck(manual: boolean) {
    this.publish({ phase: 'checking', manual, percent: undefined });
    try {
      const backend = await this.getBackend();
      const result = await backend.check();
      if (result?.available && isApplicableUpdate(this.options.currentVersion, result.version)) {
        this.publish({ phase: 'available', version: result.version });
        if (this.options.supported && this.preferences.enabled && this.preferences.mode === 'automatic') await this.download(false);
      } else {
        this.publish({ phase: 'up-to-date', version: undefined });
      }
    } catch (error) {
      this.options.onError(error);
      this.publish({ phase: 'error' });
    }
    return this.getStatus();
  }

  download(approved = true): Promise<UpdateStatus> {
    if (this.downloadPromise != null) return this.downloadPromise;
    if (!this.options.supported || this.state.version == null || !['available', 'error'].includes(this.state.phase)) return Promise.resolve(this.getStatus());
    this.approved = approved;
    this.downloadPromise = this.performDownload().finally(() => { this.downloadPromise = undefined; });
    return this.downloadPromise;
  }

  private async performDownload() {
    const { generation } = this;
    this.publish({ phase: 'downloading', percent: 0, manual: this.state.manual || this.approved });
    try {
      const backend = await this.getBackend();
      if (generation !== this.generation) return this.getStatus();
      // The updater verifies the downloaded artifact's SHA-512 before resolving.
      // Arm before download so electron-updater registers its normal-quit handler
      // when verification finishes. Failed/cancelled downloads are disarmed.
      backend.installOnQuit(this.approved || (this.preferences.enabled && this.preferences.mode === 'automatic'));
      await backend.download();
      if (generation !== this.generation) return this.getStatus();
      const installOnQuit = this.approved || (this.preferences.enabled && this.preferences.mode === 'automatic');
      backend.installOnQuit(installOnQuit);
      this.publish({ phase: 'ready', percent: 100, installOnQuit });
    } catch (error) {
      if (generation === this.generation) {
        this.options.onError(error);
        this.backend?.installOnQuit(false);
        this.publish({ phase: 'error', installOnQuit: false, percent: undefined });
      }
    }
    return this.getStatus();
  }

  approveInstall() {
    if (this.state.phase === 'ready' && this.options.supported) {
      this.approved = true;
      this.backend?.installOnQuit(true);
      this.publish({ installOnQuit: true });
    }
    return this.getStatus();
  }
}
