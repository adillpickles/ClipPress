import i18n from 'i18next';

/**
 * A version as people read it: "0.1.0-beta.6" is "Beta 6", "0.1.0-beta.6.1" "Beta 6.1"; anything else keeps its number ("v1.2.0"). Used
 * wherever the app names a release (What's new, the update notice, Settings > Updates and the title bar's
 * "New version!" menu), so they all agree. It lives here so the main process's menu can use it too.
 */
export default function formatVersion(version: string) {
  // A point release of a beta ("0.1.0-beta.6.1") is "Beta 6.1".
  const beta = /^\d+\.\d+\.\d+-beta\.(\d+(?:\.\d+)?)$/.exec(version);
  return beta != null ? i18n.t('Beta {{number}}', { number: beta[1] }) : `v${version}`;
}
