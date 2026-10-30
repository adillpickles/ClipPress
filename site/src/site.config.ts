// Single source of truth for every release / download / link fact on this site.
//
// The download links follow the newest published release by themselves: main.ts asks GitHub for it when the page
// loads, so a new release needs no site change. PREVIEW below is the fallback, used until GitHub answers and when it
// can't (offline, rate-limited). Keep it on a published release; to move it:
//   1. set `tag` to the published GitHub tag (e.g. "v0.1.0-beta.6")
//   2. confirm `assetFileName` matches the uploaded asset exactly
//   3. update `releaseLabel` and `assetSize` to match the release
//   4. rebuild + redeploy
//
// Set `status` back to "coming-soon" only when there is no live asset. In that
// mode every download link points at the Releases page instead of a file, so
// visitors can never hit a 404.
//
// NOTE: SITE.siteUrl stays empty until the production domain is chosen. Do not
// invent one — index.html deliberately ships without canonical/og:url until
// then (see the TODO in <head>).

export const SITE = {
  siteUrl: '',
  productName: 'ClipPress',
  githubOwner: 'adillpickles',
  githubRepo: 'adillpickles/ClipPress',
} as const;

export const SOURCE_URL = `https://github.com/${SITE.githubRepo}`;
export const RELEASES_URL = `${SOURCE_URL}/releases`;
// Newest first; pre-releases included (every ClipPress release is one while in beta).
export const RELEASES_API_URL = `https://api.github.com/repos/${SITE.githubRepo}/releases?per_page=10`;
// The installer every release publishes (.github/workflows/build.yml).
export const INSTALLER_ASSET_NAME = /^ClipPress-Setup-[\w.-]+\.exe$/;
export const FORK_URL = `${SOURCE_URL}/fork`;
export const LICENSE_URL = `${SOURCE_URL}/blob/master/LICENSE`;
export const INSTALL_NOTES_URL = `${SOURCE_URL}/blob/master/docs/installation.md`;
export const CONTRIBUTING_URL = `${SOURCE_URL}/blob/master/CONTRIBUTING.md`;
export const LOSSLESSCUT_URL = 'https://github.com/mifi/lossless-cut';

export type PreviewStatus = 'coming-soon' | 'ready';

// Every value below is copied from the published GitHub release. Do not edit
// one without checking the release page.
export const PREVIEW = {
  status: 'ready' as PreviewStatus,
  // Static no-JS fallback copy in index.html mirrors `tag`, `releaseLabel`,
  // `platform` and `assetFileName` — scripts/lint.mjs enforces the sync.
  tag: 'v0.1.0-beta.6',
  releaseLabel: 'v0.1.0 Beta 6',
  assetFileName: 'ClipPress-Setup-0.1.0-beta.6.exe',
  assetSize: '150 MB',
  platform: 'Windows 10/11 x64',
} as const;

export function previewAssetUrl(): string | null {
  if (PREVIEW.status !== 'ready') return null;
  return `${RELEASES_URL}/download/${PREVIEW.tag}/${PREVIEW.assetFileName}`;
}

export function previewDownloadHref(): string {
  return previewAssetUrl() ?? RELEASES_URL;
}

// Short factual line shown under the hero CTA and in the footer download block.
// Deliberately minimal: release stage and platform only. Version, build and
// signing details live on GitHub Releases, not in the homepage pitch.
export function releaseMetaLine(): string {
  return `ClipPress is in early beta. Currently available for ${PREVIEW.platform}.`;
}
