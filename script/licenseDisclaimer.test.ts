import { describe, expect, it } from 'vitest';

import { filterLicenseDisclaimer, findRuntimePackages } from './licenseDisclaimer.ts';

const section = (names: string, body: string) => `The following software may be included in this product: ${names}. A copy of the source code may be downloaded from https://example.com. This software contains the following license and notice below:\n\n${body}\n`;
const disclaimer = ['THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES.\n', `\n${section('react, build-tool', 'MIT react')}`, `\n${section('7zip-bin', 'MIT 7zip')}`, `\n${section('@scope/pkg', 'ISC scope')}`].join('\n-----\n');

describe('filterLicenseDisclaimer', () => {
  it('keeps the opening statement and only the shipped packages', () => {
    const { text, missing } = filterLicenseDisclaimer(disclaimer, new Set(['react', '@scope/pkg']));
    expect(missing).toEqual([]);
    expect(text).toContain('ATTRIBUTION NOTICES');
    expect(text).toContain('in this product: react. A copy');
    expect(text).toContain('MIT react');
    expect(text).toContain('@scope/pkg');
    expect(text).not.toContain('build-tool');
    expect(text).not.toContain('7zip');
  });

  it('reports a shipped package with no notice', () => {
    expect(filterLicenseDisclaimer(disclaimer, new Set(['react', 'unknown-pkg'])).missing).toEqual(['unknown-pkg']);
  });

  it('keeps a package name with a dot whole', () => {
    const text = `\n${section('lodash.debounce', 'MIT lodash')}`;
    expect(filterLicenseDisclaimer(text, new Set(['lodash.debounce'])).missing).toEqual([]);
  });
});

describe('findRuntimePackages', () => {
  it('follows dependencies and skips what is not installed', async () => {
    const manifests: Record<string, { dependencies?: Record<string, string> }> = { a: { dependencies: { b: '1', gone: '1' } }, b: {} };
    expect(await findRuntimePackages(['a'], async (name) => manifests[name])).toEqual(new Set(['a', 'b']));
  });
});
