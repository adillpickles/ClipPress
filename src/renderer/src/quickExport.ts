import type { QuickExportPreset, SizeLimitControlMode, SizeLimitPreset } from '../../common/types';
import type { ResolvedSizeLimitedTransformSettings } from './sizeLimitedResolution';
import { resolveEffectiveSizeLimitedTransformSettings } from './sizeLimitedResolution';

export type TranslateQuickExport = (key: string, options: Record<string, string | number>) => string;

/** What a quick export preset decides. Files, names and the folder are always the export sheet's. */
export type QuickExportQuality = Pick<QuickExportPreset, 'encodeMode' | 'sizeLimitMb' | 'sizeLimitPreset'>;

/** An export started without the sheet: Ctrl+click on Export, Ctrl+E, or Ctrl+1/2/3. */
export interface QuickExport {
  /** What the progress says, e.g. "Discord · 10 MB". */
  label: string,
  /** A preset's quality, used once instead of the sheet's; none to use the sheet's own (Ctrl+E). */
  quality?: QuickExportQuality | undefined,
}

/** The quality settings an export runs with. */
export interface ExportQuality {
  isSizeLimited: boolean,
  sizeLimitMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  transform: ResolvedSizeLimitedTransformSettings,
}

/**
 * The sheet's quality, or a preset's instead. A preset is one of the sheet's preset cards, so its resolution and
 * frame rate are Auto, as on a sheet that was never changed (whatever this sheet has now).
 */
export function resolveExportQuality(sheet: ExportQuality, override: QuickExportQuality | undefined): ExportQuality {
  if (override == null) return sheet;
  return {
    isSizeLimited: override.encodeMode === 'size_limited',
    sizeLimitMb: override.sizeLimitMb,
    controlMode: 'simple',
    preset: override.sizeLimitPreset,
    transform: resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: override.sizeLimitPreset,
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
      advancedResolution: 'auto',
      advancedFps: 'auto',
    }),
  };
}

/**
 * Whether an export keeps the recording whole with the clips as chapters (advanced mode's "Segments to chapters").
 * Only an Original quality export does: the sheet turns that mode off when it fits a size, and a quick export preset
 * that fits a size cuts the selected clips instead, leaving the setting as it is.
 */
export function isChaptersOnlyExport({ segmentsToChaptersOnly, isSizeLimited }: { segmentsToChaptersOnly: boolean, isSizeLimited: boolean }) {
  return segmentsToChaptersOnly && !isSizeLimited;
}

const mbFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "Original quality", or the size limit: "10 MB". */
export function describeExportQuality({ isSizeLimited, sizeLimitMb }: Pick<ExportQuality, 'isSizeLimited' | 'sizeLimitMb'>, t: TranslateQuickExport) {
  return isSizeLimited ? t('{{size}} MB', { size: mbFormatter.format(sizeLimitMb) }) : t('Original quality', {});
}

/** A preset by its name and what it makes: "Discord · 10 MB". Without a name, only the second part. */
export function getQuickExportPresetLabel(preset: QuickExportPreset, t: TranslateQuickExport) {
  const quality = describeExportQuality({ isSizeLimited: preset.encodeMode === 'size_limited', sizeLimitMb: preset.sizeLimitMb }, t);
  const name = preset.name.trim();
  // The first preset's default name is stored in English: in another language, it's the quality's own words.
  const isDefaultName = name === '' || name === quality || (preset.encodeMode === 'lossless' && name === 'Original quality');
  return isDefaultName ? quality : `${name} · ${quality}`;
}

/** Ctrl+E (and Ctrl+click), with the sheet's settings: "Last settings · 10 MB". */
export function getLastSettingsLabel(quality: Pick<ExportQuality, 'isSizeLimited' | 'sizeLimitMb'>, t: TranslateQuickExport) {
  return `${t('Last settings', {})} · ${describeExportQuality(quality, t)}`;
}
