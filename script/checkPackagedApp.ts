import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  auditPackagedApp,
  bytesPerMib,
  readAsarManifest,
} from './packagedAppAudit.ts';

/**
 * Inspects a built app directory and fails the build if it is wrong.
 *
 * Run automatically by the `pack-*` scripts. Defaults to the Windows output because that
 * is what `yarn pack-win` produces; pass a directory to check another platform's.
 */

const defaultUnpackedDirs: Record<string, string> = {
  win32: 'dist/win-unpacked',
  darwin: 'dist/mac',
  linux: 'dist/linux-unpacked',
};

const [dirArg] = process.argv.slice(2);
const unpackedDir = resolve(dirArg ?? defaultUnpackedDirs[process.platform] ?? 'dist/win-unpacked');
const resourcesDir = join(unpackedDir, 'resources');

const manifest = await readAsarManifest(join(resourcesDir, 'app.asar'));
const resourceFileNames = await readdir(resourcesDir);

const result = auditPackagedApp({ manifest, resourceFileNames, platform: process.platform });

console.log(`app.asar: ${(result.asarBytes / bytesPerMib).toFixed(1)} MiB across ${result.packagedModuleCount} packages`);
console.log('Largest packaged dependencies:');
for (const { name, bytes } of result.largestModules) {
  console.log(`  ${name.padEnd(28)} ${(bytes / bytesPerMib).toFixed(2)} MiB`);
}

if (result.problems.length > 0) {
  console.error(`\n${result.problems.length} problem(s) with the packaged app:`);
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nPackaged app looks correct.');
}
