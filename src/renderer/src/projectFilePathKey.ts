import type { PlatformPath } from 'node:path';

/** Upper case, one character at a time, as Windows compares file names: 'ß' stays 'ß' rather than becoming 'SS'. */
function toWindowsUpperCase(name: string) {
  return [...name].map((char) => {
    const upper = char.toUpperCase();
    return [...upper].length === 1 ? upper : char;
  }).join('');
}

export interface ProjectFilePathKey {
  key: string,
  /**
   * Whether the key identifies the file. When the path's folder cannot be resolved (it is
   * missing, or unreachable for a moment, like a network drive that is reconnecting), the key is
   * only the path as written, and another path to the same file may get another key. Asking again
   * later can then give the real key.
   */
  resolved: boolean,
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
 * A key is remembered only once it is resolved: a path whose folder could not be resolved is
 * resolved again the next time, rather than keeping a key that may separate it from its other
 * paths for good. Meanwhile, a folder that exists but cannot be resolved (as on some virtual or
 * RAM drives) is told apart by what it is (`identity`), and one that cannot be reached at all by
 * its path as written. Case is ignored only where it is on most folders (`caseInsensitive`,
 * Windows): elsewhere two names differing in case can be two files.
 */
export default function createProjectFilePathKey({ path, caseInsensitive, realpath, identity }: {
  path: Pick<PlatformPath, 'resolve' | 'dirname' | 'basename' | 'join'>,
  caseInsensitive: boolean,
  /** Resolves a folder to its canonical path. Throws if it cannot, for example because it does not exist. */
  realpath: (dir: string) => string,
  /** The volume and ID of a folder (`statSync` with `bigint`). Throws if it cannot be reached. */
  identity?: ((dir: string) => { dev: bigint, ino: bigint }) | undefined,
}) {
  const resolvedKeys = new Map<string, string>();
  return (filePath: string): ProjectFilePathKey => {
    const known = resolvedKeys.get(filePath);
    if (known != null) return { key: known, resolved: true };
    const absolute = path.resolve(filePath);
    let dir = path.dirname(absolute);
    let resolved = true;
    try {
      dir = realpath(dir);
    } catch {
      resolved = false;
      try {
        const id = identity?.(dir);
        // '<' and '>' are in no Windows path, nor at the start of an absolute one elsewhere.
        if (id != null && id.ino !== 0n) dir = `<${id.dev}:${id.ino}>`;
      } catch {
        // As written, for now.
      }
    }
    let key = path.join(dir, path.basename(absolute));
    if (caseInsensitive) key = toWindowsUpperCase(key);
    if (resolved) resolvedKeys.set(filePath, key);
    return { key, resolved };
  };
}
