import { describe, expect, it } from 'vitest';

import { parseReleaseVersion, selectNewerRelease } from './updateChannel';

const beta1 = { tag_name: 'v0.1.0-beta.1', prerelease: true };
const beta2 = { tag_name: 'v0.1.0-beta.2', prerelease: true };
const beta3 = { tag_name: 'v0.1.0-beta.3', prerelease: true };
const stable = { tag_name: 'v0.1.0', prerelease: false };

describe('parseReleaseVersion', () => {
  it('strips the tag prefix', () => {
    expect(parseReleaseVersion('v0.1.0-beta.3')).toBe('0.1.0-beta.3');
    expect(parseReleaseVersion('0.1.0')).toBe('0.1.0');
  });

  it('rejects tags that are not versions', () => {
    expect(parseReleaseVersion('nightly')).toBeUndefined();
    expect(parseReleaseVersion('v')).toBeUndefined();
  });
});

describe('selectNewerRelease', () => {
  it('finds a newer prerelease when every release is a prerelease', () => {
    // This is the whole ClipPress release history so far, and the case the old
    // /releases/latest request could never see.
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.1',
      releases: [beta3, beta2, beta1],
    })).toBe('0.1.0-beta.3');
  });

  it('reports nothing when already on the newest release', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.3',
      releases: [beta3, beta2, beta1],
    })).toBeUndefined();
  });

  it('reports nothing when ahead of every published release', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.4',
      releases: [beta3, beta2, beta1],
    })).toBeUndefined();
  });

  it('never offers a prerelease to a stable build', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0',
      releases: [{ tag_name: 'v0.2.0-beta.1', prerelease: true }],
    })).toBeUndefined();
  });

  it('offers a newer stable release to a stable build', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0',
      releases: [{ tag_name: 'v0.2.0', prerelease: false }, { tag_name: 'v0.2.0-beta.1', prerelease: true }],
    })).toBe('0.2.0');
  });

  it('moves a prerelease build onto a newer stable release', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.3',
      releases: [stable, beta3],
    })).toBe('0.1.0');
  });

  it('ignores drafts', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.1',
      releases: [{ tag_name: 'v0.9.0-beta.1', prerelease: true, draft: true }, beta2],
    })).toBe('0.1.0-beta.2');
  });

  it('ignores tags that are not versions', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.1',
      releases: [{ tag_name: 'nightly', prerelease: true }, beta2],
    })).toBe('0.1.0-beta.2');
  });

  it('picks the newest by version, not by list order', () => {
    expect(selectNewerRelease({
      currentVersion: '0.1.0-beta.1',
      releases: [beta2, beta3],
    })).toBe('0.1.0-beta.3');
  });

  it('handles an empty release list', () => {
    expect(selectNewerRelease({ currentVersion: '0.1.0-beta.1', releases: [] })).toBeUndefined();
  });

  it('gives up rather than guessing when the running version is not a version', () => {
    expect(selectNewerRelease({ currentVersion: 'dev', releases: [beta3] })).toBeUndefined();
  });
});
