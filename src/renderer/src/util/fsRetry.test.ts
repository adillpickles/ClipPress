import { expect, it, vi } from 'vitest';

import fsOperationWithRetry from './fsRetry';

it.each(['EBUSY', 'EMFILE', 'ENFILE', 'EPERM', 'EACCES'])('retries %s through the installed retry library', async (code) => {
  const operation = vi.fn().mockRejectedValueOnce(Object.assign(new Error('locked'), { code })).mockResolvedValue('saved');
  await expect(fsOperationWithRetry(operation, { minTimeout: 0 })).resolves.toBe('saved');
  expect(operation).toHaveBeenCalledTimes(2);
});

it.each(['ENOENT', 'ENOSPC', 'EINVAL'])('does not retry %s', async (code) => {
  const error = Object.assign(new Error('failed'), { code });
  const operation = vi.fn().mockRejectedValue(error);
  await expect(fsOperationWithRetry(operation, { minTimeout: 0 })).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(1);
});

it('bounds retries and preserves the original failure', async () => {
  const error = Object.assign(new Error('locked'), { code: 'EBUSY' });
  const operation = vi.fn().mockRejectedValue(error);
  await expect(fsOperationWithRetry(operation, { retries: 2, minTimeout: 0 })).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(3);
});

it('honors cancellation before touching a file', async () => {
  const controller = new AbortController();
  controller.abort();
  const operation = vi.fn();
  await expect(fsOperationWithRetry(operation, { signal: controller.signal })).rejects.toThrow();
  expect(operation).not.toHaveBeenCalled();
});
