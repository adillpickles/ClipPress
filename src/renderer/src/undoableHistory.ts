/** Updates with the same key this close together become one undo step (a drag, a burst of typing). */
export const coalesceWindowMs = 1000;

export interface UndoableSetOptions {
  /** Consecutive updates with this key within a second are merged into one step. */
  coalesceKey?: string | undefined,
  /** Change the current step in place, without creating an undo step (bookkeeping, not an edit). */
  merge?: boolean | undefined,
}

/** Undo history for one piece of state. Plain data and logic, so it can be tested without React. */
export default class UndoableHistory<T> {
  private steps: T[];

  private position = 0;

  private lastKey: string | undefined;

  private lastTime = 0;

  private readonly capacity: number;

  private readonly now: () => number;

  constructor(initial: T, capacity = 100, now = () => Date.now()) {
    this.steps = [initial];
    this.capacity = capacity;
    this.now = now;
  }

  get current() {
    return this.steps[this.position]!;
  }

  /** Returns whether a new undo step was created. */
  set(next: T, { coalesceKey, merge = false }: UndoableSetOptions = {}) {
    if (next === this.current) return false;
    const now = this.now();
    // Never fold an edit into the first step: that is the state the user can always return to.
    const coalesce = coalesceKey != null && coalesceKey === this.lastKey && now - this.lastTime < coalesceWindowMs
      && this.position > 0 && this.position === this.steps.length - 1;
    let newStep = false;
    if (merge || coalesce) {
      this.steps[this.position] = next;
    } else {
      this.steps = [...this.steps.slice(0, this.position + 1), next].slice(-this.capacity);
      this.position = this.steps.length - 1;
      newStep = true;
    }
    if (!merge) {
      this.lastKey = coalesceKey;
      this.lastTime = now;
    }
    return newStep;
  }

  back() {
    if (this.position === 0) return false;
    this.position -= 1;
    this.lastKey = undefined;
    return true;
  }

  forward() {
    if (this.position >= this.steps.length - 1) return false;
    this.position += 1;
    this.lastKey = undefined;
    return true;
  }

  reset(value: T) {
    this.steps = [value];
    this.position = 0;
    this.lastKey = undefined;
  }
}
