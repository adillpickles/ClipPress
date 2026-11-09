import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  auditPackagedApp,
  bytesPerMib,
  findLoadedPackages,
  getDeclaredDependencies,
  getPackagedModuleNames,
  readAsarFiles,
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
const resourcesDir = process.platform === 'darwin'
  ? join(unpackedDir.endsWith('.app') ? unpackedDir : join(unpackedDir, 'ClipPress.app'), 'Contents', 'Resources')
  : join(unpackedDir, 'resources');

const asarPath = join(resourcesDir, 'app.asar');
const manifest = await readAsarManifest(asarPath);
const resourceFileNames = await readdir(resourcesDir);

// Windows keeps Electron's own files beside the exe, and its languages in `locales/`.
const appFileNames = process.platform === 'win32'
  ? [...await readdir(unpackedDir), ...(await readdir(join(unpackedDir, 'locales'))).map((name) => `locales/${name}`)]
  : undefined;

// What the built code loads, and what each packaged package depends on: anything else in node_modules is dead weight.
const builtCode = manifest.entries.map(({ path }) => path).filter((path) => /^out\/(?:main|preload|renderer\/assets)\/.*\.c?js$/.test(path));
const builtTexts = await readAsarFiles(asarPath, manifest, builtCode);
const loadedByApp = [...new Set([...builtTexts].flatMap(([path, code]) => [...findLoadedPackages(code, { renderer: path.startsWith('out/renderer/') })]))];
const packageNames = [...getPackagedModuleNames(manifest.entries)];
const packageJsons = await readAsarFiles(asarPath, manifest, packageNames.map((name) => `node_modules/${name}/package.json`));
const dependenciesByPackage = Object.fromEntries(packageNames.map((name) => [name, getDeclaredDependencies(packageJsons.get(`node_modules/${name}/package.json`)!)]));

const result = auditPackagedApp({ manifest, resourceFileNames, appFileNames, dependencyGraph: { loadedByApp, dependenciesByPackage }, platform: process.platform });

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
