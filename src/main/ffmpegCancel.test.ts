// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';

import { abortFfmpeg, getCancellableCount, withCancelId } from './ffmpegCancel';

describe('withCancelId', () => {
  test('abortFfmpeg stops the call with that id, and no other', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const run = (signal: AbortSignal | undefined) => {
      signals.push(signal);
      return new Promise<string>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('stopped')));
        setTimeout(() => resolve('done'), 20);
      });
    };
    const a = withCancelId('a', run);
    const b = withCancelId('b', run);
    // Straight after the call, before it has awaited anything.
    abortFfmpeg('a');
    await expect(a).rejects.toThrow('stopped');
    await expect(b).resolves.toBe('done');
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  test('forgets the id once the call has settled', async () => {
    await withCancelId('c', async () => 'done');
    await expect(withCancelId('d', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(getCancellableCount()).toBe(0);
    // Too late: nothing to stop, and no error.
    abortFfmpeg('c');
  });

  test('an id used again belongs to the newer call', async () => {
    let finishFirst: () => void = () => undefined;
    const first = withCancelId('e', () => new Promise<void>((resolve) => { finishFirst = resolve; }));
    let second: AbortSignal | undefined;
    const done = withCancelId('e', async (signal) => {
      second = signal;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    finishFirst();
    await first;
    abortFfmpeg('e');
    await done;
    expect(second?.aborted).toBe(true);
    expect(getCancellableCount()).toBe(0);
  });

  test('no id: no signal', async () => {
    await expect(withCancelId(undefined, async (signal) => signal)).resolves.toBeUndefined();
  });
});
