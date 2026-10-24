import { describe, expect, it } from 'vitest';

import { defaultQuickExportPresets } from '../../common/quickExport';
import type { ExportQuality, TranslateQuickExport } from './quickExport';
import { getLastSettingsLabel, getQuickExportPresetLabel, resolveExportQuality } from './quickExport';

const t: TranslateQuickExport = (key, options = {}) => key.replaceAll(/{{(\w+)}}/g, (_match, name: string) => String(options[name]));

const sheet: ExportQuality = {
  isSizeLimited: true,
  sizeLimitMb: 25,
  controlMode: 'advanced',
  preset: 'fast',
  transform: { resolution: '720p', fps: '30fps' },
};

describe('resolveExportQuality', () => {
  it('uses the sheet without a preset', () => {
    expect(resolveExportQuality(sheet, undefined)).toBe(sheet);
  });

  it('uses the preset instead, as a fresh preset card with Auto resolution and frame rate', () => {
    expect(resolveExportQuality(sheet, { encodeMode: 'size_limited', sizeLimitMb: 10, sizeLimitPreset: 'quality' })).toEqual({
      isSizeLimited: true,
      sizeLimitMb: 10,
      controlMode: 'simple',
      preset: 'quality',
      transform: { resolution: 'auto', fps: 'auto' },
    });
  });

  it('keeps the source picture for Max Quality, as its card does', () => {
    expect(resolveExportQuality(sheet, { encodeMode: 'size_limited', sizeLimitMb: 50, sizeLimitPreset: 'max_quality' }).transform)
      .toEqual({ resolution: 'source', fps: 'source' });
  });

  it('makes an Original quality export from a size-limited sheet', () => {
    expect(resolveExportQuality(sheet, { encodeMode: 'lossless', sizeLimitMb: 10, sizeLimitPreset: 'quality' }).isSizeLimited).toBe(false);
  });
});

describe('quick export labels', () => {
  it('names the default presets', () => {
    expect(defaultQuickExportPresets.map((preset) => getQuickExportPresetLabel(preset, t))).toEqual(['Original quality', 'Discord · 10 MB', 'Email · 20 MB']);
  });

  it('shows a name once when it says the same as the quality', () => {
    expect(getQuickExportPresetLabel({ name: ' Original quality ', encodeMode: 'lossless', sizeLimitMb: 10, sizeLimitPreset: 'quality' }, t)).toBe('Original quality');
    expect(getQuickExportPresetLabel({ name: '  ', encodeMode: 'size_limited', sizeLimitMb: 15, sizeLimitPreset: 'fast' }, t)).toBe('15 MB');
  });

  it('says last settings for Ctrl+E', () => {
    expect(getLastSettingsLabel({ isSizeLimited: false, sizeLimitMb: 20 }, t)).toBe('Last settings · Original quality');
    expect(getLastSettingsLabel({ isSizeLimited: true, sizeLimitMb: 20 }, t)).toBe('Last settings · 20 MB');
  });
});
