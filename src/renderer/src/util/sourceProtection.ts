import type { PlatformPath } from 'node:path';

import {
  findProtectedSourceCollision,
  isProtectedSourcePath,
  isSameFilePath,
  makeSourceSafeFileNames,
} from './sourcePathProtection';
import { UserFacingError } from '../../errors';

export type { SourceSafeFileNameAdjustment } from './sourcePathProtection';
export { getMergeProtectedPaths } from './sourcePathProtection';

const path: PlatformPath = window.require('path');

/**
 * Renderer-bound wrappers around the pure helpers in `sourcePathProtection`, so callers
 * do not each have to reach through `window.require` for the platform's path module.
 */

export function isSameFile(a: string | undefined, b: string | undefined) {
  return isSameFilePath({ a, b, path });
}

export function isSourcePath(candidate: string | undefined, protectedPaths: readonly (string | undefined)[]) {
  return isProtectedSourcePath({ candidate, protectedPaths, path });
}

export function makeSafeOutFileNames({ fileNames, outputDir, protectedPaths }: {
  fileNames: readonly string[],
  outputDir: string,
  protectedPaths: readonly (string | undefined)[],
}) {
  return makeSourceSafeFileNames({ fileNames, outputDir, protectedPaths, path });
}

/**
 * The invariant every export path must satisfy before anything is written or deleted.
 *
 * Reached only if all the earlier naming safeguards were bypassed, so it throws rather
 * than silently repairing the name: at this point we no longer know which of the layers
 * above is broken, and continuing risks destroying the user's original file.
 */
export function assertOutPathsNotSource({ outPaths, protectedPaths, message }: {
  outPaths: readonly (string | undefined)[],
  protectedPaths: readonly (string | undefined)[],
  message: string,
}) {
  const offending = findProtectedSourceCollision({ outPaths, protectedPaths, path });
  if (offending != null) {
    console.error('Refusing to export onto a source file', offending, protectedPaths);
    throw new UserFacingError(message);
  }
}
