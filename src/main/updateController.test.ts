import { describe, expect, it, vi } from 'vitest';

import UpdateController, { isApplicableUpdate } from './updateController';
import type { UpdatePreferences, UpdateStatus } from '../common/updates';

function setup(preferences?: UpdatePreferences, supported = true) {
  const backend = {
    check: vi.fn(async () => ({ version: '0.1.0-beta.5', available: true })),
    download: vi.fn<() => Promise<void>>(async () => undefined),
    cancel: vi.fn(),
    installOnQuit: vi.fn(),
  };
  const onChange = vi.fn<(status: UpdateStatus) => void>();
  const onError = vi.fn();
  const controller = new UpdateController({ currentVersion: '0.1.0-beta.4', supported, preferences: preferences ?? { enabled: true, mode: 'automatic' }, loadBackend: async () => backend, onChange, onError });
  return { controller, backend, onError, onChange };
}

describe('update policy', () => {
  it('downloads in the background and arms normal-quit installation only for a verified result', async () => {
    const { controller, backend } = setup();
    await controller.check();
    expect(backend.download).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toMatchObject({ phase: 'ready', installOnQuit: true, version: '0.1.0-beta.5' });
    expect(backend.installOnQuit).toHaveBeenLastCalledWith(true);
  });

  it('asks before download, then installs the approved update on normal exit', async () => {
    const { controller, backend } = setup({ enabled: true, mode: 'ask' });
    await controller.check();
    expect(backend.download).not.toHaveBeenCalled();
    expect(controller.getStatus().phase).toBe('available');
    await controller.download();
    expect(controller.getStatus().installOnQuit).toBe(true);
  });

  it('preserves a disabled automatic check while allowing an explicit manual update', async () => {
    const { controller, backend } = setup({ enabled: false, mode: 'automatic' });
    await controller.check();
    expect(backend.check).not.toHaveBeenCalled();
    await controller.check(true);
    expect(backend.download).not.toHaveBeenCalled();
    await controller.download();
    expect(controller.getStatus().installOnQuit).toBe(true);
  });

  it('deduplicates checks and downloads', async () => {
    const { controller, backend } = setup();
    await Promise.all([controller.check(), controller.check()]);
    expect(backend.check).toHaveBeenCalledOnce();
    expect(backend.download).toHaveBeenCalledOnce();
  });

  it('keeps installation disabled after a checksum/download failure and allows retry', async () => {
    const { controller, backend, onError } = setup();
    backend.download.mockRejectedValueOnce(new Error('checksum mismatch'));
    await controller.check();
    expect(controller.getStatus()).toMatchObject({ phase: 'error', installOnQuit: false });
    expect(backend.installOnQuit).toHaveBeenLastCalledWith(false);
    expect(onError).toHaveBeenCalledOnce();
    await controller.download();
    expect(controller.getStatus().phase).toBe('ready');
  });

  it('cancels and ignores late completion when the user disables updates', async () => {
    const { controller, backend } = setup();
    let finish: () => void = () => undefined;
    backend.download.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const checking = controller.check();
    await vi.waitFor(() => expect(backend.download).toHaveBeenCalledOnce());
    controller.setPreferences({ enabled: false, mode: 'automatic' });
    finish();
    await checking;
    expect(backend.cancel).toHaveBeenCalledOnce();
    expect(backend.installOnQuit).toHaveBeenLastCalledWith(false);
    expect(controller.getStatus()).toMatchObject({ phase: 'available', installOnQuit: false });
  });

  it('pauses an already downloaded automatic update when switching to ask-first', async () => {
    const { controller, backend } = setup();
    await controller.check();
    controller.setPreferences({ enabled: true, mode: 'ask' });
    expect(controller.getStatus().installOnQuit).toBe(false);
    expect(backend.installOnQuit).toHaveBeenLastCalledWith(false);
    controller.approveInstall();
    expect(controller.getStatus().installOnQuit).toBe(true);
  });

  it('does not download portable releases or releases excluded from a staged rollout', async () => {
    const { controller, backend } = setup(undefined, false);
    await controller.check();
    expect(controller.getStatus().phase).toBe('available');
    expect(backend.download).not.toHaveBeenCalled();
    const other = setup();
    other.backend.check.mockResolvedValue({ version: '0.1.0-beta.5', available: false });
    await other.controller.check();
    expect(other.controller.getStatus().phase).toBe('up-to-date');
    expect(other.backend.download).not.toHaveBeenCalled();
  });

  it('does not install older, invalid, or prerelease versions into a stable build', () => {
    expect(isApplicableUpdate('0.1.0-beta.4', '0.1.0-beta.3')).toBe(false);
    expect(isApplicableUpdate('0.1.0', '0.2.0-beta.1')).toBe(false);
    expect(isApplicableUpdate('0.1.0', 'nightly')).toBe(false);
    expect(isApplicableUpdate('0.1.0-beta.4', '0.1.0')).toBe(true);
  });

  it('reports a failed check without downloading or forcing app exit', async () => {
    const { controller, backend } = setup();
    backend.check.mockRejectedValueOnce(new Error('offline'));
    await controller.check(true);
    expect(controller.getStatus()).toMatchObject({ phase: 'error', manual: true, installOnQuit: false });
    expect(backend.download).not.toHaveBeenCalled();
    await controller.check();
    expect(controller.getStatus().phase).toBe('ready');
  });
});
