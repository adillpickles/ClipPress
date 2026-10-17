export type UpdateMode = 'automatic' | 'ask';

export interface UpdatePreferences {
  enabled: boolean,
  mode: UpdateMode,
}

export interface UpdateStatus {
  supported: boolean,
  /** Why updates are not installed. `settings-in-installation-folder`: installing would delete settings kept there. */
  reason?: 'portable' | 'development' | 'platform' | 'offline' | 'multiple-instances' | 'settings-in-installation-folder' | undefined,
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error',
  version?: string | undefined,
  percent?: number | undefined,
  installOnQuit: boolean,
  manual: boolean,
}
