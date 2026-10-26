// Only the functions used: the whole of semver is ~50 KB of the startup bundle.
import valid from 'semver/functions/valid';
import lt from 'semver/functions/lt';
import gt from 'semver/functions/gt';
import lte from 'semver/functions/lte';
import rcompare from 'semver/functions/rcompare';

export interface ReleaseNote {
  version: string,
  highlightsMd?: string | undefined,
}

/** No empty popup, invalid-version exception, or upstream/downgrade announcement. */
export function getReleaseNotes(versions: ReleaseNote[], previousVersion: string, currentVersion: string) {
  if (valid(previousVersion) == null || valid(currentVersion) == null || !lt(previousVersion, currentVersion)) return [];
  return versions.filter(({ version, highlightsMd }) => valid(version) != null
    && highlightsMd?.trim() && gt(version, previousVersion) && lte(version, currentVersion))
    .sort(({ version: a }, { version: b }) => rcompare(a, b));
}
