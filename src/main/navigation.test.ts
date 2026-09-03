// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';

import { isAllowedAppNavigation, isExternallyOpenableUrl } from './navigation.js';

describe('isExternallyOpenableUrl', () => {
  it('allows http and https', () => {
    expect(isExternallyOpenableUrl('https://github.com/mifi/lossless-cut')).toBe(true);
    expect(isExternallyOpenableUrl('http://example.com/a?b=c')).toBe(true);
  });

  // shell.openExternal on these schemes can execute code or mount a remote share
  it('rejects every other scheme', () => {
    expect(isExternallyOpenableUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isExternallyOpenableUrl('smb://attacker/share')).toBe(false);
    expect(isExternallyOpenableUrl('ms-msdt:/id')).toBe(false);
    // eslint-disable-next-line no-script-url
    expect(isExternallyOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isExternallyOpenableUrl('not a url')).toBe(false);
  });
});

describe('isAllowedAppNavigation', () => {
  const currentUrl = 'file:///app/out/renderer/index.html';

  it('allows reloading the current document', () => {
    expect(isAllowedAppNavigation({ navigationUrl: currentUrl, currentUrl, isDev: false })).toBe(true);
  });

  it('blocks navigation away from the app in production', () => {
    expect(isAllowedAppNavigation({ navigationUrl: 'https://example.com', currentUrl, isDev: false })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'file:///etc/passwd', currentUrl, isDev: false })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'http://localhost:3001/', currentUrl, isDev: false })).toBe(false);
  });

  it('allows the dev server origin in dev', () => {
    expect(isAllowedAppNavigation({ navigationUrl: 'http://localhost:3001/', currentUrl, isDev: true })).toBe(true);
    expect(isAllowedAppNavigation({ navigationUrl: 'http://localhost:3001/index.html', currentUrl, isDev: true })).toBe(true);
  });

  // A startsWith() prefix check would let all of these through
  it('does not treat lookalike origins as the dev server', () => {
    expect(isAllowedAppNavigation({ navigationUrl: 'http://localhost:30011/', currentUrl, isDev: true })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'http://localhost:3001.example.com/', currentUrl, isDev: true })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'https://localhost:3001/', currentUrl, isDev: true })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'http://evil.com/#http://localhost:3001', currentUrl, isDev: true })).toBe(false);
    expect(isAllowedAppNavigation({ navigationUrl: 'garbage', currentUrl, isDev: true })).toBe(false);
  });
});
