import { useState } from 'react';

/** True from the first time `shown` is: a lazy-loaded dialog stays mounted once opened, so it can fade out when closed. */
export default function useStaysMounted(shown: boolean) {
  const [mounted, setMounted] = useState(shown);
  if (shown && !mounted) setMounted(true);
  return mounted || shown;
}
