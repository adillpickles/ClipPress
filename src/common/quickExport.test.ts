import { describe, expect, it } from 'vitest';

import { addQuickExportKeyBindings, defaultQuickExportPresets, migrateQuickExportPresets, newQuickExportPreset, normalizeQuickExportPresets, quickExportKeyBindings, removeQuickExportPreset } from './quickExport.js';
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

describe('migrateQuickExportPresets', () => {
  it('updates presets still at the first defaults, and leaves changed ones alone', () => {
    const firstDefaults = [
      { name: '', encodeMode: 'lossless', sizeLimitMb: 10, sizeLimitPreset: 'quality' },
      { name: 'Discord', encodeMode: 'size_limited', sizeLimitMb: 10, sizeLimitPreset: 'quality' },
      { name: 'Email', encodeMode: 'size_limited', sizeLimitMb: 20, sizeLimitPreset: 'quality' },
    ] as const;
    expect(migrateQuickExportPresets(firstDefaults.map((p) => ({ ...p })))).toEqual(defaultQuickExportPresets);
    const changed = [{ ...firstDefaults[0], name: 'Keep' }, { ...firstDefaults[1], sizeLimitMb: 50 }, { ...firstDefaults[2] }];
    expect(migrateQuickExportPresets(changed)).toEqual([changed[0], changed[1], defaultQuickExportPresets[2]]);
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

describe('quick exports the user adds', () => {
  const added = { name: 'Twitter', encodeMode: 'size_limited' as const, sizeLimitMb: 15, sizeLimitPreset: 'fast' as const };

  it('keeps them after the three first ones, up to nine in all, a broken one made a new one', () => {
    expect(normalizeQuickExportPresets([...defaultQuickExportPresets, added, { sizeLimitMb: -1 }])).toEqual([...defaultQuickExportPresets, added, newQuickExportPreset]);
    expect(normalizeQuickExportPresets([...defaultQuickExportPresets, ...Array.from({ length: 10 }, () => added)])).toHaveLength(9);
    expect(normalizeQuickExportPresets([...defaultQuickExportPresets, null, added])).toEqual([...defaultQuickExportPresets, added]);
  });

  it('removing one moves the later ones and their shortcuts up a place', () => {
    const presets = [...defaultQuickExportPresets, added, { ...added, name: 'Other' }];
    const keyBindings = [
      { keys: 'ControlLeft+Digit3', action: 'quickExportPreset3' as const },
      { keys: 'ControlLeft+Digit4', action: 'quickExportPreset4' as const },
      { keys: 'ControlLeft+Digit5', action: 'quickExportPreset5' as const },
      { keys: 'KeyE', action: 'export' as const },
    ];
    const removed = removeQuickExportPreset(presets, keyBindings, 3);
    expect(removed.presets.map((preset) => preset.name)).toEqual(['Original quality', 'Discord', 'Email', 'Other']);
    expect(removed.keyBindings).toEqual([
      { keys: 'ControlLeft+Digit3', action: 'quickExportPreset3' },
      { keys: 'ControlLeft+Digit5', action: 'quickExportPreset4' },
      { keys: 'KeyE', action: 'export' },
    ]);
  });
});
