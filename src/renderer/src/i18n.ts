import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getLanguageFromSystem } from '../../common/i18n';

const Backend = window.require('i18next-fs-backend');

const remote = window.require('@electron/remote');
const { i18n: { commonI18nOptions, loadPath, addPath } } = remote.require('./index.js');


// See also main

// https://github.com/i18next/react-i18next/blob/master/example/react/src/i18n.js
// https://github.com/i18next/i18next/issues/869
i18n
  .use(Backend)
  // Not app.getLocale(): it needs Chromium's language files, and only the English one ships.
  .use({ type: 'languageDetector', async: false, detect: () => getLanguageFromSystem(remote.app.getPreferredSystemLanguages()) })
  .use(initReactI18next)
  // See also i18next.config.base.ts
  .init({
    ...commonI18nOptions,

    backend: {
      loadPath,
      addPath,
    },

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
  });

// eslint-disable-next-line unicorn/prefer-export-from
export default i18n;
