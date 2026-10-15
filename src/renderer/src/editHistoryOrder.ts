/**
 * One undo order across separately stored edits.
 *
 * Segments, text, audio gain and speed-control visibility each keep their own history. This
 * remembers which of them changed in what order, so Ctrl+Z undoes the most recent edit wherever it
 * was, instead of always stepping back through the segments.
 *
 * It also decides when an update may join the latest step instead of adding one (a drag, a burst
 * of typing): only while that step is still the latest edit of all. An edit elsewhere, an undo or
 * a redo in between always starts a new step, so the shared order stays true.
 */
export interface EditDomainHistory {
  back: () => boolean,
  forward: () => boolean,
}

/** Updates of one gesture this close together become one undo step. */
export const coalesceWindowMs = 1000;

/** How one piece of undoable state reports to the shared order. */
export interface EditTracker {
  /** Whether an update with this key may join the latest step instead of adding one. */
  continues: (coalesceKey: string | undefined) => boolean,
  /** An edit was applied, either as a new undo step or by extending the latest one. */
  edited: (change: { newStep: boolean, coalesceKey: string | undefined }) => void,
  /** Its history was replaced (a file was opened or closed), so nothing of it can be extended. */
  reset: () => void,
}

const maxSteps = 500;

export default class EditHistoryOrder<Domain extends string> {
  private done: Domain[] = [];

  private undone: Domain[] = [];

  /** The latest edit, while updates with its key may still join its step. */
  private latest: { domain: Domain, coalesceKey: string, time: number } | undefined;

  private readonly trackers = new Map<Domain, EditTracker>();

  private readonly now: () => number;

  constructor(now = () => Date.now()) {
    this.now = now;
  }

  /** The tracker for one domain; the same object every time. */
  tracker(domain: Domain) {
    let tracker = this.trackers.get(domain);
    if (tracker == null) {
      tracker = {
        continues: (coalesceKey) => this.continues(domain, coalesceKey),
        edited: (change) => this.edited(domain, change),
        reset: () => {
          if (this.latest?.domain === domain) this.latest = undefined;
        },
      };
      this.trackers.set(domain, tracker);
    }
    return tracker;
  }

  private continues(domain: Domain, coalesceKey: string | undefined) {
    const { latest } = this;
    return coalesceKey != null && latest != null && latest.domain === domain && latest.coalesceKey === coalesceKey
      && this.now() - latest.time < coalesceWindowMs;
  }

  private edited(domain: Domain, { newStep, coalesceKey }: { newStep: boolean, coalesceKey: string | undefined }) {
    if (newStep) {
      this.done.push(domain);
      if (this.done.length > maxSteps) this.done.shift();
    }
    // A new edit, even one that extends the latest step, ends what could be redone.
    this.undone = [];
    this.latest = coalesceKey != null ? { domain, coalesceKey, time: this.now() } : undefined;
  }

  /** Undo the latest edit. Entries whose history ran out (capacity, reset) are skipped. */
  undo(histories: Record<Domain, EditDomainHistory>) {
    this.latest = undefined;
    while (this.done.length > 0) {
      const domain = this.done.pop()!;
      if (histories[domain].back()) {
        this.undone.push(domain);
        return domain;
      }
    }
    return undefined;
  }

  redo(histories: Record<Domain, EditDomainHistory>) {
    this.latest = undefined;
    while (this.undone.length > 0) {
      const domain = this.undone.pop()!;
      if (histories[domain].forward()) {
        this.done.push(domain);
        return domain;
      }
    }
    return undefined;
  }

  clear() {
    this.done = [];
    this.undone = [];
    this.latest = undefined;
  }
}
