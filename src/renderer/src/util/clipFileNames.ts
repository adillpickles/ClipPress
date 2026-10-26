/** Names that differ only in case are the same file on Windows. */
function createTakenNames() {
  const keys = new Set<string>();
  return {
    has: (fileName: string) => keys.has(fileName.toLowerCase()),
    add: (fileName: string) => { keys.add(fileName.toLowerCase()); },
  };
}

/** "Adil.mp4", or numbered when that name is taken: "Adil (2).mp4", "Adil (3).mp4"… */
export function numberFileName(fileName: string, n: number) {
  if (n < 2) return fileName;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}` : `${fileName} (${n})`;
}

/** One export's files named after their clips: a name two clips share gets a number on the second. */
export function uniqueClipFileNames(fileNames: readonly string[], isClipNamed: (index: number) => boolean) {
  const reserved = createTakenNames();
  fileNames.forEach((fileName, index) => { if (!isClipNamed(index)) reserved.add(fileName); });
  return fileNames.map((fileName, index) => {
    if (!isClipNamed(index)) return fileName;
    let n = 1;
    while (reserved.has(numberFileName(fileName, n))) n += 1;
    const unique = numberFileName(fileName, n);
    reserved.add(unique);
    return unique;
  });
}

/** The name, or the first numbered one, that isn't taken in the output folder. */
export async function findFreeFileName(fileName: string, isTaken: (name: string) => Promise<boolean>) {
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await isTaken(numberFileName(fileName, n))) n += 1;
  return numberFileName(fileName, n);
}
