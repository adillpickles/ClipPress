import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import UndoableHistory, { applyUndoableUpdate } from '../undoableHistory';
import type { UndoableSetOptions } from '../undoableHistory';
import type { EditTracker } from '../editHistoryOrder';

export interface UndoableControls<T> {
  back: () => boolean,
  forward: () => boolean,
  /** Replace the whole history, e.g. when a file is opened or closed. */
  reset: (value: T) => void,
  /** The latest value, with updates made earlier in this tick (React's state shows them only after rendering). */
  getCurrent: () => T,
}

/**
 * State with its own undo history. Every edit is reported to `tracker` as it happens, so a
 * coordinator can keep one undo order across several pieces of state (see editHistoryOrder).
 */
export default function useUndoableState<T>(initial: T, { capacity = 100, tracker }: { capacity?: number, tracker?: EditTracker | undefined } = {}) {
  const [state, setRawState] = useState(initial);
  const [history] = useState(() => new UndoableHistory(initial, capacity));
  const trackerRef = useRef(tracker);
  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  // Updates read the history rather than React's state, so several in one tick compose correctly,
  // and each is recorded right away, in the order the edits were made.
  const setState = useCallback((update: T | ((current: T) => T), options?: UndoableSetOptions) => {
    const next = typeof update === 'function' ? (update as (current: T) => T)(history.current) : update;
    applyUndoableUpdate(history, next, trackerRef.current, options);
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
      trackerRef.current?.reset();
      setRawState(value);
    },
    getCurrent: () => history.current,
  }), [history]);

  return [state, setState, controls] as const;
}
