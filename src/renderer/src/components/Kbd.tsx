import type { HTMLAttributes } from 'react';
import { useMemo } from 'react';

import { useAppContext } from '../contexts';
import { getKeyDisplayName } from '../util/keyNames';


export default function Kbd({ code, ...props }: { code: string } & HTMLAttributes<HTMLElement>) {
  const { keyboardLayoutMap } = useAppContext();

  // Keycaps show letters in capitals.
  const keyName = useMemo(() => {
    if (keyboardLayoutMap == null) return undefined;
    const name = getKeyDisplayName(code, keyboardLayoutMap);
    return name.length === 1 ? name.toUpperCase() : name;
  }, [code, keyboardLayoutMap]);

  if (keyName == null) { // not yet loaded keyboard map
    return null;
  }

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <kbd {...props}>{keyName}</kbd>
  );
}
