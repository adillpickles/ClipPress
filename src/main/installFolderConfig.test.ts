import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importInstallFolderConfig } from './installFolderConfig';

const now = new Date('2026-10-16T12:34:56.789Z');
const stamp = '2026-10-16T12-34-56-789Z';

let root: string;
let installDir: string;
let configDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'clippress-install-config-'));
  installDir = join(root, 'Programs', 'clippress');
  configDir = join(root, 'Roaming', 'ClipPress');
  await mkdir(installDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const read = async (path: string) => readFile(path, 'utf8');
const doImport = () => importInstallFolderConfig({ installDir, configDir, now });

describe('importInstallFolderConfig', () => {
  it('does nothing without a settings file next to the executable', async () => {
    expect(await doImport()).toBeUndefined();
    expect(await readdir(installDir)).toEqual([]);
  });

  it('moves the settings into the app-data folder, keeping a copy and the replaced settings', async () => {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{"sizeLimitMb":10}');
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');

    expect(await doImport()).toEqual({
      keptCopyPath: join(configDir, `config.json.imported-${stamp}`),
      adopted: true,
      replacedSettingsBackupPath: join(configDir, `config.json.before-import-${stamp}`),
      copiedFiles: [],
    });
    expect(await read(join(configDir, 'config.json'))).toBe('{"sizeLimitMb":37}');
    expect(await read(join(configDir, `config.json.before-import-${stamp}`))).toBe('{"sizeLimitMb":10}');
    expect(await read(join(configDir, `config.json.imported-${stamp}`))).toBe('{"sizeLimitMb":37}');
    // Renamed rather than deleted, and never imported again.
    expect(await readdir(installDir)).toEqual([`config.json.imported-${stamp}`]);
    expect(await doImport()).toBeUndefined();
  });

  it('creates the app-data folder for a first start', async () => {
    await writeFile(join(installDir, 'config.json'), '{}');
    expect(await doImport()).toMatchObject({ adopted: true, replacedSettingsBackupPath: undefined });
    expect(await read(join(configDir, 'config.json'))).toBe('{}');
  });

  it('keeps an unreadable file without letting it replace the settings', async () => {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{"sizeLimitMb":10}');
    await writeFile(join(installDir, 'config.json'), '{"sizeLimit');
    expect(await doImport()).toMatchObject({ adopted: false });
    expect(await read(join(configDir, 'config.json'))).toBe('{"sizeLimitMb":10}');
    expect(await read(join(configDir, `config.json.imported-${stamp}`))).toBe('{"sizeLimit');
  });

  it('copies the backups the app made next to it, without overwriting', async () => {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(installDir, 'config.json'), '{}');
    await writeFile(join(installDir, 'config.json.backup-v1-1-1'), 'old backup');
    await writeFile(join(installDir, 'config.json.corrupt-x'), 'broken');
    await writeFile(join(configDir, 'config.json.corrupt-x'), 'already here');
    await writeFile(join(installDir, 'unrelated.txt'), 'not settings');
    expect((await doImport())?.copiedFiles).toEqual(['config.json.backup-v1-1-1']);
    expect(await read(join(configDir, 'config.json.backup-v1-1-1'))).toBe('old backup');
    expect(await read(join(configDir, 'config.json.corrupt-x'))).toBe('already here');
    expect(await readdir(configDir)).not.toContain('unrelated.txt');
  });
});
