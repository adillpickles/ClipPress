import type { AboutPanelOptionsOptions } from 'electron';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import { t } from 'i18next';

import { copyrightYear } from './common.js';
import { isLinux } from './util.js';
import isStoreBuild from './isStoreBuild.js';


// eslint-disable-next-line import/prefer-default-export
export function getAboutPanelOptions() {
  const appVersion = app.getVersion();

  // Note: the upstream copyright line is required, not decorative. ClipPress is a
  // GPL-2.0 fork of LosslessCut, so the original author's notice stays visible
  // alongside ClipPress's own.
  const aboutPanelLines = [
    t('Fast, lightweight desktop video clipping with built-in size-limited export for shareable clips.'),
    '',
    `${t('Copyright')} © 2025-${copyrightYear} Adil Ahmed`,
    `${t('Based on LosslessCut')} — ${t('Copyright')} © 2016-${copyrightYear} Mikael Finstad ❤️ 🇳🇴`,
    '',
    t('Licensed under GPL-2.0-only. Media processing by ffmpeg.'),
  ];

  const aboutPanelOptions: AboutPanelOptionsOptions = {
    applicationName: 'ClipPress',
    copyright: aboutPanelLines.join('\n'),
    version: '', // not very useful (supported on MacOS only, and same as applicationVersion)
  };

  // https://github.com/electron/electron/issues/18918
  // https://github.com/mifi/lossless-cut/issues/1537
  if (isLinux) {
    aboutPanelOptions.applicationVersion = appVersion;
  } else if (isStoreBuild) {
    // https://github.com/mifi/lossless-cut/issues/1882
    aboutPanelOptions.applicationVersion = t('{{appStoreType}} edition, based on GitHub v{{appVersion}}', { appStoreType: process.windowsStore ? 'Microsoft Store' : 'App Store', appVersion });
  }

  return aboutPanelOptions;
}
