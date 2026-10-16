import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import saveBeforeClose from './saveBeforeClose';
import type { CloseDecision, SaveBeforeCloseOptions } from './saveBeforeClose';
import type { ProjectSaveFailure } from './projectAutoSave';

const failure: ProjectSaveFailure = { path: '/videos/clip-proj.llc', error: new Error('disk full') };

function setup({ flushResults, flushMs = 10, savingChoice, failedChoices = [] }: {
  /** What each flush resolves with, in turn. */
  flushResults: ProjectSaveFailure[][],
  flushMs?: number,
  /** What the user chooses in the "still saving" notice (undefined: they do not choose). */
  savingChoice?: { afterMs: number, decision: CloseDecision },
  /** What the user chooses after each failure, in turn. */
  failedChoices?: (CloseDecision | 'retry')[],
}) {
  let flushes = 0;
  const savingNotices: { aborted: boolean }[] = [];
  const failedDialogs: ProjectSaveFailure[][] = [];
  const options: SaveBeforeCloseOptions = {
    flush: async () => {
      const result = flushResults[Math.min(flushes, flushResults.length - 1)]!;
      flushes += 1;
      await new Promise((resolve) => { setTimeout(resolve, flushMs); });
      return result;
    },
    slowAfterMs: 2000,
    showSaving: async (signal) => {
      const notice = { aborted: false };
      savingNotices.push(notice);
      signal.addEventListener('abort', () => { notice.aborted = true; });
      return new Promise<CloseDecision>((resolve) => {
        if (savingChoice != null) setTimeout(() => resolve(savingChoice.decision), savingChoice.afterMs);
        else signal.addEventListener('abort', () => resolve('cancel'));
      });
    },
    showFailed: async (failures) => {
      failedDialogs.push(failures);
      return failedChoices.shift() ?? 'cancel';
    },
  };
  return { options, savingNotices, failedDialogs, flushes: () => flushes };
}

async function run(options: SaveBeforeCloseOptions, ms = 60_000) {
  const deciding = saveBeforeClose(options);
  await vi.advanceTimersByTimeAsync(ms);
  return deciding;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('saveBeforeClose', () => {
  it('closes without asking once everything is saved', async () => {
    const t = setup({ flushResults: [[]] });
    expect(await run(t.options)).toBe('close');
    expect(t.savingNotices).toEqual([]);
    expect(t.failedDialogs).toEqual([]);
  });

  it('asks after a failed save, and does not close when the user cancels', async () => {
    const t = setup({ flushResults: [[failure]], failedChoices: ['cancel'] });
    expect(await run(t.options)).toBe('cancel');
    expect(t.failedDialogs).toEqual([[failure]]);
  });

  it('closes after a failed save only when the user chooses to close without saving', async () => {
    const t = setup({ flushResults: [[failure]], failedChoices: ['close'] });
    expect(await run(t.options)).toBe('close');
  });

  it('tries again for as long as the user asks, and closes once saving succeeds', async () => {
    const t = setup({ flushResults: [[failure], [failure], []], failedChoices: ['retry', 'retry'] });
    expect(await run(t.options)).toBe('close');
    expect(t.flushes()).toBe(3);
    expect(t.failedDialogs).toHaveLength(2);
  });

  it('tells the user when saving takes long, and closes the notice itself once saved', async () => {
    const t = setup({ flushResults: [[]], flushMs: 5000 });
    expect(await run(t.options)).toBe('close');
    expect(t.savingNotices).toEqual([{ aborted: true }]);
  });

  it('lets the user stop waiting for a save that hangs: close without saving', async () => {
    const t = setup({ flushResults: [[]], flushMs: 10 * 60_000, savingChoice: { afterMs: 1000, decision: 'close' } });
    expect(await run(t.options, 5000)).toBe('close');
  });

  it('lets the user stop waiting for a save that hangs: cancel and keep working', async () => {
    const t = setup({ flushResults: [[]], flushMs: 10 * 60_000, savingChoice: { afterMs: 1000, decision: 'cancel' } });
    expect(await run(t.options, 5000)).toBe('cancel');
  });

  it('treats an unexpected error while saving as a failed save', async () => {
    const t = setup({ flushResults: [[]], failedChoices: ['cancel'] });
    t.options.flush = async () => { throw new Error('broken'); };
    expect(await run(t.options)).toBe('cancel');
    expect(t.failedDialogs).toEqual([[{ path: '', error: new Error('broken') }]]);
  });
});
