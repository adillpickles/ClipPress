import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getLanguageFromSystem } from '../../common/i18n';
import createJsonFileBackend from '../../common/i18nJsonBackend';

const { readFileSync } = window.require('fs');

const remote = window.require('@electron/remote');
const { i18n: { commonI18nOptions, loadPath }, configStore } = remote.require('./index.js');

/**
 * The language the page starts in: the saved one (null: the system's, detected below). Read now and the file read
 * synchronously (~1 ms), so the first render already has its text: no suspended render, and no change to the same
 * language once App mounts, which re-rendered every text before the first paint.
 */
export const startLanguage = configStore.get('language');


// See also main

// https://github.com/i18next/react-i18next/blob/master/example/react/src/i18n.js
// https://github.com/i18next/i18next/issues/869
i18n
  .use(createJsonFileBackend({ loadPath: (lng, ns) => loadPath(lng as Parameters<typeof loadPath>[0], ns), readText: (path) => readFileSync(path, 'utf8') }))
  // Not app.getLocale(): it needs Chromium's language files, and only the English one ships.
  .use({ type: 'languageDetector', async: false, detect: () => getLanguageFromSystem(remote.app.getPreferredSystemLanguages()) })
  .use(initReactI18next)
  // See also i18next.config.base.ts
  .init({
    ...commonI18nOptions,
    ...(startLanguage != null && { lng: startLanguage }),
    initAsync: false,

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
  });

// eslint-disable-next-line unicorn/prefer-export-from
export default i18n;
