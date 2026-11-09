import { describe, expect, it } from 'vitest';

import {
  auditPackagedApp,
  bytesPerMib,
  findLoadedPackages,
  findReachablePackages,
  getDeclaredDependencies,
  getPackageName,
  getPackagedModuleNames,
  maxAsarBytes,
  requiredChromiumFilesByPlatform,
  unusedChromiumFiles,
  type AsarEntry,
  type AsarManifest,
} from './packagedAppAudit.ts';

const mainEntry: AsarEntry = { path: 'out/main/index.js', size: 80_000 };

const healthyEntries: AsarEntry[] = [
  mainEntry,
  { path: 'out/preload/index.cjs', size: 2_000 },
  { path: 'LICENSE', size: 10_000 },
  { path: 'out/renderer/index.html', size: 2_000 },
  { path: 'package.json', size: 1_500 },
  { path: 'node_modules/semver/index.js', size: 4_000_000 },
  { path: 'node_modules/@electron/remote/main/index.js', size: 40_000 },
];

const makeManifest = (entries: AsarEntry[], fileBytes = 26 * bytesPerMib): AsarManifest => ({ fileBytes, entries });

const windowsResources = [
  'app.asar',
  'ffmpeg.exe',
  'ffprobe.exe',
  'licenses.txt',
  'avcodec-63.dll',
  'avdevice-63.dll',
  'avfilter-12.dll',
  'avformat-63.dll',
  'avutil-61.dll',
  'swresample-7.dll',
  'swscale-10.dll',
];

const audit = (entries: AsarEntry[], overrides: Partial<Parameters<typeof auditPackagedApp>[0]> = {}) => auditPackagedApp({
  manifest: makeManifest(entries),
  resourceFileNames: windowsResources,
  platform: 'win32',
  ...overrides,
});

describe('getPackagedModuleNames', () => {
  it('reads plain and scoped package names', () => {
    expect(getPackagedModuleNames(healthyEntries)).toEqual(new Set(['semver', '@electron/remote']));
  });

  it('ignores files that are not under node_modules', () => {
    expect(getPackagedModuleNames([mainEntry])).toEqual(new Set());
  });
});

describe('getPackageName', () => {
  it('reads a package from a module path', () => {
    expect(getPackageName('@electron/remote/main/index.js')).toBe('@electron/remote');
    expect(getPackageName('mime-types')).toBe('mime-types');
    expect(getPackageName('a/b')).toBe('a');
  });
});

describe('findLoadedPackages', () => {
  it('finds what built main code imports and requires, without what Node and Electron provide', () => {
    const code = 'import a from "@electron/remote/main/index.js"; import b from "node:fs"; import c from "electron"; const d = await import("late-pkg"); const e = require2("util"); const f = require$1("cjs-pkg"); const g = require("./local.js");';
    expect(findLoadedPackages(code, { renderer: false })).toEqual(new Set(['@electron/remote', 'late-pkg', 'cjs-pkg']));
  });

  it('only counts window.require in the renderer', () => {
    const code = 'window.require("mime-types"); window.require("path"); const text = require("not-this"); import x from "nor-this";';
    expect(findLoadedPackages(code, { renderer: true })).toEqual(new Set(['mime-types']));
  });
});

describe('getDeclaredDependencies', () => {
  it('counts every kind a package can need at run time', () => {
    expect(getDeclaredDependencies(JSON.stringify({ dependencies: { a: '1' }, optionalDependencies: { b: '1' }, peerDependencies: { c: '1', a: '1' }, devDependencies: { d: '1' } }))).toEqual(['a', 'b', 'c']);
  });
});

describe('findReachablePackages', () => {
  it('follows dependencies from what the app loads', () => {
    const reachable = findReachablePackages({
      loadedByApp: ['a'],
      dependenciesByPackage: { a: ['b', 'not-packaged'], b: ['a'], lonely: ['b'] },
    });
    expect(reachable).toEqual(new Set(['a', 'b']));
  });
});

describe('auditPackagedApp', () => {
  const graph = { loadedByApp: ['semver', '@electron/remote'], dependenciesByPackage: { semver: [], '@electron/remote': [] } };

  it('passes when everything packaged can be loaded', () => {
    expect(audit(healthyEntries, { dependencyGraph: graph }).problems).toEqual([]);
  });

  it('rejects a packaged package nothing can load', () => {
    const result = audit([...healthyEntries, { path: 'node_modules/leftover/index.js', size: 1_000 }], {
      dependencyGraph: { ...graph, dependenciesByPackage: { ...graph.dependenciesByPackage, leftover: [] } },
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('"leftover"');
    expect(result.problems[0]).toContain('build.files');
  });

  it('rejects an app that loads a package that was not packaged', () => {
    const result = audit(healthyEntries, { dependencyGraph: { ...graph, loadedByApp: [...graph.loadedByApp, 'missing-pkg'] } });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('"missing-pkg"');
  });

  it('does not report a build-time package twice', () => {
    const result = audit([...healthyEntries, { path: 'node_modules/electron/index.js', size: 1_000 }], {
      dependencyGraph: { ...graph, dependenciesByPackage: { ...graph.dependenciesByPackage, electron: [] } },
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('build-time-only');
  });

  it('passes a correctly packaged app', () => {
    expect(audit(healthyEntries).problems).toEqual([]);
  });

  it.each(['electron', 'typescript', 'electron-devtools-installer', '@electron/get', 'extract-zip', 'node-gyp', 'npmlog', 'zod'])('rejects the build-time-only package %s', (name) => {
    const result = audit([...healthyEntries, { path: `node_modules/${name}/index.js`, size: 1_000 }]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(name);
    expect(result.problems[0]).toContain('build.files');
  });

  it('rejects an app.asar over the size budget', () => {
    const result = auditPackagedApp({
      manifest: makeManifest(healthyEntries, maxAsarBytes + 1),
      resourceFileNames: windowsResources,
      platform: 'win32',
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('budget');
  });

  it('rejects an app with no main process', () => {
    const result = audit(healthyEntries.filter((entry) => entry.path !== mainEntry.path));
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('out/main/index.js');
  });

  it.each(['ffmpeg.exe', 'ffprobe.exe', 'avcodec-63.dll'])('rejects a package missing %s', (missing) => {
    const result = audit(healthyEntries, {
      resourceFileNames: windowsResources.filter((name) => name !== missing),
    });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(missing);
  });

  it('only requires the ffmpeg binaries on platforms that ship them loose', () => {
    const result = audit(healthyEntries, { resourceFileNames: ['app.asar', 'ffmpeg', 'ffprobe'], platform: 'darwin' });
    expect(result.problems).toEqual([]);
  });

  const windowsAppFiles = ['ClipPress.exe', 'chrome_100_percent.pak', ...requiredChromiumFilesByPlatform['win32']!, 'locales/de.pak'];

  it("passes a Windows app folder without Chromium's unused files", () => {
    expect(audit(healthyEntries, { appFileNames: windowsAppFiles }).problems).toEqual([]);
  });

  it.each(unusedChromiumFiles)('rejects a Windows app folder that still has %s', (name) => {
    const result = audit(healthyEntries, { appFileNames: [...windowsAppFiles, name] });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(name);
  });

  it.each(['d3dcompiler_47.dll', 'ffmpeg.dll', 'locales/en-US.pak'])('rejects a Windows app folder missing %s', (missing) => {
    const result = audit(healthyEntries, { appFileNames: windowsAppFiles.filter((name) => name !== missing) });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(missing);
  });

  it('reports the largest packaged dependencies so a regression is easy to read', () => {
    expect(audit(healthyEntries).largestModules).toEqual([
      { name: 'semver', bytes: 4_000_000 },
      { name: '@electron/remote', bytes: 40_000 },
    ]);
  });
});
