import semver from 'semver';

export interface ReleaseNote {
  version: string,
  highlightsMd?: string | undefined,
}

/** No empty popup, invalid-version exception, or upstream/downgrade announcement. */
export function getReleaseNotes(versions: ReleaseNote[], previousVersion: string, currentVersion: string) {
  if (semver.valid(previousVersion) == null || semver.valid(currentVersion) == null || !semver.lt(previousVersion, currentVersion)) return [];
  return versions.filter(({ version, highlightsMd }) => semver.valid(version) != null
    && highlightsMd?.trim() && semver.gt(version, previousVersion) && semver.lte(version, currentVersion))
    .sort(({ version: a }, { version: b }) => semver.rcompare(a, b));
}
