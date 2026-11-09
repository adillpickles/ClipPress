const separator = '\n-----\n';
const sectionHeader = /^The following software may be included in this product: (.+?)\. (?=A copy of the source code|This software contains)/;

/**
 * Keeps only the shipped packages in `yarn licenses generate-disclaimer`'s text, which lists every package of the
 * workspace, build tools included. `missing` names shipped packages it has no notice for.
 */
export function filterLicenseDisclaimer(disclaimer: string, shipped: ReadonlySet<string>) {
  const found = new Set<string>();
  const sections = disclaimer.split(separator).flatMap((section) => {
    const trimmed = section.replace(/^\n+/, '');
    const match = sectionHeader.exec(trimmed);
    if (match == null) return [section]; // The opening statement.
    const names = match[1]!.split(', ');
    const kept = names.filter((name) => shipped.has(name));
    kept.forEach((name) => found.add(name));
    if (kept.length === 0) return [];
    return [`\n${trimmed.replace(match[1]!, kept.join(', '))}`];
  });
  return { text: sections.join(separator), missing: [...shipped].filter((name) => !found.has(name)).sort() };
}

/** The given packages and all they depend on, as installed. `read` answers undefined for one that isn't. */
export async function findRuntimePackages(roots: readonly string[], read: (name: string) => Promise<{ dependencies?: Record<string, string> } | undefined>) {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (!seen.has(name)) {
      // eslint-disable-next-line no-await-in-loop
      const manifest = await read(name);
      if (manifest != null) {
        seen.add(name);
        queue.push(...Object.keys(manifest.dependencies ?? {}));
      }
    }
  }
  return seen;
}
