import { useEffect, useState } from 'react';

/**
 * `value`, or while it's undefined the last value it had: what a dialog shows while it fades out after what opened it
 * is gone (a closed dialog's content stays mounted for its close animation). With `forMs`, only for that long.
 */
export default function useLastDefined<T>(value: T | undefined, forMs?: number) {
  const [last, setLast] = useState(value);
  // Set during render, React's way to follow a prop: no frame shows the old value.
  if (value !== undefined && value !== last) setLast(value);
  useEffect(() => {
    if (value !== undefined || forMs == null) return undefined;
    const timeout = setTimeout(() => setLast(undefined), forMs);
    return () => clearTimeout(timeout);
  }, [forMs, value]);
  return value ?? last;
}
