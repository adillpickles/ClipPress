/**
 * One undo order across separately stored edits.
 *
 * Segments, text, audio gain and speed-control visibility each keep their own history. This
 * remembers which of them changed in what order, so Ctrl+Z undoes the most recent edit wherever it
 * was, instead of always stepping back through the segments.
 */
export interface EditDomainHistory {
  back: () => boolean,
  forward: () => boolean,
}

const maxSteps = 500;

export default class EditHistoryOrder<Domain extends string> {
  private done: Domain[] = [];

  private undone: Domain[] = [];

  record(domain: Domain) {
    this.done.push(domain);
    if (this.done.length > maxSteps) this.done.shift();
    this.undone = [];
  }

  /** Undo the latest edit. Entries whose history ran out (capacity, reset) are skipped. */
  undo(histories: Record<Domain, EditDomainHistory>) {
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
  }
}
