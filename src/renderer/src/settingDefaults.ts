import type { Config } from '../../common/types.js';

/**
 * The defaults of Settings' dropdowns, as in configStore.ts (settingDefaults.test.ts checks they match), for the ↺
 * beside each one that's off its default.
 */
const dropdownDefaults = {
  reducedMotion: 'user',
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
} as const satisfies Partial<Config>;

export default dropdownDefaults;
