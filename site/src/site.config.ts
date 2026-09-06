// Single source of truth for all release / download links on this site.
// To publish a new preview: set `tag` to the published GitHub tag (e.g.
// "v0.1.0-beta.3"), confirm `assetFileName` matches the uploaded asset, then
// rebuild + redeploy. Only set `status` back to "coming-soon" if there is no
// live asset — in that mode the site links to the Releases page instead of
// a file, so visitors can't hit a 404.
//
// NOTE: SITE.siteUrl stays empty until the production domain is chosen. Do
// not invent one — index.html deliberately ships without canonical/og:url
// until then (see the TODO in <head>).

export const SITE = {
  siteUrl: '',
  productName: 'ClipPress',
  githubOwner: 'adillpickles',
  githubRepo: 'adillpickles/ClipPress',
} as const;

export const SOURCE_URL = `https://github.com/${SITE.githubRepo}`;
export const RELEASES_URL = `${SOURCE_URL}/releases`;
export const LICENSE_URL = `${SOURCE_URL}/blob/master/LICENSE`;
export const INSTALL_NOTES_URL = `${SOURCE_URL}/blob/master/docs/installation.md`;
export const CONTRIBUTING_URL = `${SOURCE_URL}/blob/master/CONTRIBUTING.md`;
export const LOSSLESSCUT_URL = 'https://github.com/mifi/lossless-cut';

export type PreviewStatus = 'coming-soon' | 'ready';

export const PREVIEW = {
  status: 'ready' as PreviewStatus,
  // Only used when status === "ready". Static no-JS fallback copy in
  // index.html mirrors this tag + asset name (lint enforces the sync).
  tag: 'v0.1.0-beta.3',
  assetFileName: 'ClipPress-Windows-x64.exe',
  label: 'Preview',
} as const;

export function previewAssetUrl(): string | null {
  if (PREVIEW.status !== 'ready') return null;
  return `${RELEASES_URL}/download/${PREVIEW.tag}/${PREVIEW.assetFileName}`;
}

export function previewDownloadHref(): string {
  return previewAssetUrl() ?? RELEASES_URL;
}
