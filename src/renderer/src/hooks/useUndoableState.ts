import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import UndoableHistory from '../undoableHistory';
import type { UndoableSetOptions } from '../undoableHistory';

export interface UndoableControls<T> {
  back: () => boolean,
  forward: () => boolean,
  /** Replace the whole history, e.g. when a file is opened or closed. */
  reset: (value: T) => void,
}

/**
 * State with its own undo history. `onNewStep` fires once per new undo step so a coordinator can
 * keep one undo order across several pieces of state (see editHistoryOrder).
 */
export default function useUndoableState<T>(initial: T, { capacity = 100, onNewStep }: { capacity?: number, onNewStep?: () => void } = {}) {
  const [state, setRawState] = useState(initial);
  const [history] = useState(() => new UndoableHistory(initial, capacity));
  const onNewStepRef = useRef(onNewStep);
  useEffect(() => {
    onNewStepRef.current = onNewStep;
  }, [onNewStep]);

  // Updates read the history rather than React's state, so several in one tick compose correctly.
  const setState = useCallback((update: T | ((current: T) => T), options?: UndoableSetOptions) => {
    const next = typeof update === 'function' ? (update as (current: T) => T)(history.current) : update;
    if (history.set(next, options)) onNewStepRef.current?.();
    setRawState(history.current);
  }, [history]);

  const controls = useMemo<UndoableControls<T>>(() => ({
    back: () => {
      if (!history.back()) return false;
      setRawState(history.current);
      return true;
    },
    forward: () => {
      if (!history.forward()) return false;
      setRawState(history.current);
      return true;
    },
    reset: (value: T) => {
      history.reset(value);
      setRawState(value);
    },
  }), [history]);

  return [state, setState, controls] as const;
}
