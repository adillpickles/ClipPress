import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CloseGuard from './closeGuard';
import type { CloseGuardOptions } from './closeGuard';

const ackTimeoutMs = 5000;

function setup(overrides: Partial<CloseGuardOptions> = {}) {
  const requests: number[] = [];
  const notResponding: { signal: AbortSignal, choose: (choice: 'close' | 'wait') => void }[] = [];
  let closed = 0;
  let guard: CloseGuard;
  const options: CloseGuardOptions = {
    shouldConfirm: () => false,
    confirm: async () => true,
    canAskRenderer: () => true,
    askRenderer: (id) => { requests.push(id); },
    showNotResponding: (signal) => new Promise((resolve) => {
      notResponding.push({ signal, choose: resolve });
      signal.addEventListener('abort', () => resolve('wait'));
    }),
    // Like BrowserWindow.close(): emits `close` again, which the guard now lets through.
    close: () => { if (guard.handleClose()) closed += 1; },
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
      expect(t.notResponding).toHaveLength(1);
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
      expect(t.notResponding).toHaveLength(1);
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

  it('never traps the user if getting ready fails unexpectedly', async () => {
    const onError = vi.fn();
    const t = setup({ canAskRenderer: () => { throw new Error('broken'); }, onError });
    t.close();
    await t.wait(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(t.closed()).toBe(1);
  });
});
