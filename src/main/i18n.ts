import i18n from 'i18next';
import Backend from 'i18next-fs-backend';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';

import { commonI18nOptions, loadPath, addPath } from './i18nCommon.js';
import { getLanguageFromSystem } from '../common/i18n.js';

// See also renderer

// https://github.com/i18next/i18next/issues/869
export default await i18n
  .use(Backend)
  // Not app.getLocale(): it needs Chromium's language files, and only the English one ships.
  .use({ type: 'languageDetector', async: false, detect: () => getLanguageFromSystem(app.getPreferredSystemLanguages()) })
  // See also i18next.config.base.ts
  .init({
    ...commonI18nOptions,

    backend: {
      loadPath,
      addPath,
    },
  });
