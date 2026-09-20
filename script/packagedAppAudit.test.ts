import { describe, expect, it } from 'vitest';

import {
  auditPackagedApp,
  bytesPerMib,
  getPackagedModuleNames,
  maxAsarBytes,
  type AsarEntry,
  type AsarManifest,
} from './packagedAppAudit.ts';

const mainEntry: AsarEntry = { path: 'out/main/index.js', size: 80_000 };

const healthyEntries: AsarEntry[] = [
  mainEntry,
  { path: 'out/renderer/index.html', size: 2_000 },
  { path: 'package.json', size: 1_500 },
  { path: 'node_modules/zod/index.js', size: 4_000_000 },
  { path: 'node_modules/@electron/remote/main/index.js', size: 40_000 },
];

const makeManifest = (entries: AsarEntry[], fileBytes = 26 * bytesPerMib): AsarManifest => ({ fileBytes, entries });

const windowsResources = [
  'app.asar',
  'ffmpeg.exe',
  'ffprobe.exe',
  'avcodec-62.dll',
  'avdevice-62.dll',
  'avfilter-11.dll',
  'avformat-62.dll',
  'avutil-60.dll',
  'swresample-6.dll',
  'swscale-9.dll',
];

const audit = (entries: AsarEntry[], overrides: Partial<Parameters<typeof auditPackagedApp>[0]> = {}) => auditPackagedApp({
  manifest: makeManifest(entries),
  resourceFileNames: windowsResources,
  platform: 'win32',
  ...overrides,
});

describe('getPackagedModuleNames', () => {
  it('reads plain and scoped package names', () => {
    expect(getPackagedModuleNames(healthyEntries)).toEqual(new Set(['zod', '@electron/remote']));
  });

  it('ignores files that are not under node_modules', () => {
    expect(getPackagedModuleNames([mainEntry])).toEqual(new Set());
  });
});

describe('auditPackagedApp', () => {
  it('passes a correctly packaged app', () => {
    expect(audit(healthyEntries).problems).toEqual([]);
  });

  it.each(['electron', 'typescript'])('rejects the build-time-only package %s', (name) => {
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

  it.each(['ffmpeg.exe', 'ffprobe.exe', 'avcodec-62.dll'])('rejects a package missing %s', (missing) => {
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

  it('reports the largest packaged dependencies so a regression is easy to read', () => {
    expect(audit(healthyEntries).largestModules).toEqual([
      { name: 'zod', bytes: 4_000_000 },
      { name: '@electron/remote', bytes: 40_000 },
    ]);
  });
});
