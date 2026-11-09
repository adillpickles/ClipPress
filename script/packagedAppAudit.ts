import { open, stat } from 'node:fs/promises';
import { builtinModules } from 'node:module';

/**
 * Checks that the packaged app contains what it should and nothing it should not.
 *
 * The packaged ASAR once carried a second copy of the Electron runtime and the
 * TypeScript compiler — 343 MB of build-time dependencies — because electron-builder's
 * dependency collector follows peer-dependency edges out of production packages
 * (`@electron/remote` peer-depends on `electron`, `i18next` optionally on `typescript`).
 * `build.files` now excludes them, and this check is what stops them, or anything like
 * them, from quietly coming back.
 *
 * The audit itself is pure so it can be unit tested; only `readAsarManifest` touches disk.
 */

export interface AsarEntry {
  path: string,
  size: number,
  /** Where the file's bytes start, after the header. */
  offset?: number,
}

export interface AsarManifest {
  /** Size of the `.asar` file itself. */
  fileBytes: number,
  /** Every file inside, with its uncompressed size. */
  entries: AsarEntry[],
  /** Where the file contents start in the `.asar`. */
  dataOffset?: number,
}

interface AsarHeaderNode {
  files?: Record<string, AsarHeaderNode>,
  size?: number,
  offset?: string,
}

/**
 * Reads an ASAR's header without unpacking it.
 *
 * The format is a small pickled JSON header followed by the file contents; the first 16
 * bytes carry the header length at offset 12.
 */
export async function readAsarManifest(asarPath: string): Promise<AsarManifest> {
  const handle = await open(asarPath, 'r');
  try {
    const prefix = Buffer.alloc(16);
    await handle.read(prefix, 0, 16, 0);
    const headerSize = prefix.readUInt32LE(12);

    const headerBuffer = Buffer.alloc(headerSize);
    await handle.read(headerBuffer, 0, headerSize, 16);
    const header = JSON.parse(headerBuffer.toString('utf8')) as AsarHeaderNode;

    const entries: AsarEntry[] = [];
    const walk = (node: AsarHeaderNode, prefixPath: string) => {
      if (node.files == null) {
        entries.push({ path: prefixPath, size: node.size ?? 0, ...(node.offset != null ? { offset: Number(node.offset) } : {}) });
        return;
      }
      for (const [name, child] of Object.entries(node.files)) {
        walk(child, prefixPath.length > 0 ? `${prefixPath}/${name}` : name);
      }
    };
    walk(header, '');

    // Two pickles: the first holds the second's size; the file contents follow the second.
    return { fileBytes: (await stat(asarPath)).size, entries, dataOffset: 8 + prefix.readUInt32LE(4) };
  } finally {
    await handle.close();
  }
}

/** The text of files inside an ASAR. */
export async function readAsarFiles(asarPath: string, manifest: AsarManifest, paths: readonly string[]) {
  const handle = await open(asarPath, 'r');
  try {
    const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    const texts = new Map<string, string>();
    for (const path of paths) {
      const entry = byPath.get(path);
      if (entry?.offset == null || manifest.dataOffset == null) throw new Error(`${path} isn't readable in ${asarPath}`);
      const bytes = Buffer.alloc(entry.size);
      // eslint-disable-next-line no-await-in-loop
      await handle.read(bytes, 0, entry.size, manifest.dataOffset + entry.offset);
      texts.set(path, bytes.toString('utf8'));
    }
    return texts;
  } finally {
    await handle.close();
  }
}

/** The package a packaged file belongs to, or undefined if it is app code. */
function getOwningModuleName(path: string) {
  const segments = path.split('/');
  if (segments[0] !== 'node_modules' || segments[1] == null) return undefined;
  return segments[1].startsWith('@') && segments[2] != null
    ? `${segments[1]}/${segments[2]}`
    : segments[1];
}

/** Top-level package names under the ASAR's `node_modules`, scopes included. */
export function getPackagedModuleNames(entries: readonly AsarEntry[]) {
  return new Set(entries
    .map((entry) => getOwningModuleName(entry.path))
    .filter((name): name is string => name != null));
}

export const bytesPerMib = 1024 * 1024;

/** A bare module name's package: `a/b` is `a`, `@a/b/c` is `@a/b`. */
export function getPackageName(moduleName: string) {
  const [first, second] = moduleName.split('/');
  return first!.startsWith('@') && second != null ? `${first}/${second}` : first!;
}

const isRuntimeProvided = (moduleName: string) => moduleName.startsWith('node:') || moduleName === 'electron' || moduleName === 'original-fs' || builtinModules.includes(moduleName);

/** Packages a built file of the app loads itself (everything else it uses is bundled in). */
export function findLoadedPackages(code: string, { renderer }: { renderer: boolean }) {
  // The renderer's bundle has the word "require" in plenty of text; only window.require reaches Node there.
  const pattern = renderer
    ? /window\.require\(\s*["']([^"'.\s][^"'\s]*)["']\s*\)/g
    : /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire[\d$]*\s*\(\s*)["']([^"'.\s][^"'\s]*)["']/g;
  return new Set([...code.matchAll(pattern)].map((match) => match[1]!).filter((name) => !isRuntimeProvided(name)).map((name) => getPackageName(name)));
}

/** What a package needs at run time, as its package.json declares it. */
export function getDeclaredDependencies(packageJsonText: string) {
  const { dependencies, optionalDependencies, peerDependencies } = JSON.parse(packageJsonText) as Record<string, Record<string, string> | undefined>;
  return [...new Set([...Object.keys(dependencies ?? {}), ...Object.keys(optionalDependencies ?? {}), ...Object.keys(peerDependencies ?? {})])];
}

export interface PackagedDependencyGraph {
  /** Packages the built main, preload and renderer code load themselves. */
  loadedByApp: readonly string[],
  /** Every package at the top of the ASAR's node_modules, with what it depends on. */
  dependenciesByPackage: Readonly<Record<string, readonly string[]>>,
}

/** Everything the app can load at run time: what it loads itself, and all those packages depend on. */
export function findReachablePackages({ loadedByApp, dependenciesByPackage }: PackagedDependencyGraph) {
  const reachable = new Set<string>();
  const queue = [...loadedByApp];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (!reachable.has(name) && dependenciesByPackage[name] != null) {
      reachable.add(name);
      queue.push(...dependenciesByPackage[name]);
    }
  }
  return reachable;
}

/**
 * Build-time-only packages that must never be inside the app.
 *
 * `electron` is the *installer* for the Electron binary: its entry point returns the
 * path of the developer machine's `electron.exe`. The packaged app gets `electron` from
 * the runtime itself, so this copy is never loaded — it is only weight, and would be
 * actively wrong if it ever did win resolution. `typescript` is a compile-time optional
 * peer of `i18next` that nothing imports at runtime.
 */
// Electron's own install-time helpers (extract-zip was renamed @electron-internal/extract-zip in Electron 45), which
// the dependency collector picks up through @electron/remote's peer dependency on electron.
// zod: only the renderer uses it, and Vite bundles it in (main leaves it out on purpose, for its start time).
export const disallowedPackagedModules = ['electron', 'typescript', 'electron-devtools-installer', '@electron/get', 'extract-zip', '@electron-internal/extract-zip', 'undici', 'node-gyp', 'npmlog', 'zod'];

/**
 * Chromium files ClipPress never loads, removed by `script/afterPack.ts` (~32 MB installed): WebGPU's DirectX shader
 * compiler (ClipPress has no WebGPU or WebGL; Chromium only preloads it, best effort), and the SwiftShader Vulkan
 * software renderer and Vulkan loader (Chromium's software fallback on Windows is Windows' own D3D11 WARP).
 */
export const unusedChromiumFiles = ['dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'];

/** Chromium files next to the app's exe that it can't start, draw or play without: what the removal must never take. */
export const requiredChromiumFilesByPlatform: Record<string, string[]> = {
  win32: ['ffmpeg.dll', 'd3dcompiler_47.dll', 'icudtl.dat', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'locales/en-US.pak'],
};

/**
 * Generous enough that ordinary dependency growth will not trip it, tight enough that
 * re-admitting a runtime-sized package cannot go unnoticed.
 */
export const maxAsarBytes = 64 * bytesPerMib;

/** Files that carry actual media capability, and whose absence breaks every export. */
export const requiredResourcesByPlatform: Record<string, string[]> = {
  win32: [
    'ffmpeg.exe',
    'ffprobe.exe',
    // Every licence, opened by Help > Licenses.
    'licenses.txt',
    'avcodec-63.dll',
    'avdevice-63.dll',
    'avfilter-12.dll',
    'avformat-63.dll',
    'avutil-61.dll',
    'swresample-7.dll',
    'swscale-10.dll',
  ],
  darwin: ['ffmpeg', 'ffprobe'],
  linux: ['ffmpeg', 'ffprobe'],
};

export interface PackagedAppAuditInput {
  manifest: AsarManifest,
  /** File names present next to the ASAR, in `resources/`. */
  resourceFileNames: readonly string[],
  /** Files in the app's own folder (next to its exe), with `locales/` ones as `locales/<name>`; only checked on Windows. */
  appFileNames?: readonly string[] | undefined,
  /** Given, the ASAR's packages are checked against what the app can actually load. */
  dependencyGraph?: PackagedDependencyGraph | undefined,
  platform: string,
}

export interface PackagedAppAuditResult {
  problems: string[],
  packagedModuleCount: number,
  asarBytes: number,
  largestModules: { name: string, bytes: number }[],
}

export function auditPackagedApp({ manifest, resourceFileNames, appFileNames, dependencyGraph, platform }: PackagedAppAuditInput): PackagedAppAuditResult {
  const problems: string[] = [];
  const moduleNames = getPackagedModuleNames(manifest.entries);

  for (const name of disallowedPackagedModules) {
    if (moduleNames.has(name)) {
      problems.push(`app.asar contains the build-time-only package "${name}". Check build.files in package.json.`);
    }
  }

  if (dependencyGraph != null) {
    const reachable = findReachablePackages(dependencyGraph);
    for (const name of [...moduleNames].sort()) {
      // Build-time packages are reported above.
      if (!reachable.has(name) && !disallowedPackagedModules.includes(name)) {
        problems.push(`app.asar contains "${name}", which nothing at run time can load. Exclude it in build.files in package.json.`);
      }
    }
    for (const name of dependencyGraph.loadedByApp) {
      // electron-devtools-installer is only imported in development.
      if (!moduleNames.has(name) && !disallowedPackagedModules.includes(name)) {
        problems.push(`The app loads "${name}", which isn't in app.asar: add it to dependencies in package.json.`);
      }
    }
  }

  if (manifest.fileBytes > maxAsarBytes) {
    problems.push(`app.asar is ${(manifest.fileBytes / bytesPerMib).toFixed(1)} MiB, over the ${(maxAsarBytes / bytesPerMib).toFixed(0)} MiB budget.`);
  }

  if (!manifest.entries.some((entry) => entry.path === 'out/main/index.js')) {
    problems.push('app.asar is missing out/main/index.js, so the app has no main process.');
  }
  for (const required of ['out/renderer/index.html', 'out/preload/index.cjs', 'LICENSE']) {
    if (!manifest.entries.some((entry) => entry.path === required)) problems.push(`app.asar is missing ${required}.`);
  }

  const requiredResources = requiredResourcesByPlatform[platform] ?? [];
  const presentResources = new Set(resourceFileNames);
  for (const required of requiredResources) {
    if (!presentResources.has(required)) {
      problems.push(`Packaged resources are missing "${required}", which media playback or export needs.`);
    }
  }

  if (appFileNames != null && platform === 'win32') {
    const presentAppFiles = new Set(appFileNames);
    for (const name of unusedChromiumFiles) {
      if (presentAppFiles.has(name)) problems.push(`The app folder still has "${name}", which script/afterPack.ts should remove.`);
    }
    for (const name of requiredChromiumFilesByPlatform[platform] ?? []) {
      if (!presentAppFiles.has(name)) problems.push(`The app folder is missing "${name}", which Electron needs to start, draw or play.`);
    }
  }

  const bytesByModule = new Map<string, number>();
  for (const { path, size } of manifest.entries) {
    const name = getOwningModuleName(path);
    if (name != null) bytesByModule.set(name, (bytesByModule.get(name) ?? 0) + size);
  }

  return {
    problems,
    packagedModuleCount: moduleNames.size,
    asarBytes: manifest.fileBytes,
    largestModules: [...bytesByModule]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10),
  };
}
