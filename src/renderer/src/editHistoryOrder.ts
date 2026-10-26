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

/** A step: one domain's edit, or several made as one (`group`), undone and redone together. */
type Step<Domain> = Domain | Domain[];

export default class EditHistoryOrder<Domain extends string> {
  private done: Step<Domain>[] = [];

  private undone: Step<Domain>[] = [];

  /** The domains edited so far by the `group` running now. */
  private grouping: Domain[] | undefined;

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
    if (this.grouping != null) return false;
    const { latest } = this;
    return coalesceKey != null && latest != null && latest.domain === domain && latest.coalesceKey === coalesceKey
      && this.now() - latest.time < coalesceWindowMs;
  }

  private edited(domain: Domain, { newStep, coalesceKey }: { newStep: boolean, coalesceKey: string | undefined }) {
    if (this.grouping != null) {
      if (newStep && !this.grouping.includes(domain)) this.grouping.push(domain);
      this.undone = [];
      this.latest = undefined;
      return;
    }
    if (newStep) {
      this.done.push(domain);
      if (this.done.length > maxSteps) this.done.shift();
    }
    // A new edit, even one that extends the latest step, ends what could be redone.
    this.undone = [];
    this.latest = coalesceKey != null ? { domain, coalesceKey, time: this.now() } : undefined;
  }

  /**
   * The edits `edit` makes, in any number of domains (one each), become one step: one Ctrl+Z undoes all of them (Start
   * over resets the clips, the text and the volume at once).
   */
  group(edit: () => void) {
    this.grouping = [];
    try {
      edit();
    } finally {
      const domains = this.grouping;
      this.grouping = undefined;
      if (domains.length > 0) {
        this.done.push(domains.length === 1 ? domains[0]! : domains);
        if (this.done.length > maxSteps) this.done.shift();
      }
    }
  }

  /** Undo the latest edit. Entries whose history ran out (capacity, reset) are skipped. */
  undo(histories: Record<Domain, EditDomainHistory>) {
    this.latest = undefined;
    while (this.done.length > 0) {
      const step = this.done.pop()!;
      const domains = Array.isArray(step) ? [...step].reverse() : [step];
      // Every part of a group goes back, even if one of them ran out.
      const undone = domains.map((domain) => histories[domain].back()).some(Boolean);
      if (undone) {
        this.undone.push(step);
        return Array.isArray(step) ? step[0]! : step;
      }
    }
    return undefined;
  }

  redo(histories: Record<Domain, EditDomainHistory>) {
    this.latest = undefined;
    while (this.undone.length > 0) {
      const step = this.undone.pop()!;
      const domains = Array.isArray(step) ? step : [step];
      const redone = domains.map((domain) => histories[domain].forward()).some(Boolean);
      if (redone) {
        this.done.push(step);
        return Array.isArray(step) ? step[0]! : step;
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
