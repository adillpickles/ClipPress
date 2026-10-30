import { describe, expect, it, vi } from 'vitest';

import retrySettingsWrite from './settingsWriteRetry';

const fsError = (code: string) => Object.assign(new Error(code), { code });

describe('retrySettingsWrite', () => {
  it('tries again while the file is held for a moment', () => {
    const write = vi.fn()
      .mockImplementationOnce(() => { throw fsError('EPERM'); })
      .mockImplementationOnce(() => { throw fsError('EBUSY'); })
      .mockImplementationOnce(() => undefined);
    const sleep = vi.fn();
    retrySettingsWrite(write, { sleep });
    expect(write).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[40], [80]]);
  });

  it('gives up after the last try', () => {
    const write = vi.fn(() => { throw fsError('EPERM'); });
    expect(() => retrySettingsWrite(write, { attempts: 3, sleep: () => undefined })).toThrow('EPERM');
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', () => {
    const write = vi.fn(() => { throw fsError('ENOSPC'); });
    expect(() => retrySettingsWrite(write, { sleep: () => undefined })).toThrow('ENOSPC');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
