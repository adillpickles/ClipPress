import type { PlatformPath } from 'node:path';

/** Upper case, one character at a time, as Windows compares file names: 'ß' stays 'ß' rather than becoming 'SS'. */
function toWindowsUpperCase(name: string) {
  return [...name].map((char) => {
    const upper = char.toUpperCase();
    return [...upper].length === 1 ? upper : char;
  }).join('');
}

/**
 * Makes a function that gives each project file path a key: the same key for every path to the
 * same file, so that saves to it are told apart by file rather than by how its path is written.
 *
 * The same file can be reached by paths written differently: in another case on Windows
 * (`D:\Videos` and `d:\videos`), with `/` or `..`, or through another name of its folder (a short
 * 8.3 name, a junction or symbolic link, a mapped or `subst` drive), so the folder is resolved
 * with `realpath`. The file itself need not exist yet.
 *
 * Each path keeps the key it first got, even if its folder can be resolved only later: a key
 * that changed would separate saves to the same path. Case is ignored only where it is on most
 * folders (`caseInsensitive`, Windows): elsewhere two names differing in case can be two files.
 */
export default function createProjectFilePathKey({ path, caseInsensitive, realpath }: {
  path: Pick<PlatformPath, 'resolve' | 'dirname' | 'basename' | 'join'>,
  caseInsensitive: boolean,
  /** Resolves a folder to its canonical path. Throws if it cannot, for example because it does not exist. */
  realpath: (dir: string) => string,
}) {
  const keys = new Map<string, string>();
  return (filePath: string) => {
    let key = keys.get(filePath);
    if (key == null) {
      const resolved = path.resolve(filePath);
      let dir = path.dirname(resolved);
      try {
        dir = realpath(dir);
      } catch {
        // As written, then.
      }
      key = path.join(dir, path.basename(resolved));
      if (caseInsensitive) key = toWindowsUpperCase(key);
      keys.set(filePath, key);
    }
    return key;
  };
}
