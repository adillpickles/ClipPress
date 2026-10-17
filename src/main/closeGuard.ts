/**
 * What the renderer decided about a request to close the window: 'close' once everything is saved,
 * 'discard' when the user chose to close without saving what could not be saved, or 'cancel'.
 */
export type CloseDecision = 'close' | 'discard' | 'cancel';

/**
 * Why the user is offered to close without saving: the renderer does not respond, or it is still
 * busy getting ready although the user closed again.
 */
export type StalledReason = 'unresponsive' | 'busy';

/** How long to wait for an aborted "not responding" dialog to close before going on regardless. */
const dialogCloseTimeoutMs = 5000;

/** How many times in a row the page may refuse to unload before the user is asked instead. */
const maxUnloadRefusals = 3;

export interface CloseGuardOptions {
  /** Whether to ask "Are you sure you want to quit?" first (the user's setting, with a file open). */
  shouldConfirm: () => boolean,
  confirm: () => Promise<boolean>,
  /** Whether the renderer can be asked at all: it has loaded the app and has not crashed. */
  canAskRenderer: () => boolean,
  /** Sends a request. The renderer acknowledges it at once, saves, then answers with a decision. */
  askRenderer: (requestId: number) => void,
  /**
   * Offers to close without saving. Resolves 'close' to close without saving, or 'wait'.
   * `signal` aborts (closing the dialog) when the renderer answers after all; the promise must
   * then settle once the dialog is gone, because the window is not closed before that.
   */
  showNotResponding: (signal: AbortSignal, reason: StalledReason) => Promise<'close' | 'wait'>,
  /** Closes the window for real; `handleClose` lets that close through. */
  close: () => void,
  /**
   * How long the renderer has to acknowledge a request, and to answer once the user closed again,
   * before the user is offered to stop waiting.
   */
  ackTimeoutMs: number,
  onError: (err: unknown) => void,
}

interface PendingRequest {
  id: number,
  acknowledged: boolean,
  /** The window's renderer hangs (Electron's `unresponsive`). */
  hung: boolean,
  /** Whether to offer the user to stop waiting now. */
  offer: boolean,
  /** The user chose to keep waiting for a renderer that did not respond: offer again if it stays silent. */
  waitingOnSilence: boolean,
  /** The user closed again while the renderer was getting ready: offer to stop waiting unless it answers soon. */
  nudged: boolean,
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
 * decides; on 'close' or 'discard' the window is closed again and let through. Preventing it also
 * cancels a quit in progress, before `will-quit` and `quit`. The updater installs a downloaded
 * update on `quit`, so nothing is installed before the project is saved (or the user chose to
 * close without saving), and nothing at all when the close is cancelled or called off.
 *
 * The window then only goes away once its page lets it unload. A page that refuses has accepted a
 * change after saving: the close is called off and the renderer asked again (`onUnloadPrevented`).
 *
 * Neither a renderer that does not answer, hangs or reloads, nor one that keeps refusing, ever
 * keeps the app open for good: the request is called off, or the user is offered to close without
 * saving (closing again while the renderer is busy offers it too).
 */
export default class CloseGuard {
  private readonly options: CloseGuardOptions;

  /**
   * Set while the window is being closed for real: 'saved' once the renderer saved everything,
   * 'forced' when closing without saving (the user's choice, or a renderer that cannot be asked).
   */
  private closing: 'saved' | 'forced' | undefined;

  private running = false;

  private request: PendingRequest | undefined;

  private nextRequestId = 1;

  /** How many times in a row the page refused to unload after saving everything. */
  private unloadRefusals = 0;

  constructor(options: CloseGuardOptions) {
    this.options = options;
  }

  /** For the window's `close` event: true to let the close through, false to prevent it for now. */
  handleClose() {
    if (this.closing != null) return true;
    if (this.running) {
      // Closing again while the renderer is getting ready: offer a way out if it takes long.
      const { request } = this;
      if (request?.acknowledged && !request.offer && !request.nudged) {
        request.nudged = true;
        request.wake();
      }
      return false;
    }
    this.unloadRefusals = 0;
    this.start(this.decide({ confirm: true }));
    return false;
  }

  /** The renderer received request `id`. */
  onAcknowledged(id: number) {
    const { request } = this;
    if (request?.id !== id) return;
    request.acknowledged = true;
    request.offer = false;
    request.waitingOnSilence = false;
    request.wake();
  }

  /** The renderer answered request `id`. */
  onDecision(id: number, decision: CloseDecision) {
    if (this.request?.id !== id) return;
    this.request.decide(decision === 'close' || decision === 'discard' ? decision : 'cancel');
  }

  /** The window's renderer hangs (`unresponsive`) or recovered (`responsive`). */
  onResponsiveChange(responsive: boolean) {
    const { request } = this;
    if (request == null) return;
    request.hung = !responsive;
    request.offer = !responsive;
    if (responsive) request.waitingOnSilence = false;
    request.wake();
  }

  /** The renderer crashed or was destroyed: there is nothing left to save. */
  onRendererGone() {
    this.request?.decide('discard');
  }

  /**
   * The renderer started loading a new page (a reload). The page that was asked is gone and will
   * never answer, so closing is called off: the user can close again. Nothing is installed.
   */
  onRendererNavigated() {
    this.request?.decide('cancel');
  }

  /**
   * The page refused to unload, because it has unsaved changes. Returns whether to unload it
   * regardless.
   *
   * While closing after the renderer saved everything, the page accepted a change since: the close
   * is called off (as Electron does then) and the renderer is asked again, which saves it, without
   * confirming again. While closing without saving, the page is unloaded regardless. Otherwise (a
   * reload), the page stays, with its changes.
   */
  onUnloadPrevented() {
    const { closing } = this;
    if (closing === 'forced') return true;
    if (closing === 'saved') {
      this.closing = undefined;
      this.unloadRefusals += 1;
      if (!this.running) {
        // Not expected to repeat: each time takes a new change. If it does, the user decides.
        this.start(this.unloadRefusals > maxUnloadRefusals ? this.offerToDiscard() : this.decide({ confirm: false }));
      }
    }
    return false;
  }

  private start(deciding: Promise<CloseDecision>) {
    this.running = true;
    deciding.catch((err: unknown): CloseDecision => {
      // Not expected. Let the user close; a guard that is broken must not trap them.
      this.options.onError(err);
      return 'discard';
    }).then((decision) => {
      this.running = false;
      if (decision === 'cancel') return;
      this.closing = decision === 'close' ? 'saved' : 'forced';
      this.options.close();
    }).catch((err: unknown) => {
      this.closing = undefined;
      this.options.onError(err);
    });
  }

  private async offerToDiscard(): Promise<CloseDecision> {
    const choice = await this.options.showNotResponding(new AbortController().signal, 'busy');
    if (choice === 'close') return 'discard';
    this.unloadRefusals = 0;
    return this.decide({ confirm: false });
  }

  private async decide({ confirm }: { confirm: boolean }): Promise<CloseDecision> {
    if (confirm && this.options.shouldConfirm() && !(await this.options.confirm())) return 'cancel';
    // A renderer that has not loaded the app, or has crashed, has nothing to save.
    if (!this.options.canAskRenderer()) return 'discard';

    let decide!: (decision: CloseDecision) => void;
    const decision = new Promise<CloseDecision>((resolve) => { decide = resolve; });
    const request: PendingRequest = { id: this.nextRequestId, acknowledged: false, hung: false, offer: false, waitingOnSilence: false, nudged: false, decision, decide, wake: () => undefined };
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
      if (!request.offer) {
        // The renderer looks alive: wait for its answer (it has its own notice for slow saves).
        // Until it acknowledges, after the user chose to wait for a silent renderer, or after they
        // closed again, not forever.
        const timer = request.acknowledged && !request.waitingOnSilence && !request.nudged ? undefined : setTimeout(() => {
          request.offer = true;
          request.wake();
        }, this.options.ackTimeoutMs);
        // eslint-disable-next-line no-await-in-loop
        const event = await Promise.race([decided, changed()]);
        clearTimeout(timer);
        if (event != null) return event.decision;
      } else {
        // Offer to close without saving, until the renderer answers after all.
        const reason: StalledReason = request.acknowledged && !request.hung ? 'busy' : 'unresponsive';
        const abort = new AbortController();
        const dialog = this.options.showNotResponding(abort.signal, reason).then((choice) => ({ choice }));
        // eslint-disable-next-line no-await-in-loop
        const event = await Promise.race([decided, changed(), dialog]);
        abort.abort();
        // Closing the window while a native dialog is still open or closing crashed Electron on
        // Windows (access violation, seen in the installer upgrade test): let the dialog go first.
        // eslint-disable-next-line no-await-in-loop
        await Promise.race([dialog.catch(() => undefined), new Promise((resolve) => { setTimeout(resolve, dialogCloseTimeoutMs); })]);
        if (event != null) {
          if ('decision' in event) return event.decision;
          if (event.choice === 'close') return 'discard';
          // Keep waiting. A silent or hung renderer is offered again if it stays so for another
          // period; a busy one only if the user closes again.
          request.offer = false;
          request.waitingOnSilence = !request.acknowledged || request.hung;
          request.nudged = false;
        }
      }
    }
  }
}
