import type { RecentFile } from '../../../common/types';

export const maxRecentFiles = 8;

/** The same file, allowing for Windows paths being case-insensitive and either slash. */
export function isSameRecentPath(a: string, b: string, caseInsensitive: boolean) {
  const normalise = (p: string) => {
    const slashes = p.replaceAll('\\', '/');
    return caseInsensitive ? slashes.toLowerCase() : slashes;
  };
  return normalise(a) === normalise(b);
}

/** Puts a just-opened file first, without duplicates, keeping the list short. */
export function addRecentFile(list: readonly RecentFile[], path: string, openedAt: number, caseInsensitive: boolean): RecentFile[] {
  return [
    { path, openedAt },
    ...list.filter((item) => !isSameRecentPath(item.path, path, caseInsensitive)),
  ].slice(0, maxRecentFiles);
}

export function removeRecentFile(list: readonly RecentFile[], path: string, caseInsensitive: boolean): RecentFile[] {
  return list.filter((item) => !isSameRecentPath(item.path, path, caseInsensitive));
}
