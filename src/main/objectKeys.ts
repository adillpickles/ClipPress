// Keys that can be used to reach Object.prototype through libraries that assign
// parsed data onto objects (or through dot-notation paths, e.g. electron-store).
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

// Note: dot-notation is significant for configStore.set(), so check every segment.
export function isSafeKey(key: string) {
  return key.split('.').every((segment) => !unsafeKeys.has(segment));
}

const maxDepth = 20;

// Must use own-property inspection: `'constructor' in {}` and `'__proto__' in {}`
// are both true for every plain object, so an `in` check rejects all valid input.
export function hasUnsafeKeys(value: unknown, depth = 0): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (depth >= maxDepth) return true;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeKeys(item, depth + 1));
  for (const key of Object.getOwnPropertyNames(value)) {
    if (unsafeKeys.has(key)) return true;
    if (hasUnsafeKeys(Object.getOwnPropertyDescriptor(value, key)?.value, depth + 1)) return true;
  }
  return false;
}
