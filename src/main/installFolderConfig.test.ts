import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Makes file operations fail, like a virus scanner holding a file, a full disk or a crash would. */
const faults = vi.hoisted(() => ({
  /** Returns an error code to fail an operation on `path` (its target) with, or undefined to let it run. */
  failWith: undefined as ((op: string, path: string) => string | undefined) | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const faulty = <A extends unknown[], R>(op: string, fn: (...args: A) => Promise<R>, targetIndex = 0) => async (...args: A) => {
    const target = String(args[targetIndex]);
    const code = faults.failWith?.(op, target);
    if (code != null) throw Object.assign(new Error(`${code}: ${op} ${target}`), { code });
    return fn(...args);
  };
  return {
    ...actual,
    copyFile: faulty('copyFile', actual.copyFile, 1),
    rename: faulty('rename', actual.rename, 1),
    writeFile: faulty('writeFile', actual.writeFile),
    readFile: faulty('readFile', actual.readFile),
  };
});

const { importInstallFolderConfig } = await import('./installFolderConfig');

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
  faults.failWith = undefined;
  await rm(root, { recursive: true, force: true });
});

const read = async (path: string) => readFile(path, 'utf8');
const doImport = (at = now) => importInstallFolderConfig({ installDir, configDir, now: at, retryDelayMs: 1 });

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
      resumed: false,
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

// PR #56 re-audit finding 2: the original used to be renamed before the import had finished, so a
// failure after that left the settings unimported, and the next start found nothing to import.
describe('importInstallFolderConfig when an attempt fails or is interrupted', () => {
  const later = new Date('2026-10-17T08:00:00.000Z');
  const laterStamp = '2026-10-17T08-00-00-000Z';

  beforeEach(async () => {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{"sizeLimitMb":10}');
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');
  });

  /** Fails `op` on targets whose file name starts with `name` (in `dir`, if given), `times` times or always. */
  function failing(op: string, name: string, { code = 'EBUSY', times = Infinity, dir }: { code?: string, times?: number, dir?: string } = {}) {
    let left = times;
    faults.failWith = (o, path) => {
      if (o !== op || !basename(path).startsWith(name) || (dir != null && !path.startsWith(dir)) || left <= 0) return undefined;
      left -= 1;
      return code;
    };
  }

  const settingsInUse = () => read(join(configDir, 'config.json'));
  const configFiles = async () => (await readdir(configDir)).sort();

  it('finishes on the next start after the backup of the current settings failed', async () => {
    failing('copyFile', 'config.json.before-import');
    await expect(doImport()).rejects.toThrow('EBUSY');
    expect(await settingsInUse()).toBe('{"sizeLimitMb":10}');
    // The original is out of the way already; the copy in app data carries the import.
    expect(await readdir(installDir)).toEqual([`config.json.imported-${stamp}`]);
    expect(await configFiles()).toEqual(['config.json', `config.json.importing-${stamp}`]);

    faults.failWith = undefined;
    expect(await doImport(later)).toEqual({
      keptCopyPath: join(configDir, `config.json.imported-${stamp}`),
      adopted: true,
      replacedSettingsBackupPath: join(configDir, `config.json.before-import-${laterStamp}`),
      copiedFiles: [],
      resumed: true,
    });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect(await read(join(configDir, `config.json.before-import-${laterStamp}`))).toBe('{"sizeLimitMb":10}');
    expect(await configFiles()).toEqual(['config.json', `config.json.before-import-${laterStamp}`, `config.json.imported-${stamp}`]);
    expect(await doImport()).toBeUndefined();
  });

  it('rides out a file that is busy for a moment, within one start', async () => {
    failing('rename', 'config.json.imported', { code: 'EPERM', times: 2 });
    expect(await doImport()).toMatchObject({ adopted: true, resumed: false });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect(await readdir(installDir)).toEqual([`config.json.imported-${stamp}`]);
  });

  it('finishes on the next start when the original could not be renamed, without a second copy', async () => {
    failing('rename', 'config.json.imported', { code: 'EPERM', dir: installDir });
    await expect(doImport()).rejects.toThrow('EPERM');
    expect(await settingsInUse()).toBe('{"sizeLimitMb":10}');
    expect(await readdir(installDir)).toEqual(['config.json']);

    faults.failWith = undefined;
    expect(await doImport(later)).toMatchObject({ adopted: true, resumed: true });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect(await readdir(installDir)).toEqual([`config.json.imported-${stamp}`]);
    expect((await configFiles()).filter((name) => name.includes('.import'))).toEqual([`config.json.imported-${stamp}`]);
  });

  it('keeps settings changed between a failed attempt and the next', async () => {
    failing('writeFile', 'config.json.tmp-');
    await expect(doImport()).rejects.toThrow('EBUSY');
    expect(await settingsInUse()).toBe('{"sizeLimitMb":10}');
    // That run went on with the current settings, and changed them.
    await writeFile(join(configDir, 'config.json'), '{"sizeLimitMb":11}');

    faults.failWith = undefined;
    expect(await doImport(later)).toMatchObject({ adopted: true, resumed: true });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect(await read(join(configDir, `config.json.before-import-${stamp}`))).toBe('{"sizeLimitMb":10}');
    expect(await read(join(configDir, `config.json.before-import-${laterStamp}`))).toBe('{"sizeLimitMb":11}');
  });

  it('finishes without a second backup when only marking it finished failed', async () => {
    failing('rename', 'config.json.imported', { dir: configDir });
    await expect(doImport()).rejects.toThrow('EBUSY');
    // Everything but marking it finished was done.
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');

    faults.failWith = undefined;
    expect(await doImport(later)).toMatchObject({ adopted: true, resumed: true, replacedSettingsBackupPath: undefined });
    expect(await configFiles()).toEqual(['config.json', `config.json.before-import-${stamp}`, `config.json.imported-${stamp}`]);
    expect(await doImport()).toBeUndefined();
  });

  it('leaves a file put there after an interrupted attempt for a later start to import', async () => {
    failing('rename', 'config.json.imported', { code: 'EPERM', dir: installDir });
    await expect(doImport()).rejects.toThrow('EPERM');
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":50}');

    faults.failWith = undefined;
    expect(await doImport(later)).toMatchObject({ adopted: true, resumed: true });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect(await readdir(installDir)).toEqual(['config.json']);
    expect(await doImport(new Date('2026-10-17T09:00:00.000Z'))).toMatchObject({ adopted: true, resumed: false });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":50}');
  });

  it('uses the newest copy when two instances started an import at once', async () => {
    await writeFile(join(configDir, `config.json.importing-${stamp}`), '{"sizeLimitMb":36}');
    await writeFile(join(configDir, `config.json.importing-${laterStamp}`), '{"sizeLimitMb":37}');
    expect(await doImport(later)).toMatchObject({ keptCopyPath: join(configDir, `config.json.imported-${laterStamp}`), adopted: true, resumed: true });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    expect((await configFiles()).filter((name) => name.includes('.import'))).toEqual([`config.json.imported-${stamp}`, `config.json.imported-${laterStamp}`]);
    expect(await doImport()).toBeUndefined();
  });
});
