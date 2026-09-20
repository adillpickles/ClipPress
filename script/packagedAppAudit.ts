import { open, stat } from 'node:fs/promises';

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
}

export interface AsarManifest {
  /** Size of the `.asar` file itself. */
  fileBytes: number,
  /** Every file inside, with its uncompressed size. */
  entries: AsarEntry[],
}

interface AsarHeaderNode {
  files?: Record<string, AsarHeaderNode>,
  size?: number,
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
        entries.push({ path: prefixPath, size: node.size ?? 0 });
        return;
      }
      for (const [name, child] of Object.entries(node.files)) {
        walk(child, prefixPath.length > 0 ? `${prefixPath}/${name}` : name);
      }
    };
    walk(header, '');

    return { fileBytes: (await stat(asarPath)).size, entries };
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

/**
 * Build-time-only packages that must never be inside the app.
 *
 * `electron` is the *installer* for the Electron binary: its entry point returns the
 * path of the developer machine's `electron.exe`. The packaged app gets `electron` from
 * the runtime itself, so this copy is never loaded — it is only weight, and would be
 * actively wrong if it ever did win resolution. `typescript` is a compile-time optional
 * peer of `i18next` that nothing imports at runtime.
 */
export const disallowedPackagedModules = ['electron', 'typescript'];

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
    'avcodec-62.dll',
    'avdevice-62.dll',
    'avfilter-11.dll',
    'avformat-62.dll',
    'avutil-60.dll',
    'swresample-6.dll',
    'swscale-9.dll',
  ],
  darwin: ['ffmpeg', 'ffprobe'],
  linux: ['ffmpeg', 'ffprobe'],
};

export interface PackagedAppAuditInput {
  manifest: AsarManifest,
  /** File names present next to the ASAR, in `resources/`. */
  resourceFileNames: readonly string[],
  platform: string,
}

export interface PackagedAppAuditResult {
  problems: string[],
  packagedModuleCount: number,
  asarBytes: number,
  largestModules: { name: string, bytes: number }[],
}

export function auditPackagedApp({ manifest, resourceFileNames, platform }: PackagedAppAuditInput): PackagedAppAuditResult {
  const problems: string[] = [];
  const moduleNames = getPackagedModuleNames(manifest.entries);

  for (const name of disallowedPackagedModules) {
    if (moduleNames.has(name)) {
      problems.push(`app.asar contains the build-time-only package "${name}". Check build.files in package.json.`);
    }
  }

  if (manifest.fileBytes > maxAsarBytes) {
    problems.push(`app.asar is ${(manifest.fileBytes / bytesPerMib).toFixed(1)} MiB, over the ${(maxAsarBytes / bytesPerMib).toFixed(0)} MiB budget.`);
  }

  if (!manifest.entries.some((entry) => entry.path === 'out/main/index.js')) {
    problems.push('app.asar is missing out/main/index.js, so the app has no main process.');
  }

  const requiredResources = requiredResourcesByPlatform[platform] ?? [];
  const presentResources = new Set(resourceFileNames);
  for (const required of requiredResources) {
    if (!presentResources.has(required)) {
      problems.push(`Packaged resources are missing "${required}", which media playback or export needs.`);
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
