import type { PlatformPath } from 'node:path';

export type PathApi = Pick<PlatformPath, 'sep' | 'join' | 'resolve' | 'isAbsolute'>;

const windowsSeparator = '\\';
const parentSegment = '..';
const anySeparator = /[/\\]/;
const posixSeparator = /\//;
const driveLetterPrefix = /^[a-zA-Z]:/;

/**
 * True if writing `fileName` relative to `outputDir` would escape `outputDir`.
 *
 * The output file name template is user supplied and, when `safeOutputFileName` is
 * turned off, is not sanitized at all, so it can contain path separators. Nested
 * names are a supported feature; escaping the output directory is not. This check
 * runs regardless of `safeOutputFileName`.
 *
 * Windows-only forms (drive letters, backslash separators, UNC roots) are rejected
 * only on Windows, because a backslash and a colon are both legal characters in a
 * POSIX file name.
 */
export function isUnsafeOutputFileName({ fileName, outputDir, path }: {
  fileName: string,
  outputDir: string,
  path: PathApi,
}): boolean {
  const isWindowsPath = path.sep === windowsSeparator;

  // Any parent-directory segment, written with either separator this platform honours
  if (fileName.split(isWindowsPath ? anySeparator : posixSeparator).includes(parentSegment)) return true;

  if (path.isAbsolute(fileName)) return true;
  // Drive-relative forms like "C:evil.exe", which isAbsolute does not catch
  if (isWindowsPath && driveLetterPrefix.test(fileName)) return true;

  // Belt and braces: the resolved path must stay strictly below outputDir.
  // resolve() also normalizes a trailing separator, so a drive root works.
  const normalize = (p: string) => (isWindowsPath ? path.resolve(p).toLowerCase() : path.resolve(p));
  const normalizedDir = normalize(outputDir);
  const prefix = normalizedDir.endsWith(path.sep) ? normalizedDir : `${normalizedDir}${path.sep}`;
  const normalizedOutPath = normalize(path.join(outputDir, fileName));

  return normalizedOutPath === normalizedDir || !normalizedOutPath.startsWith(prefix);
}
