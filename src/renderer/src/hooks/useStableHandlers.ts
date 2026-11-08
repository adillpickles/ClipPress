import { useInsertionEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => unknown;

/**
 * Event handlers that keep their identity between renders and always call the latest ones given: for a list of
 * memoised children (clip blocks, clip cards), so an edit re-renders only the clip it changed instead of every one
 * whose handlers depend on the clips. Only for handlers called on an event (a click, a menu item), never during
 * render, where they would still run the previous render's. A handler left out (undefined) stays undefined.
 */
export default function useStableHandlers<T extends Record<string, Handler | undefined>>(handlers: T): T {
  const latest = useRef(handlers);
  useInsertionEffect(() => {
    latest.current = handlers;
  });
  // Each key's wrapper, made once (a cache, so kept in state rather than read from a ref during render).
  const [stable] = useState(() => new Map<string, Handler>());
  const result: Record<string, Handler | undefined> = {};
  for (const key of Object.keys(handlers)) {
    if (handlers[key] == null) {
      result[key] = undefined;
    } else {
      let handler = stable.get(key);
      if (handler == null) {
        handler = (...args) => latest.current[key]?.(...args);
        // The wrapper reads the ref only when it's called, on an event.
        // eslint-disable-next-line react-hooks/refs
        stable.set(key, handler);
      }
      result[key] = handler;
    }
  }
  return result as T;
}
