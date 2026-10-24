import { describe, expect, it } from 'vitest';

import { addQuickExportKeyBindings, defaultQuickExportPresets, normalizeQuickExportPresets, quickExportKeyBindings } from './quickExport.js';
import type { KeyBinding } from './types.js';

describe('normalizeQuickExportPresets', () => {
  it('gives the defaults for nothing saved', () => {
    expect(normalizeQuickExportPresets(undefined)).toEqual(defaultQuickExportPresets);
    expect(normalizeQuickExportPresets('nonsense')).toEqual(defaultQuickExportPresets);
  });

  it('keeps saved presets', () => {
    const saved = [
      { name: 'Archive', encodeMode: 'lossless', sizeLimitMb: 8, sizeLimitPreset: 'fast' },
      { name: '', encodeMode: 'size_limited', sizeLimitMb: 49.5, sizeLimitPreset: 'max_quality' },
      { name: 'Email', encodeMode: 'size_limited', sizeLimitMb: 25, sizeLimitPreset: 'quality' },
    ];
    expect(normalizeQuickExportPresets(saved)).toEqual(saved);
  });

  it('repairs a broken preset field by field, and fills in missing ones', () => {
    const normalized = normalizeQuickExportPresets([
      { name: 3, encodeMode: 'lossy', sizeLimitMb: -1, sizeLimitPreset: 'ultra_fast' },
      { name: 'Nitro', sizeLimitMb: 50 },
    ]);
    expect(normalized).toEqual([
      defaultQuickExportPresets[0],
      { ...defaultQuickExportPresets[1], name: 'Nitro', sizeLimitMb: 50 },
      defaultQuickExportPresets[2],
    ]);
  });
});

describe('addQuickExportKeyBindings', () => {
  const exportOnE: KeyBinding = { keys: 'KeyE', action: 'export' };

  it('adds the four shortcuts to saved ones', () => {
    expect(addQuickExportKeyBindings([exportOnE])).toEqual([exportOnE, ...quickExportKeyBindings]);
  });

  it('leaves keys that already do something alone, whichever Ctrl key they name', () => {
    const taken: KeyBinding[] = [{ keys: 'ControlRight+KeyE', action: 'captureSnapshot' }, { keys: 'ControlLeft+Digit2', action: 'toggleMuted' }];
    expect(addQuickExportKeyBindings(taken).map((binding) => binding.action)).toEqual(['captureSnapshot', 'toggleMuted', 'quickExportPreset1', 'quickExportPreset3']);
  });

  it('adds nothing for an action that has its own keys already', () => {
    const own: KeyBinding[] = [{ keys: 'F9', action: 'quickExportPreset1' }];
    expect(addQuickExportKeyBindings(own).filter((binding) => binding.action === 'quickExportPreset1')).toEqual(own);
  });

  it('returns the same list when there is nothing to add', () => {
    const all = [...quickExportKeyBindings];
    expect(addQuickExportKeyBindings(all)).toBe(all);
  });
});
