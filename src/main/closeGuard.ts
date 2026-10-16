/** Whether the window may close, as decided by the renderer once it has saved (or the user chose). */
export type CloseDecision = 'close' | 'cancel';

export interface CloseGuardOptions {
  /** Whether to ask "Are you sure you want to quit?" first (the user's setting, with a file open). */
  shouldConfirm: () => boolean,
  confirm: () => Promise<boolean>,
  /** Whether the renderer can be asked at all: it has loaded the app and has not crashed. */
  canAskRenderer: () => boolean,
  /** Sends a request. The renderer acknowledges it at once, saves, then answers with a decision. */
  askRenderer: (requestId: number) => void,
  /**
   * Shown when the renderer does not respond. Resolves 'close' to close without saving, or 'wait'.
   * `signal` aborts (closing the dialog) when the renderer responds after all.
   */
  showNotResponding: (signal: AbortSignal) => Promise<'close' | 'wait'>,
  /** Closes the window for real; `handleClose` lets that close through. */
  close: () => void,
  /** How long the renderer has to acknowledge a request before the user is offered to stop waiting. */
  ackTimeoutMs: number,
  onError: (err: unknown) => void,
}

interface PendingRequest {
  id: number,
  acknowledged: boolean,
  unresponsive: boolean,
  /** The user chose to keep waiting for a renderer that did not respond: offer again if it stays silent. */
  waitingOnSilence: boolean,
  decision: Promise<CloseDecision>,
  decide: (decision: CloseDecision) => void,
  /** Wakes the waiting loop when something about the renderer changed. */
  wake: () => void,
}

/**
 * Keeps the main window from closing before the renderer has saved the project.
 *
 * Every way of closing (the window's close button, Alt+F4, File > Exit, the quit action) goes
 * through the window's `close` event. The first one is prevented while the renderer saves and
 * decides; on 'close' the window is closed again and let through. Preventing it also cancels a
 * quit in progress, before `will-quit` and `quit`. The updater installs a downloaded update on
 * `quit`, so nothing is installed before the project is saved (or the user chose to close without
 * saving), and nothing at all when the close is cancelled.
 *
 * A renderer that does not acknowledge the request, or hangs, never keeps the app open: the user is
 * offered to close without saving.
 */
export default class CloseGuard {
  private readonly options: CloseGuardOptions;

  private approved = false;

  private running = false;

  private request: PendingRequest | undefined;

  private nextRequestId = 1;

  constructor(options: CloseGuardOptions) {
    this.options = options;
  }

  /** For the window's `close` event: true to let the close through, false to prevent it for now. */
  handleClose() {
    if (this.approved) return true;
    if (!this.running) {
      this.running = true;
      this.decide().then((decision) => {
        if (decision !== 'close') return;
        this.approved = true;
        this.options.close();
      }).catch((err: unknown) => {
        // Not expected. Let the user close; a guard that is broken must not trap them.
        this.options.onError(err);
        this.approved = true;
        this.options.close();
      }).finally(() => {
        this.running = false;
      });
    }
    return false;
  }

  /** The renderer received request `id`. */
  onAcknowledged(id: number) {
    const { request } = this;
    if (request?.id !== id) return;
    request.acknowledged = true;
    request.unresponsive = false;
    request.waitingOnSilence = false;
    request.wake();
  }

  /** The renderer answered request `id`. */
  onDecision(id: number, decision: CloseDecision) {
    if (this.request?.id === id) this.request.decide(decision === 'close' ? 'close' : 'cancel');
  }

  /** The window's renderer hangs (`unresponsive`) or recovered (`responsive`). */
  onResponsiveChange(responsive: boolean) {
    const { request } = this;
    if (request == null) return;
    request.unresponsive = !responsive;
    if (responsive) request.waitingOnSilence = false;
    request.wake();
  }

  /** The renderer crashed or was destroyed: there is nothing left to save. */
  onRendererGone() {
    this.request?.decide('close');
  }

  private async decide(): Promise<CloseDecision> {
    if (this.options.shouldConfirm() && !(await this.options.confirm())) return 'cancel';
    if (!this.options.canAskRenderer()) return 'close';

    let decide!: (decision: CloseDecision) => void;
    const decision = new Promise<CloseDecision>((resolve) => { decide = resolve; });
    const request: PendingRequest = { id: this.nextRequestId, acknowledged: false, unresponsive: false, waitingOnSilence: false, decision, decide, wake: () => undefined };
    this.nextRequestId += 1;
    this.request = request;
    try {
      this.options.askRenderer(request.id);
      return await this.waitForDecision(request);
    } finally {
      this.request = undefined;
    }
  }

  private async waitForDecision(request: PendingRequest): Promise<CloseDecision> {
    const decided = request.decision.then((decision) => ({ decision }));
    const changed = () => new Promise<undefined>((resolve) => { request.wake = () => resolve(undefined); });

    for (;;) {
      if (!request.unresponsive) {
        // The renderer looks alive: wait for its answer (it has its own notice for slow saves).
        // Until it acknowledges, or after the user chose to wait for a silent renderer, not forever.
        const timer = request.acknowledged && !request.waitingOnSilence ? undefined : setTimeout(() => {
          request.unresponsive = true;
          request.wake();
        }, this.options.ackTimeoutMs);
        // eslint-disable-next-line no-await-in-loop
        const event = await Promise.race([decided, changed()]);
        clearTimeout(timer);
        if (event != null) return event.decision;
      } else {
        // It does not respond: offer to close without saving, until it responds after all.
        const abort = new AbortController();
        // eslint-disable-next-line no-await-in-loop
        const event = await Promise.race([
          decided,
          changed(),
          this.options.showNotResponding(abort.signal).then((choice) => ({ choice })),
        ]);
        abort.abort();
        if (event != null) {
          if ('decision' in event) return event.decision;
          if (event.choice === 'close') return 'close';
          // Keep waiting: offer again if it stays silent for another period.
          request.unresponsive = false;
          request.waitingOnSilence = true;
        }
      }
    }
  }
}
