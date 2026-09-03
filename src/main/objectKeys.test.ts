// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';

import { hasUnsafeKeys, isSafeKey } from './objectKeys.js';

describe('isSafeKey', () => {
  it('allows ordinary setting keys', () => {
    expect(isSafeKey('captureFormat')).toBe(true);
    expect(isSafeKey('ffmpegExperimental')).toBe(true);
  });

  it('rejects prototype keys', () => {
    expect(isSafeKey('__proto__')).toBe(false);
    expect(isSafeKey('constructor')).toBe(false);
    expect(isSafeKey('prototype')).toBe(false);
  });

  // configStore.set() treats dots as a path, so each segment must be checked
  it('rejects prototype keys in any dot path segment', () => {
    expect(isSafeKey('__proto__.polluted')).toBe(false);
    expect(isSafeKey('a.constructor.prototype.polluted')).toBe(false);
    expect(isSafeKey('a.b.c')).toBe(true);
  });
});

describe('hasUnsafeKeys', () => {
  it('accepts ordinary bodies', () => {
    // Regression: an `in` check reports true for every plain object, because
    // __proto__ and constructor are inherited from Object.prototype
    expect(hasUnsafeKeys({})).toBe(false);
    expect(hasUnsafeKeys({ a: 1, b: 'two', c: [1, 2, { d: null }] })).toBe(false);
    expect(hasUnsafeKeys(JSON.parse('{"seekRel":5}'))).toBe(false);
    expect(hasUnsafeKeys(null)).toBe(false);
    expect(hasUnsafeKeys('string')).toBe(false);
    expect(hasUnsafeKeys([1, 2, 3])).toBe(false);
  });

  it('rejects prototype keys at the top level', () => {
    expect(hasUnsafeKeys(JSON.parse('{"__proto__":{"polluted":1}}'))).toBe(true);
    expect(hasUnsafeKeys(JSON.parse('{"constructor":{"prototype":{}}}'))).toBe(true);
    expect(hasUnsafeKeys(JSON.parse('{"prototype":1}'))).toBe(true);
  });

  it('rejects prototype keys nested in objects and arrays', () => {
    expect(hasUnsafeKeys(JSON.parse('{"a":{"b":{"__proto__":{"x":1}}}}'))).toBe(true);
    expect(hasUnsafeKeys(JSON.parse('{"a":[{"constructor":1}]}'))).toBe(true);
  });

  it('rejects structures nested past the depth limit rather than recursing forever', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 50; i += 1) deep = { deep };
    expect(hasUnsafeKeys(deep)).toBe(true);

    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(hasUnsafeKeys(cyclic)).toBe(true);
  });
});
