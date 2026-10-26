/** The longest file name most file systems take. */
const maxNameLength = 255;

/**
 * Names for the clip files a merged-only export makes and then deletes: a name a file already has in the folder (an
 * earlier export's clip of the same name, say) gets "-part2", "-part3"… instead, so that file is never written over
 * nor deleted. Names compare without case, as on Windows, and stay within 255 characters. `isTaken` checks the folder
 * and throws when it can't tell, which stops the export rather than risk a file.
 */
export default async function getMergePartNames(fileNames: readonly string[], isTaken: (name: string) => Promise<boolean>) {
  const chosen = new Set<string>();
  const names: string[] = [];
  for (const name of fileNames) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    // eslint-disable-next-line no-await-in-loop
    for (let n = 2; chosen.has(candidate.toLowerCase()) || await isTaken(candidate); n += 1) {
      const suffix = `-part${n}`;
      candidate = `${stem.slice(0, maxNameLength - ext.length - suffix.length)}${suffix}${ext}`;
    }
    chosen.add(candidate.toLowerCase());
    names.push(candidate);
  }
  return names;
}
