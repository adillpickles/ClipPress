import type { PlatformPath } from 'node:path';

export type ComparePathApi = Pick<PlatformPath, 'sep' | 'join' | 'resolve' | 'parse' | 'format'>;

const windowsSeparator = '\\';

/**
 * ClipPress must never write over, or delete, a file it is currently reading from.
 *
 * Every export ultimately resolves to a destination path, and several steps along the
 * way (the final rename, the overwrite handling, the auto-naming pass) are allowed to
 * delete whatever already sits at that destination. If the destination ever resolves to
 * the file that is loaded in the editor, those steps destroy the user's original.
 *
 * These helpers are deliberately pure and take their `path` implementation as an
 * argument, so the same logic can be unit tested for both posix and win32 semantics and
 * reused from the renderer (which only reaches node through `window.require`).
 */

/**
 * Case folding matches the filesystem, not the locale: Windows and macOS compare file
 * names case-insensitively, Linux does not. We treat `isWindows` as the only case-folding
 * platform here because that is the platform ClipPress ships to, and folding on Linux
 * would wrongly refuse two genuinely different names.
 */
export function normalizeComparablePath({ filePath, path, caseInsensitive }: {
  filePath: string,
  path: ComparePathApi,
  caseInsensitive?: boolean | undefined,
}) {
  const resolved = path.resolve(filePath);
  const foldCase = caseInsensitive ?? path.sep === windowsSeparator;
  return foldCase ? resolved.toLowerCase() : resolved;
}

/** True if both paths denote the same file on disk, ignoring separators and `.`/`..` noise. */
export function isSameFilePath({ a, b, path, caseInsensitive }: {
  a: string | undefined,
  b: string | undefined,
  path: ComparePathApi,
  caseInsensitive?: boolean | undefined,
}) {
  if (a == null || b == null) return false;
  return normalizeComparablePath({ filePath: a, path, caseInsensitive })
    === normalizeComparablePath({ filePath: b, path, caseInsensitive });
}

/** True if `candidate` is one of the files the current export is reading from. */
export function isProtectedSourcePath({ candidate, protectedPaths, path, caseInsensitive }: {
  candidate: string | undefined,
  protectedPaths: readonly (string | undefined)[],
  path: ComparePathApi,
  caseInsensitive?: boolean | undefined,
}) {
  if (candidate == null) return false;
  return protectedPaths.some((protectedPath) => isSameFilePath({ a: candidate, b: protectedPath, path, caseInsensitive }));
}

/**
 * Inserts a disambiguating marker before the extension, so `clip.mp4` becomes
 * `clip (clip).mp4` rather than `clip.mp4 (clip)`. Extensionless names just get the
 * marker appended.
 */
export function addFileNameMarker({ fileName, marker, path }: {
  fileName: string,
  marker: string,
  path: ComparePathApi,
}) {
  const { dir, name, ext } = path.parse(fileName);
  const markedName = `${name} (${marker})`;
  return dir.length > 0 ? path.join(dir, `${markedName}${ext}`) : `${markedName}${ext}`;
}

export interface SourceSafeFileNameAdjustment {
  from: string,
  to: string,
}

const defaultMarker = 'clip';
const maxDisambiguationAttempts = 1000;

/**
 * Returns a file name that is guaranteed not to resolve to a protected source path and
 * not to collide with a name already chosen for this same export.
 *
 * Callers pass `isTaken` so that in-flight names (the other segments of this export) are
 * treated as reserved even though nothing exists on disk for them yet.
 */
export function makeSourceSafeFileName({ fileName, outputDir, protectedPaths, path, isTaken, caseInsensitive, marker = defaultMarker }: {
  fileName: string,
  outputDir: string,
  protectedPaths: readonly (string | undefined)[],
  path: ComparePathApi,
  isTaken?: ((candidateFileName: string) => boolean) | undefined,
  caseInsensitive?: boolean | undefined,
  marker?: string | undefined,
}) {
  const conflicts = (candidateFileName: string) => isProtectedSourcePath({
    candidate: path.join(outputDir, candidateFileName),
    protectedPaths,
    path,
    caseInsensitive,
  }) || (isTaken?.(candidateFileName) ?? false);

  if (!conflicts(fileName)) return fileName;

  for (let attempt = 1; attempt <= maxDisambiguationAttempts; attempt += 1) {
    const candidate = addFileNameMarker({
      fileName,
      marker: attempt === 1 ? marker : `${marker} ${attempt}`,
      path,
    });
    if (!conflicts(candidate)) return candidate;
  }

  // Unreachable in practice; a stable fallback beats throwing inside a naming helper.
  return addFileNameMarker({ fileName, marker: `${marker} ${Date.now()}`, path });
}

export interface SourceSafeFileNamesResult {
  fileNames: string[],
  adjustments: SourceSafeFileNameAdjustment[],
}

/**
 * Rewrites any generated output name that would land on a source file.
 *
 * This runs on every export path, whatever produced the names (auto naming, a user
 * template, or a fallback template), because "the destination is never the source" is an
 * invariant of the app rather than a property of one naming scheme.
 */
export function makeSourceSafeFileNames({ fileNames, outputDir, protectedPaths, path, caseInsensitive, marker }: {
  fileNames: readonly string[],
  outputDir: string,
  protectedPaths: readonly (string | undefined)[],
  path: ComparePathApi,
  caseInsensitive?: boolean | undefined,
  marker?: string | undefined,
}): SourceSafeFileNamesResult {
  const chosen = new Set<string>();
  const adjustments: SourceSafeFileNameAdjustment[] = [];

  const key = (fileName: string) => (
    (caseInsensitive ?? path.sep === windowsSeparator) ? fileName.toLowerCase() : fileName
  );

  const safeFileNames = fileNames.map((fileName) => {
    const safeFileName = makeSourceSafeFileName({
      fileName,
      outputDir,
      protectedPaths,
      path,
      caseInsensitive,
      marker,
      isTaken: (candidate) => chosen.has(key(candidate)),
    });
    chosen.add(key(safeFileName));
    if (safeFileName !== fileName) adjustments.push({ from: fileName, to: safeFileName });
    return safeFileName;
  });

  return { fileNames: safeFileNames, adjustments };
}
