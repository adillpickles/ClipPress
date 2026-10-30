import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FfmpegFormat } from '../outFormats';
import allOutFormats from '../outFormats';
import { withBlur } from '../util';
import Select from './Select';

const commonVideoAudioFormats = ['matroska', 'mov', 'mp4', 'mpegts', 'ogv', 'webm'] as const;
const commonAudioFormats = ['flac', 'ipod', 'mp3', 'oga', 'ogg', 'opus', 'wav'] as const;
const commonSubtitleFormats = ['ass', 'srt', 'sup', 'webvtt'] as const;

/** A group's name as a heading, without the colon its words were written with. */
const heading = (label: string) => label.replace(/[:：]\s*$/, '');

function renderFormatOptions(formats: FfmpegFormat[]) {
  return formats.map((format) => (
    <option key={format} value={format}>{format} - {allOutFormats[format]}</option>
  ));
}

function OutputFormatSelect({ style, disabled, detectedFileFormat, fileFormat, onOutputFormatUserChange }: {
  style: CSSProperties,
  disabled?: boolean,
  detectedFileFormat?: string | undefined,
  fileFormat?: string | undefined,
  onOutputFormatUserChange: (a: string) => void,
}) {
  const { t } = useTranslation();

  const commonVideoAudioFormatsExceptDetectedFormat = useMemo(() => commonVideoAudioFormats.filter((f) => f !== detectedFileFormat), [detectedFileFormat]);
  const commonAudioFormatsExceptDetectedFormat = useMemo(() => commonAudioFormats.filter((f) => f !== detectedFileFormat), [detectedFileFormat]);
  const commonSubtitleFormatsExceptDetectedFormat = useMemo(() => commonSubtitleFormats.filter((f) => f !== detectedFileFormat), [detectedFileFormat]);
  const commonFormatsAndDetectedFormat = useMemo(() => new Set([...commonVideoAudioFormats, ...commonAudioFormats, commonSubtitleFormats, detectedFileFormat]), [detectedFileFormat]);

  const otherFormats = useMemo(() => (Object.keys(allOutFormats) as (keyof typeof allOutFormats)[]).filter((format) => !commonFormatsAndDetectedFormat.has(format)), [commonFormatsAndDetectedFormat]);

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <Select style={style} disabled={disabled} value={fileFormat || ''} title={t('Output container format:')} onChange={withBlur((e) => onOutputFormatUserChange(e.target.value))}>
      {/* Shown only while no format is chosen; the list itself starts with the formats. */}
      <option key="placeholder" value="" disabled hidden>{t('Output container format:')}</option>

      {detectedFileFormat && (
        <option key={detectedFileFormat} value={detectedFileFormat}>
          {detectedFileFormat} - {(allOutFormats as Record<string, string>)[detectedFileFormat]} {t('(detected)')}
        </option>
      )}

      <optgroup label={heading(t('Common video/audio formats:'))}>
        {renderFormatOptions(commonVideoAudioFormatsExceptDetectedFormat)}
      </optgroup>

      <optgroup label={heading(t('Common audio formats:'))}>
        {renderFormatOptions(commonAudioFormatsExceptDetectedFormat)}
      </optgroup>

      <optgroup label={heading(t('Common subtitle formats:'))}>
        {renderFormatOptions(commonSubtitleFormatsExceptDetectedFormat)}
      </optgroup>

      <optgroup label={heading(t('All other formats:'))}>
        {renderFormatOptions(otherFormats)}
      </optgroup>
    </Select>
  );
}

export default memo(OutputFormatSelect);
