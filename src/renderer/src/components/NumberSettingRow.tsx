import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import RevertButton from './RevertButton';
import ScrubNumberInput from './ScrubNumberInput';
import SettingRow from './SettingRow';

/**
 * A number setting (a sensitivity, a step in seconds): the value on the right, in the row's own height, dragged up or
 * down or clicked to type; a ↺ beside the name once it differs from its default.
 */
export default function NumberSettingRow({ label, description, value, setValue, defaultValue, min, max, step, fineStep, decimals, unit }: {
  label: string,
  description?: ReactNode | undefined,
  value: number,
  setValue: (next: number) => void,
  defaultValue: number,
  min: number,
  max: number,
  /** Arrow keys and a drag land on this grid; `fineStep` with Shift, and per few pixels dragged. */
  step: number,
  fineStep: number,
  decimals: number,
  unit?: string,
}) {
  const { t } = useTranslation();
  // While typing, the text as typed ("0." on the way to "0.25"); the setting changes whenever it's a valid number.
  const [draft, setDraft] = useState<string>();
  const format = (v: number) => String(Number(v.toFixed(decimals)));
  const isValid = (text: string) => text !== '' && Number.isFinite(Number(text)) && Number(text) >= min && Number(text) <= max;

  const onChange = (text: string, { typed }: { typed: boolean }) => {
    setDraft(typed ? text : undefined);
    // At the precision it shows, so leaving the field shows what's kept.
    if (isValid(text)) setValue(Number(Number(text).toFixed(decimals)));
  };

  const changed = Math.abs(value - defaultValue) > 1e-9;
  const defaultText = `${format(defaultValue)}${unit != null ? ` ${unit}` : ''}`;
  return (
    <SettingRow
      label={label}
      description={description}
      labelExtra={changed ? <RevertButton title={t('Back to {{value}}', { value: defaultText })} onClick={() => { setDraft(undefined); setValue(defaultValue); }} /> : undefined}
    >
      <ScrubNumberInput
        compact
        value={draft ?? format(value)}
        onChange={onChange}
        onBlur={() => setDraft(undefined)}
        min={min}
        max={max}
        step={step}
        fineStep={fineStep}
        unit={unit}
        label={label}
        invalid={draft != null && !isValid(draft)}
        maxLength={String(Math.floor(max)).length + decimals + 1}
      />
    </SettingRow>
  );
}
