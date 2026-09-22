import { expect, it, vi } from 'vitest';

import createAsyncCache from './asyncCache';

it('shares concurrent work but invalidates when the executable identity changes', async () => {
  const load = vi.fn().mockResolvedValue({ h264: true });
  const read = createAsyncCache(load);
  await Promise.all([read('bundled'), read('bundled'), read('bundled')]);
  expect(load).toHaveBeenCalledTimes(1);
  await read('custom');
  await read('bundled');
  expect(load).toHaveBeenCalledTimes(3);
});

it('does not permanently cache a transient failure', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('locked')).mockResolvedValue('ok');
  const read = createAsyncCache(load);
  await expect(read('binary')).rejects.toThrow('locked');
  await expect(read('binary')).resolves.toBe('ok');
});

it('rechecks hardware availability after the cache expires', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(100);
  try {
    const load = vi.fn().mockResolvedValue(false);
    const read = createAsyncCache(load, 50);
    await read('binary');
    await read('binary');
    now.mockReturnValue(151);
    await read('binary');
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    now.mockRestore();
  }
});
