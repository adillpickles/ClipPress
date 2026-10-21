import type { ReactNode } from 'react';

import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T,
  label: ReactNode,
  title?: string | undefined,
  disabled?: boolean | undefined,
}

/** A row of mutually exclusive choices (a radio group drawn as one control). */
export default function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, fullWidth = true }: {
  options: readonly SegmentedOption<T>[],
  value: T | undefined,
  onChange: (newValue: T) => void,
  ariaLabel: string,
  fullWidth?: boolean,
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={[styles['group'], ...(fullWidth ? [styles['fullWidth']] : [])].join(' ')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={option.disabled}
          title={option.title}
          className={[styles['option'], ...(option.value === value ? [styles['active']] : [])].join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
