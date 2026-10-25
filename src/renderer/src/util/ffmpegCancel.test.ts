// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, test, vi } from 'vitest';

import runCancellable from './ffmpegCancel';

describe('runCancellable', () => {
  test('aborting the signal stops the call by its id', async () => {
    const controller = new AbortController();
    const abort = vi.fn();
    let id: string | undefined;
    const done = runCancellable(controller.signal, abort, async (cancelId) => {
      id = cancelId;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'done';
    });
    controller.abort();
    await expect(done).resolves.toBe('done');
    expect(id).toBeDefined();
    expect(abort).toHaveBeenCalledExactlyOnceWith(id);
  });

  test('every call gets its own id', async () => {
    const ids: (string | undefined)[] = [];
    const { signal } = new AbortController();
    await runCancellable(signal, vi.fn(), async (cancelId) => { ids.push(cancelId); });
    await runCancellable(signal, vi.fn(), async (cancelId) => { ids.push(cancelId); });
    expect(new Set(ids).size).toBe(2);
  });

  test('an abort after the call has settled stops nothing', async () => {
    const controller = new AbortController();
    const abort = vi.fn();
    await runCancellable(controller.signal, abort, async () => 'done');
    await expect(runCancellable(controller.signal, abort, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    controller.abort();
    expect(abort).not.toHaveBeenCalled();
  });

  test('an aborted signal starts nothing and rejects as aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => 'done');
    const error = await runCancellable(controller.signal, vi.fn(), run).catch((err: unknown) => err);
    // What isAbortedError (util.ts) takes for a stop rather than a failure.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('AbortError');
    expect(run).not.toHaveBeenCalled();
  });

  test('no signal: no id', async () => {
    await expect(runCancellable(undefined, vi.fn(), async (cancelId) => cancelId)).resolves.toBeUndefined();
  });
});
