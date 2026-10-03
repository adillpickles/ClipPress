export type UpdateMode = 'automatic' | 'ask';

export interface UpdatePreferences {
  enabled: boolean,
  mode: UpdateMode,
}

export interface UpdateStatus {
  supported: boolean,
  reason?: 'portable' | 'development' | 'platform' | 'offline' | 'multiple-instances' | undefined,
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error',
  version?: string | undefined,
  percent?: number | undefined,
  installOnQuit: boolean,
  manual: boolean,
}
