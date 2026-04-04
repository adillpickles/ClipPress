import type { SizeLimitControlMode, SizeLimitPreset } from '../../common/types.js';

const bytesPerMb = 1024 * 1024;
const maxAutoFileNameLength = 250;
const sizeFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const sizeLimitedFinalSizePlaceholder = '[Final Size]';

export type SizeLimitedAutoSizeLabel = number | typeof sizeLimitedFinalSizePlaceholder;

export interface SizeLimitedAutoNameItem {
  sizeLabel: SizeLimitedAutoSizeLabel,
  suffixLabel?: string | undefined,
}

function sanitizeAutoNamePart(value: string, safeOutputFileName: boolean) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  return safeOutputFileName ? trimmed.replaceAll(/[^\p{L}\p{N} .-_]/gu, '_') : trimmed;
}

function getModeLabel({
  controlMode,
  preset,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
}) {
  if (controlMode === 'advanced') return 'Advanced';

  switch (preset) {
    case 'max_quality': {
      return 'Max Quality';
    }
    case 'quality': {
      return 'Quality';
    }
    case 'fast': {
      return 'Fast';
    }
    default: {
      return 'Quality';
    }
  }
}

function formatAutoSizeLabel(sizeLabel: SizeLimitedAutoSizeLabel) {
  if (typeof sizeLabel === 'string') return sizeLabel;
  return `${sizeFormatter.format(sizeLabel / bytesPerMb)}MB`;
}

function buildAutoName({
  sourceBaseName,
  controlMode,
  preset,
  safeOutputFileName,
  item,
  disambiguator,
}: {
  sourceBaseName: string,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  safeOutputFileName: boolean,
  item: SizeLimitedAutoNameItem,
  disambiguator?: number | undefined,
}) {
  const ext = '.mp4';
  const disambiguatorSuffix = disambiguator != null ? `-${disambiguator}` : '';
  const parts = [
    formatAutoSizeLabel(item.sizeLabel),
    getModeLabel({ controlMode, preset }),
    sanitizeAutoNamePart(sourceBaseName, safeOutputFileName),
    sanitizeAutoNamePart(item.suffixLabel ?? '', safeOutputFileName),
  ].filter((part) => part.length > 0);

  let stem = parts.join(' ').trim();
  if (stem.length === 0) stem = 'ClipPress Export';

  if (safeOutputFileName) {
    const maxStemLength = Math.max(1, maxAutoFileNameLength - ext.length - disambiguatorSuffix.length);
    stem = stem.slice(0, maxStemLength).trimEnd();
  }

  return `${stem}${disambiguatorSuffix}${ext}`;
}

export function findAvailableSizeLimitedAutoFileName({
  sourceBaseName,
  controlMode,
  preset,
  safeOutputFileName,
  item,
  isReserved,
}: {
  sourceBaseName: string,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  safeOutputFileName: boolean,
  item: SizeLimitedAutoNameItem,
  isReserved: (fileName: string) => boolean,
}) {
  let disambiguator: number | undefined;
  let isAvailable = false;
  let fileName = '';

  while (!isAvailable) {
    fileName = buildAutoName({
      sourceBaseName,
      controlMode,
      preset,
      safeOutputFileName,
      item,
      disambiguator,
    });

    isAvailable = !isReserved(fileName);
    if (isAvailable) return fileName;
    disambiguator = disambiguator == null ? 2 : disambiguator + 1;
  }

  return fileName;
}

export function buildSizeLimitedAutoFileNames({
  sourceBaseName,
  controlMode,
  preset,
  safeOutputFileName,
  items,
}: {
  sourceBaseName: string,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  safeOutputFileName: boolean,
  items: SizeLimitedAutoNameItem[],
}) {
  const reserved = new Set<string>();

  return items.map((item) => {
    const fileName = findAvailableSizeLimitedAutoFileName({
      sourceBaseName,
      controlMode,
      preset,
      safeOutputFileName,
      item,
      isReserved: (candidate) => reserved.has(candidate),
    });
    reserved.add(fileName);
    return fileName;
  });
}

export function getSizeLimitedSeparateSuffixLabel({
  segmentName,
  index,
  totalSegments,
  safeOutputFileName,
}: {
  segmentName: string | undefined,
  index: number,
  totalSegments: number,
  safeOutputFileName: boolean,
}) {
  const sanitizedSegmentName = sanitizeAutoNamePart(segmentName ?? '', safeOutputFileName);
  if (sanitizedSegmentName.length > 0) return sanitizedSegmentName;
  if (totalSegments > 1) return `seg${index + 1}`;
  return '';
}

export function getSizeLimitedMergedSuffixLabel({ hasSeparateOutputs }: { hasSeparateOutputs: boolean }) {
  return hasSeparateOutputs ? 'merged' : '';
}
