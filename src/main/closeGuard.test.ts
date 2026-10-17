import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CloseGuard from './closeGuard';
import type { CloseGuardOptions, StalledReason } from './closeGuard';

const ackTimeoutMs = 5000;

function setup(overrides: Partial<CloseGuardOptions> = {}) {
  const requests: number[] = [];
  const notResponding: { signal: AbortSignal, reason: StalledReason, choose: (choice: 'close' | 'wait') => void }[] = [];
  let closed = 0;
  let unloadRefusals = 0;
  let guard: CloseGuard;
  const options: CloseGuardOptions = {
    shouldConfirm: () => false,
    confirm: async () => true,
    canAskRenderer: () => true,
    askRenderer: (id) => { requests.push(id); },
    showNotResponding: (signal, reason) => new Promise((resolve) => {
      notResponding.push({ signal, reason, choose: resolve });
      signal.addEventListener('abort', () => resolve('wait'));
    }),
    // Like BrowserWindow.close(): emits `close` again, which the guard now lets through. Then the
    // page may refuse to unload, which Electron reports a moment later.
    close: () => {
      if (!guard.handleClose()) return;
      if (unloadRefusals === 0) {
        closed += 1;
        return;
      }
      unloadRefusals -= 1;
      setTimeout(() => { if (guard.onUnloadPrevented()) closed += 1; }, 10);
    },
    ackTimeoutMs,
    onError: vi.fn(),
    ...overrides,
  };
  guard = new CloseGuard(options);
  return {
    guard,
    requests,
    notResponding,
    closed: () => closed,
    /** A `close` event: whether it went through. */
    close: () => guard.handleClose(),
    /** The page refuses to unload the next `count` times (it has unsaved changes). */
    refuseUnload: (count: number) => { unloadRefusals = count; },
    wait: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CloseGuard', () => {
  it('holds the close until the renderer has saved and agrees, then closes once', async () => {
    const t = setup();
    expect(t.close()).toBe(false);
    await t.wait(0);
    expect(t.requests).toEqual([1]);
    t.guard.onAcknowledged(1);
    await t.wait(60_000);
    expect(t.closed()).toBe(0);
    t.guard.onDecision(1, 'close');
    await t.wait(0);
    expect(t.closed()).toBe(1);
    expect(t.close()).toBe(true);
  });

  it('stays open when the renderer cancels, and asks again on the next close', async () => {
    const t = setup();
    t.close();
    await t.wait(0);
    t.guard.onAcknowledged(1);
    t.guard.onDecision(1, 'cancel');
    await t.wait(0);
    expect(t.closed()).toBe(0);
    expect(t.close()).toBe(false);
    await t.wait(0);
    expect(t.requests).toEqual([1, 2]);
    t.guard.onDecision(2, 'close');
    await t.wait(0);
    expect(t.closed()).toBe(1);
  });

  it('ignores repeated closes while the renderer is saving', async () => {
    const t = setup();
    t.close();
    t.close();
    await t.wait(0);
    t.close();
    expect(t.requests).toEqual([1]);
  });

  it('ignores answers to an earlier request', async () => {
    const t = setup();
    t.close();
    await t.wait(0);
    t.guard.onDecision(1, 'cancel');
    await t.wait(0);
    t.close();
    await t.wait(0);
    t.guard.onDecision(1, 'close');
    await t.wait(0);
    expect(t.closed()).toBe(0);
  });

  it('asks "Are you sure you want to quit?" first when the user wants that, and stops on No', async () => {
    const confirm = vi.fn(async () => false);
    const t = setup({ shouldConfirm: () => true, confirm });
    t.close();
    await t.wait(0);
    expect(confirm).toHaveBeenCalledOnce();
    expect(t.requests).toEqual([]);
    expect(t.closed()).toBe(0);
  });

  it('closes at once when there is no renderer to ask', async () => {
    const t = setup({ canAskRenderer: () => false });
    t.close();
    await t.wait(0);
    expect(t.requests).toEqual([]);
    expect(t.closed()).toBe(1);
  });

  it('closes when the renderer crashes while saving', async () => {
    const t = setup();
    t.close();
    await t.wait(0);
    t.guard.onAcknowledged(1);
    t.guard.onRendererGone();
    await t.wait(0);
    expect(t.closed()).toBe(1);
  });

  it('waits for a slow renderer without offering to close once it has acknowledged', async () => {
    const t = setup();
    t.close();
    await t.wait(1000);
    t.guard.onAcknowledged(1);
    await t.wait(10 * 60_000);
    expect(t.notResponding).toEqual([]);
    expect(t.closed()).toBe(0);
  });

  describe('a renderer that does not respond', () => {
    it('offers to close without saving when the request is not acknowledged in time', async () => {
      const t = setup();
      t.close();
      await t.wait(ackTimeoutMs - 1);
      expect(t.notResponding).toHaveLength(0);
      await t.wait(1);
      expect(t.notResponding.map((d) => d.reason)).toEqual(['unresponsive']);
      t.notResponding[0]!.choose('close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('withdraws the offer when the renderer responds after all', async () => {
      const t = setup();
      t.close();
      await t.wait(ackTimeoutMs);
      t.guard.onAcknowledged(1);
      await t.wait(0);
      expect(t.notResponding[0]!.signal.aborted).toBe(true);
      t.guard.onDecision(1, 'close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('does not close the window before the withdrawn offer has closed', async () => {
      let closeDialog!: () => void;
      const t = setup({
        showNotResponding: (signal) => new Promise((resolve) => {
          // Like a native dialog: abort starts closing it, it is gone a little later.
          signal.addEventListener('abort', () => { closeDialog = () => resolve('wait'); });
        }),
      });
      t.close();
      await t.wait(ackTimeoutMs);
      t.guard.onAcknowledged(1);
      t.guard.onDecision(1, 'close');
      await t.wait(100);
      expect(t.closed()).toBe(0);
      closeDialog();
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('closes anyway if a withdrawn offer never reports that it closed', async () => {
      const t = setup({ showNotResponding: () => new Promise(() => undefined) });
      t.close();
      await t.wait(ackTimeoutMs);
      t.guard.onAcknowledged(1);
      t.guard.onDecision(1, 'close');
      await t.wait(4900);
      expect(t.closed()).toBe(0);
      await t.wait(200);
      expect(t.closed()).toBe(1);
    });

    it('offers again after the user chose to keep waiting, if it stays silent', async () => {
      const t = setup();
      t.close();
      await t.wait(ackTimeoutMs);
      t.notResponding[0]!.choose('wait');
      await t.wait(ackTimeoutMs);
      expect(t.notResponding).toHaveLength(2);
      t.notResponding[1]!.choose('close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('offers to close when the renderer hangs after acknowledging, and again if it stays hung', async () => {
      const t = setup();
      t.close();
      await t.wait(0);
      t.guard.onAcknowledged(1);
      t.guard.onResponsiveChange(false);
      await t.wait(0);
      expect(t.notResponding.map((d) => d.reason)).toEqual(['unresponsive']);
      t.notResponding[0]!.choose('wait');
      // Electron reports a hang only once; the offer comes back if nothing changes.
      await t.wait(ackTimeoutMs);
      expect(t.notResponding).toHaveLength(2);
      t.guard.onResponsiveChange(true);
      await t.wait(0);
      expect(t.notResponding[1]!.signal.aborted).toBe(true);
      t.guard.onDecision(1, 'close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });
  });

  it('closes when the user chose in the renderer to close without saving', async () => {
    const t = setup();
    t.close();
    await t.wait(0);
    t.guard.onAcknowledged(1);
    t.guard.onDecision(1, 'discard');
    await t.wait(0);
    expect(t.closed()).toBe(1);
  });

  it('treats an unknown answer as cancel', async () => {
    const t = setup();
    t.close();
    await t.wait(0);
    t.guard.onDecision(1, 'quit' as never);
    await t.wait(0);
    expect(t.closed()).toBe(0);
    t.close();
    await t.wait(0);
    expect(t.requests).toEqual([1, 2]);
  });

  // PR #56 re-audit finding 1: the renderer can accept a change after it answered 'close' and
  // before the window is gone. Its page then refuses to unload.
  describe('when the page refuses to unload after the renderer saved everything', () => {
    it('asks the renderer again, without confirming again, and closes once that is saved too', async () => {
      const confirm = vi.fn(async () => true);
      const t = setup({ shouldConfirm: () => true, confirm });
      t.refuseUnload(1);
      t.close();
      await t.wait(0);
      t.guard.onAcknowledged(1);
      t.guard.onDecision(1, 'close');
      await t.wait(20);
      expect(t.requests).toEqual([1, 2]);
      expect(t.closed()).toBe(0);
      expect(t.close()).toBe(false);
      t.guard.onAcknowledged(2);
      t.guard.onDecision(2, 'close');
      await t.wait(20);
      expect(t.closed()).toBe(1);
      expect(confirm).toHaveBeenCalledOnce();
    });

    it('stays open if the renderer then cancels, and asks again on the next close', async () => {
      const t = setup();
      t.refuseUnload(1);
      t.close();
      await t.wait(0);
      t.guard.onDecision(1, 'close');
      await t.wait(20);
      t.guard.onDecision(2, 'cancel');
      await t.wait(0);
      expect(t.closed()).toBe(0);
      t.close();
      await t.wait(0);
      expect(t.requests).toEqual([1, 2, 3]);
    });

    it('unloads it regardless when closing without saving', async () => {
      const t = setup();
      t.refuseUnload(1);
      t.close();
      await t.wait(0);
      t.guard.onDecision(1, 'discard');
      await t.wait(20);
      expect(t.closed()).toBe(1);
      expect(t.requests).toEqual([1]);
    });

    it('lets the page keep its changes when it refuses while not closing (a reload)', () => {
      const t = setup();
      expect(t.guard.onUnloadPrevented()).toBe(false);
      expect(t.requests).toEqual([]);
    });

    it('asks the user rather than going round for ever when the page keeps refusing', async () => {
      const t = setup();
      t.refuseUnload(100);
      t.close();
      for (let id = 1; id <= 4; id += 1) {
        // eslint-disable-next-line no-await-in-loop
        await t.wait(0);
        t.guard.onAcknowledged(id);
        t.guard.onDecision(id, 'close');
        // eslint-disable-next-line no-await-in-loop
        await t.wait(20);
      }
      expect(t.requests).toEqual([1, 2, 3, 4]);
      expect(t.notResponding.map((d) => d.reason)).toEqual(['busy']);
      t.notResponding[0]!.choose('close');
      await t.wait(20);
      expect(t.closed()).toBe(1);
    });
  });

  // PR #56 re-audit finding 5: a reloaded page never answers the request the old page received.
  describe('a renderer that reloads while getting ready', () => {
    it('calls the close off, and asks the new page on the next close', async () => {
      const t = setup();
      t.close();
      await t.wait(0);
      t.guard.onAcknowledged(1);
      t.guard.onRendererNavigated();
      await t.wait(0);
      expect(t.closed()).toBe(0);
      expect(t.close()).toBe(false);
      await t.wait(0);
      expect(t.requests).toEqual([1, 2]);
      t.guard.onDecision(2, 'close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('calls it off without offering to close when it reloads before acknowledging', async () => {
      const t = setup();
      t.close();
      await t.wait(0);
      t.guard.onRendererNavigated();
      await t.wait(10 * ackTimeoutMs);
      expect(t.notResponding).toEqual([]);
      expect(t.closed()).toBe(0);
    });
  });

  // Also re-audit finding 5: whatever keeps a responsive renderer from answering, closing again
  // offers a way out.
  describe('closing again while the renderer is busy getting ready', () => {
    async function acknowledgedThenClosedAgain() {
      const t = setup();
      t.close();
      await t.wait(0);
      t.guard.onAcknowledged(1);
      await t.wait(60_000);
      expect(t.close()).toBe(false);
      return t;
    }

    it('offers to close without saving if it still has not answered a while later', async () => {
      const t = await acknowledgedThenClosedAgain();
      await t.wait(ackTimeoutMs - 1);
      expect(t.notResponding).toEqual([]);
      await t.wait(1);
      expect(t.notResponding.map((d) => d.reason)).toEqual(['busy']);
      t.notResponding[0]!.choose('close');
      await t.wait(0);
      expect(t.closed()).toBe(1);
    });

    it('withdraws that offer when the renderer answers', async () => {
      const t = await acknowledgedThenClosedAgain();
      await t.wait(ackTimeoutMs);
      t.guard.onDecision(1, 'close');
      await t.wait(0);
      expect(t.notResponding[0]!.signal.aborted).toBe(true);
      expect(t.closed()).toBe(1);
    });

    it('does not offer again after the user chose to keep waiting, until they close again', async () => {
      const t = await acknowledgedThenClosedAgain();
      await t.wait(ackTimeoutMs);
      t.notResponding[0]!.choose('wait');
      await t.wait(10 * 60_000);
      expect(t.notResponding).toHaveLength(1);
      t.close();
      await t.wait(ackTimeoutMs);
      expect(t.notResponding).toHaveLength(2);
    });

    it('does not offer it when the renderer answers soon after', async () => {
      const t = setup();
      t.close();
      await t.wait(0);
      t.guard.onAcknowledged(1);
      t.close();
      await t.wait(100);
      t.guard.onDecision(1, 'close');
      await t.wait(0);
      expect(t.notResponding).toEqual([]);
      expect(t.closed()).toBe(1);
    });
  });

  it('never traps the user if getting ready fails unexpectedly', async () => {
    const onError = vi.fn();
    const t = setup({ canAskRenderer: () => { throw new Error('broken'); }, onError });
    t.close();
    await t.wait(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(t.closed()).toBe(1);
  });
});
