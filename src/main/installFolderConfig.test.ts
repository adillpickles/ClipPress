import { existsSync } from 'node:fs';
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
    access: faulty('access', actual.access),
  };
});

const { importInstallFolderConfig, moveSettingsOutOfInstallFolder, noteSettingsFoldersForInstaller, settingsFoldersNoteFileName } = await import('./installFolderConfig');

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

  // PR #56 re-audit 3 finding 3: the installer named its copy by the local time and the app by
  // UTC, so west of UTC an installer's copy made after an interrupted start sorted before it, and
  // the older settings were imported. Both now use UTC, as the installer's names below do.
  it.each([
    ['the installer copied the file after an interrupted start', `config.json.importing-${stamp}`, 'config.json.importing-2026-10-16T12-35-10-installer'],
    ['an interrupted start copied the file after the installer', 'config.json.importing-2026-10-16T12-34-56-installer', `config.json.importing-${laterStamp}`],
    ['the installer copied it again within the same second', 'config.json.importing-2026-10-16T12-35-10-installer', 'config.json.importing-2026-10-16T12-35-10-installer-2'],
    ['a start and the installer copied it within the same second', `config.json.importing-${stamp}`, 'config.json.importing-2026-10-16T12-34-56-installer'],
  ])('uses the newer copy when %s', async (_when, older, newer) => {
    await writeFile(join(configDir, older), '{"sizeLimitMb":36}');
    await writeFile(join(configDir, newer), '{"sizeLimitMb":37}');
    const keptName = newer.replace('.importing-', '.imported-');
    expect(await doImport(later)).toMatchObject({ keptCopyPath: join(configDir, keptName), adopted: true, resumed: true });
    expect(await settingsInUse()).toBe('{"sizeLimitMb":37}');
    // The older copy is kept, and not imported again.
    expect((await configFiles()).filter((name) => name.includes('.import')).sort()).toEqual([older.replace('.importing-', '.imported-'), keptName].sort());
    expect(await read(join(configDir, older.replace('.importing-', '.imported-')))).toBe('{"sizeLimitMb":36}');
    expect(await doImport()).toBeUndefined();
  });
});

// Re-audit 3: with --config-dir, the installer cannot know where settings are, so the app tells it.
describe('noteSettingsFoldersForInstaller', () => {
  const notePath = () => join(installDir, settingsFoldersNoteFileName);
  const note = (settingsDir: string | undefined, stillHasSettings: (dir: string) => Promise<boolean> = async () => true) => noteSettingsFoldersForInstaller({ installDir, settingsDir, stillHasSettings });

  it('writes nothing while no settings folder is inside the installation folder', async () => {
    expect(await note(undefined)).toEqual([]);
    expect(existsSync(notePath())).toBe(false);
  });

  it('lists a settings folder inside it, a line each in UTF-16LE without a BOM, as the installer reads it', async () => {
    const dir = join(installDir, 'settings');
    expect(await note(dir)).toEqual([dir]);
    const bytes = await readFile(notePath());
    expect([...bytes.subarray(0, 2)]).not.toEqual([0xFF, 0xFE]);
    expect(bytes.toString('utf16le')).toBe(`${dir}\r\n`);
  });

  it('keeps listing folders from earlier starts until they no longer have settings there', async () => {
    const first = join(installDir, 'settings');
    const second = join(installDir, 'other settings ü');
    await note(first);
    // A start with another folder, then one without any: both stay listed while they have settings.
    expect(await note(second)).toEqual([first, second]);
    expect(await note(undefined)).toEqual([first, second]);
    // The first was moved out.
    expect(await note(undefined, async (dir) => dir !== first)).toEqual([second]);
    expect((await readFile(notePath())).toString('utf16le')).toBe(`${second}\r\n`);
    expect(await note(undefined, async () => false)).toEqual([]);
    expect(existsSync(notePath())).toBe(false);
  });

  it('lists a folder once, however its case is written', async () => {
    const dir = join(installDir, 'settings');
    await note(dir);
    expect(await note(dir.toUpperCase())).toEqual([dir]);
  });

  it('keeps the note when writing a new one fails', async () => {
    const dir = join(installDir, 'settings');
    await note(dir);
    faults.failWith = (op) => (op === 'writeFile' ? 'ENOSPC' : undefined);
    await expect(note(join(installDir, 'more'))).rejects.toThrow('ENOSPC');
    faults.failWith = undefined;
    expect((await readFile(notePath())).toString('utf16le')).toBe(`${dir}\r\n`);
  });
});

// PR #56 re-audit 2 finding 1: when the import failed before it could copy the settings, updates
// went on being installed, and installing one deletes the installation folder with the only copy.
describe('moveSettingsOutOfInstallFolder', () => {
  const move = (at = now) => moveSettingsOutOfInstallFolder({ installDir, configDir, now: at, retryDelayMs: 1 });
  const later = new Date('2026-10-17T08:00:00.000Z');

  function failing(op: string, name: string, code = 'EBUSY') {
    faults.failWith = (o, path) => (o === op && basename(path).startsWith(name) ? code : undefined);
  }

  it('leaves nothing behind without a settings file there', async () => {
    expect(await move()).toEqual({ settingsLeft: false, imported: undefined });
  });

  it('leaves nothing behind once the settings are imported', async () => {
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');
    expect(await move()).toMatchObject({ settingsLeft: false, imported: { adopted: true } });
  });

  it('says settings are left when the copy that would survive an update could not be made', async () => {
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37,"updateMode":"ask"}');
    failing('copyFile', 'config.json.importing-', 'ENOSPC');
    const outcome = await move();
    expect(outcome).toMatchObject({ settingsLeft: true, error: expect.objectContaining({ code: 'ENOSPC' }) });
    // The only copy is still where an update would delete it.
    expect(await readdir(installDir)).toEqual(['config.json']);
    expect(existsSync(configDir) ? await readdir(configDir) : []).toEqual([]);

    // The next start, with room on the disk again.
    faults.failWith = undefined;
    expect(await move(later)).toMatchObject({ settingsLeft: false, imported: { adopted: true, resumed: false } });
    expect(await read(join(configDir, 'config.json'))).toBe('{"sizeLimitMb":37,"updateMode":"ask"}');
  });

  it('says settings are left when the settings file cannot be read', async () => {
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');
    failing('readFile', 'config.json', 'EACCES');
    expect(await move()).toMatchObject({ settingsLeft: true });
    expect(await readdir(installDir)).toEqual(['config.json']);
  });

  it('says settings are left until the copied settings are in use', async () => {
    // The copy survives an update, but the settings in use (such as for updates) are not the user's yet.
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');
    failing('writeFile', 'config.json.tmp-');
    expect(await move()).toMatchObject({ settingsLeft: true });
    faults.failWith = undefined;
    expect(await move(later)).toMatchObject({ settingsLeft: false, imported: { resumed: true } });
  });

  it('says settings are left when a newer file is still there after finishing an earlier import', async () => {
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":37}');
    failing('rename', 'config.json.imported', 'EPERM');
    expect(await move()).toMatchObject({ settingsLeft: true });
    await writeFile(join(installDir, 'config.json'), '{"sizeLimitMb":50}');
    faults.failWith = undefined;
    expect(await move(later)).toMatchObject({ settingsLeft: true, imported: { resumed: true } });
    expect(await move(new Date('2026-10-17T09:00:00.000Z'))).toMatchObject({ settingsLeft: false, imported: { resumed: false } });
    expect(await read(join(configDir, 'config.json'))).toBe('{"sizeLimitMb":50}');
  });

  it('says settings may be left when it cannot tell whether the file is still there', async () => {
    failing('access', 'config.json', 'EPERM');
    expect(await move()).toMatchObject({ settingsLeft: true });
  });
});
