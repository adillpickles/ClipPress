import type { CSSProperties } from 'react';
import { useState } from 'react';

import TextInput from './TextInput';
import parseSizeLimitMb from '../util/sizeLimitMb';

/**
 * The size limit box. It keeps its own text, so it can be emptied or hold a half-typed "0." while the last good
 * limit stays in use. A controlled number field snapped the old value back instead: backspacing "20" to type 8
 * gave 28. Leaving the box (or Enter) with nothing usable in it puts the current limit back.
 */
export default function SizeLimitMbInput({ value, onChange, id, style, 'aria-label': ariaLabel }: {
  value: number,
  onChange: (mb: number) => void,
  id?: string | undefined,
  style?: CSSProperties | undefined,
  'aria-label'?: string | undefined,
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [shownValue, setShownValue] = useState(value);

  // Follow a change made elsewhere (a quick pick, the other mode's box), but leave a draft such as "8." alone
  // while it already means that number.
  if (value !== shownValue) {
    setShownValue(value);
    if (parseSizeLimitMb(draft) !== value) setDraft(String(value));
  }

  const isValid = parseSizeLimitMb(draft) != null;
  const restoreIfInvalid = () => {
    if (!isValid) setDraft(String(value));
  };

  return (
    <TextInput
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      aria-invalid={!isValid}
      aria-label={ariaLabel}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseSizeLimitMb(e.target.value);
        if (parsed != null) onChange(parsed);
      }}
      onBlur={restoreIfInvalid}
      onKeyDown={(e) => {
        if (e.key === 'Enter') restoreIfInvalid();
      }}
      style={style}
    />
  );
}
