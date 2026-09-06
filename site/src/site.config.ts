// Single source of truth for all release / download links on this site.
// To publish the preview: set `preview.status` to "ready", set `tag` to the
// published GitHub tag (e.g. "v0.1.0-beta.2"), confirm `assetFileName` matches
// the uploaded asset, then rebuild + redeploy. Nothing else needs editing.
//
// While `status` is "coming-soon" the site never links directly to an asset
// file. It links to the Releases page instead, so visitors can't hit a 404.

export const SITE = {
  siteUrl: 'https://clippress.app',
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
  status: 'coming-soon' as PreviewStatus,
  // Only used when status === "ready".
  tag: 'v0.1.0-beta.2',
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
