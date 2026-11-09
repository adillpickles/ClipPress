import type { Config } from './types.js';

/**
 * What Settings' "Reset all settings" leaves alone. Every other setting goes back to its default, and
 * useUserSettingsRoot's table has to name it (a new setting that's missing from both is a type error).
 */
export const keptByResetAllSettings = [
  // ClipPress's own bookkeeping, and old settings only read to migrate them.
  'version',
  'lastAppVersion',
  'sizeLimitCodec',
  'sizeLimitQuality',
  // What the person has done, not how ClipPress is set up.
  'recentFiles',
  'recentCustomOutDirs',
  'shelfExports',
  // How they left things.
  'shelfOrder',
  'windowBounds',
  'darkMode',
  'playbackVolume',
  // Settings moves the projects itself when this goes back.
  'projectFileLocation',
] as const satisfies readonly (keyof Config)[];

export type ResetByResetAllSettings = Exclude<keyof Config, typeof keptByResetAllSettings[number]>;
