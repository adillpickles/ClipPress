import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import cleanUpdaterCache, { getInstallerVersion, pickUpdaterLeftovers } from './updaterCache.js';

describe('updater cache clean-up', () => {
  it('reads the version from an installer name', () => {
    expect(getInstallerVersion('ClipPress-Setup-0.1.0-beta.6.exe')).toBe('0.1.0-beta.6');
    expect(getInstallerVersion('ClipPress-Setup-1.2.3.exe')).toBe('1.2.3');
    expect(getInstallerVersion('update-info.json')).toBeUndefined();
  });

  it('deletes the copies kept for differential downloads', () => {
    expect(pickUpdaterLeftovers({ files: ['installer.exe', 'current.blockmap', 'pending'], pendingFiles: undefined, runningVersion: '0.1.0-beta.6' }))
      .toEqual({ files: ['installer.exe', 'current.blockmap'], pending: false });
  });

  it('deletes the update that was installed, and older ones', () => {
    const pendingFiles = ['ClipPress-Setup-0.1.0-beta.6.exe', 'current.blockmap', 'update-info.json'];
    expect(pickUpdaterLeftovers({ files: ['pending'], pendingFiles, runningVersion: '0.1.0-beta.6' }).pending).toBe(true);
    expect(pickUpdaterLeftovers({ files: ['pending'], pendingFiles, runningVersion: '0.1.0-beta.7' }).pending).toBe(true);
  });

  it('keeps an update for a newer version, waiting to install', () => {
    const pendingFiles = ['ClipPress-Setup-0.1.0-beta.7.exe', 'update-info.json'];
    expect(pickUpdaterLeftovers({ files: ['pending'], pendingFiles, runningVersion: '0.1.0-beta.6' }).pending).toBe(false);
  });

  it('keeps a pending folder it can\'t read a version from', () => {
    expect(pickUpdaterLeftovers({ files: ['pending'], pendingFiles: ['something.tmp'], runningVersion: '0.1.0-beta.6' }).pending).toBe(false);
  });
});

describe('cleaning a folder laid out like the updater cache', () => {
  const make = (pendingInstaller: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'clippress-updater-test-'));
    writeFileSync(join(dir, 'installer.exe'), 'x');
    writeFileSync(join(dir, 'current.blockmap'), 'x');
    mkdirSync(join(dir, 'pending'));
    writeFileSync(join(dir, 'pending', pendingInstaller), 'x');
    writeFileSync(join(dir, 'pending', 'update-info.json'), '{}');
    return dir;
  };

  it('leaves it empty once the update is the running version', async () => {
    const dir = make('ClipPress-Setup-0.1.0-beta.6.exe');
    await cleanUpdaterCache({ cacheDir: dir, runningVersion: '0.1.0-beta.6' });
    expect(readdirSync(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps an update still to install', async () => {
    const dir = make('ClipPress-Setup-0.1.0-beta.7.exe');
    await cleanUpdaterCache({ cacheDir: dir, runningVersion: '0.1.0-beta.6' });
    expect(readdirSync(dir)).toEqual(['pending']);
    expect(readdirSync(join(dir, 'pending')).sort()).toEqual(['ClipPress-Setup-0.1.0-beta.7.exe', 'update-info.json']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when there is no folder', async () => {
    expect(await cleanUpdaterCache({ cacheDir: join(tmpdir(), 'clippress-no-such-updater'), runningVersion: '0.1.0-beta.6' })).toEqual([]);
  });
});
