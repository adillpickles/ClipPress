import type { Options } from 'p-retry';
import pRetry from 'p-retry';

const transientCodes = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'EPERM', 'EACCES']);

/** Retry temporary sharing/permission failures without retrying missing paths or full disks. */
export default function fsOperationWithRetry<T>(operation: () => Promise<T>, options: Options = {}): Promise<T> {
  return pRetry(operation, {
    retries: 10,
    minTimeout: 100,
    maxTimeout: 2000,
    // p-retry passes a context object, not the error itself.
    shouldRetry: ({ error }) => 'code' in error && typeof error.code === 'string' && transientCodes.has(error.code),
    ...options,
  });
}
