import type { EditTracker } from './editHistoryOrder';

export type UndoableSetResult = 'unchanged' | 'added' | 'extended';

export interface UndoableSetOptions {
  /** Updates with this key join the latest step while it is still the latest edit (a drag, a burst of typing). */
  coalesceKey?: string | undefined,
  /** The key is one gesture's own (a drag): its updates join however long it pauses, not only within the time window. */
  wholeGesture?: boolean | undefined,
  /** Change the current step in place, without creating an undo step (bookkeeping, not an edit). */
  merge?: boolean | undefined,
}

/** Undo history for one piece of state. Plain data and logic, so it can be tested without React. */
export default class UndoableHistory<T> {
  private steps: T[];

  private position = 0;

  private readonly capacity: number;

  constructor(initial: T, capacity = 100) {
    this.steps = [initial];
    this.capacity = Math.max(2, capacity);
  }

  get current() {
    return this.steps[this.position]!;
  }

  /**
   * Records an edit. With `extend`, the edit replaces the latest step instead of adding one (the
   * rest of a drag or a typing burst), unless that step is the first, which the user can always
   * return to, or is no longer the latest because of an undo.
   */
  set(next: T, { extend = false }: { extend?: boolean } = {}): UndoableSetResult {
    if (next === this.current) return 'unchanged';
    if (extend && this.position > 0 && this.position === this.steps.length - 1) {
      this.steps[this.position] = next;
      return 'extended';
    }
    // At capacity the oldest steps are dropped; the cursor stays on the new, latest step.
    this.steps = [...this.steps.slice(0, this.position + 1), next].slice(-this.capacity);
    this.position = this.steps.length - 1;
    return 'added';
  }

  /** Changes the current step in place, without an undo step (bookkeeping, not an edit). */
  replaceCurrent(next: T) {
    this.steps[this.position] = next;
  }

  back() {
    if (this.position === 0) return false;
    this.position -= 1;
    return true;
  }

  forward() {
    if (this.position >= this.steps.length - 1) return false;
    this.position += 1;
    return true;
  }

  reset(value: T) {
    this.steps = [value];
    this.position = 0;
  }
}

/**
 * Applies one update to a history and reports it to the shared undo order right away, so edits
 * are ordered as they were made. This is what useUndoableState does on every update.
 */
export function applyUndoableUpdate<T>(history: UndoableHistory<T>, next: T, tracker: EditTracker | undefined, { coalesceKey, wholeGesture = false, merge = false }: UndoableSetOptions = {}) {
  if (merge) {
    history.replaceCurrent(next);
    return;
  }
  const result = history.set(next, { extend: tracker?.continues(coalesceKey, wholeGesture) ?? false });
  if (result !== 'unchanged') tracker?.edited({ newStep: result === 'added', coalesceKey });
}
