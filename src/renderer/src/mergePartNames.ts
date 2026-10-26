/**
 * Names for the clip files a merged-only export makes and then deletes: a name a file already has in the folder (an
 * earlier export's clip of the same name, say) gets "-part2", "-part3"… instead, so that file is never written over
 * nor deleted. Names compare without case, as on Windows.
 */
export default function getMergePartNames(fileNames: readonly string[], namesInFolder: ReadonlySet<string>) {
  const taken = new Set([...namesInFolder].map((name) => name.toLowerCase()));
  return fileNames.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${stem}-part${n}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
