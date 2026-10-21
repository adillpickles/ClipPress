import type { HTMLAttributes } from 'react';
import { useMemo } from 'react';

import { useAppContext } from '../contexts';
import { getKeyDisplayName } from '../util/keyNames';


export default function Kbd({ code, ...props }: { code: string } & HTMLAttributes<HTMLElement>) {
  const { keyboardLayoutMap } = useAppContext();

  const keyName = useMemo(() => (keyboardLayoutMap == null ? undefined : getKeyDisplayName(code, keyboardLayoutMap)), [code, keyboardLayoutMap]);

  if (keyName == null) { // not yet loaded keyboard map
    return null;
  }

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <kbd {...props}>{keyName}</kbd>
  );
}
