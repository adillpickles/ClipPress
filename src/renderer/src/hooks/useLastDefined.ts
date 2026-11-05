import { useState } from 'react';

/**
 * `value`, or while it's undefined the last value it had: what a dialog shows while it fades out after what opened it
 * is gone (a closed dialog's content stays mounted for its close animation).
 */
export default function useLastDefined<T>(value: T | undefined) {
  const [last, setLast] = useState(value);
  // Set during render, React's way to follow a prop: no frame shows the old value.
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}
