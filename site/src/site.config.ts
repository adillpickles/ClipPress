// Single source of truth for every release / download / link fact on this site.
//
// To publish a new preview:
//   1. set `tag` to the published GitHub tag (e.g. "v0.1.0-beta.4")
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
  tag: 'v0.1.0-beta.3',
  releaseLabel: 'v0.1.0 Beta 3',
  assetFileName: 'ClipPress-Windows-x64.exe',
  assetSize: '238 MB',
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
export function releaseMetaLine(): string {
  if (PREVIEW.status !== 'ready') return `${PREVIEW.platform} · preview build coming soon`;
  return `${PREVIEW.platform} · ${PREVIEW.releaseLabel} · unsigned preview build`;
}
