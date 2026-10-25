// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';

import isLocalApiRequest from './httpApiGuard.js';

describe('isLocalApiRequest', () => {
  it('allows a local program posting JSON', () => {
    expect(isLocalApiRequest({ hostname: '127.0.0.1', origin: undefined, isJson: true })).toBe(true);
    expect(isLocalApiRequest({ hostname: 'localhost', origin: undefined, isJson: true })).toBe(true);
  });

  it('refuses a web page (it sends an Origin)', () => {
    expect(isLocalApiRequest({ hostname: '127.0.0.1', origin: 'https://example.com', isJson: true })).toBe(false);
    expect(isLocalApiRequest({ hostname: '127.0.0.1', origin: 'null', isJson: true })).toBe(false);
  });

  it('refuses a form or text body, which a page can send without asking first', () => {
    expect(isLocalApiRequest({ hostname: '127.0.0.1', origin: undefined, isJson: false })).toBe(false);
  });

  // DNS rebinding: a page's own name resolved to 127.0.0.1
  it('refuses any other host name', () => {
    expect(isLocalApiRequest({ hostname: 'evil.example', origin: undefined, isJson: true })).toBe(false);
    expect(isLocalApiRequest({ hostname: undefined, origin: undefined, isJson: true })).toBe(false);
  });
});
