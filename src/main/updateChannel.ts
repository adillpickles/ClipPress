import semver from 'semver';

export interface ReleaseSummary {
  tag_name: string,
  draft?: boolean | undefined,
  prerelease?: boolean | undefined,
}

/** Tags are published as `v0.1.0-beta.3`; semver wants them without the `v`. */
export function parseReleaseVersion(tagName: string) {
  const version = tagName.replace(/^v/, '');
  return semver.valid(version) != null ? version : undefined;
}

/**
 * Picks the newest release the running build should be told about.
 *
 * ClipPress ships a preview channel: every release so far is a GitHub prerelease. That
 * is why asking for `/releases/latest` never worked, since that endpoint deliberately
 * skips prereleases and drafts.
 *
 * Channel rule: a build already on a prerelease is offered newer prereleases, because
 * that is the channel its user opted into. A build on a stable version is only ever
 * offered stable releases, so a beta is never presented as if it were the next stable.
 */
export function selectNewerRelease({ currentVersion, releases }: {
  currentVersion: string,
  releases: readonly ReleaseSummary[],
}) {
  if (semver.valid(currentVersion) == null) return undefined;

  const acceptPrereleases = semver.prerelease(currentVersion) != null;

  const candidates = releases
    .filter((release) => !release.draft)
    .filter((release) => acceptPrereleases || !release.prerelease)
    .map((release) => parseReleaseVersion(release.tag_name))
    .filter((version): version is string => version != null);

  const [newest] = candidates.sort(semver.rcompare);
  if (newest == null) return undefined;

  return semver.lt(currentVersion, newest) ? newest : undefined;
}
