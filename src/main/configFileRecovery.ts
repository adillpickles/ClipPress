import { constants, copyFile, readFile, unlink } from 'node:fs/promises';

/** Read persisted keys before electron-store fills in defaults and writes them back. */
export async function readStoredConfigKeys(configPath: string): Promise<Set<string>> {
  try {
    return new Set(Object.keys(JSON.parse(await readFile(configPath, 'utf8')) as object));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new Set();
    throw error;
  }
}

/**
 * Deciding what to do with a config file we cannot read.
 *
 * electron-store is configured (by its own default) to discard a config file whose JSON
 * does not parse, and the next setting the user changes then writes over it. Every
 * preference they had chosen disappears with nothing said and nothing left to recover
 * from. A config file can end up truncated for ordinary reasons — a power cut or a hard
 * kill while it was being written — so this is not a hypothetical.
 *
 * The classification and backup naming are pure; preservation below uses exclusive
 * copying and refuses to reset settings if the backup cannot be written.
 */

export type ConfigFileState =
  /** Parses as a settings object. Use it. */
  | 'ok'
  /** Nothing in it, so there is nothing to lose. Start fresh, quietly. */
  | 'empty'
  /** Held something we cannot read. Keep a copy before anything overwrites it. */
  | 'unreadable';

export function getConfigFileState(content: string): ConfigFileState {
  if (content.trim().length === 0) return 'empty';

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return 'unreadable';
  }

  // A top-level array, string or number is not a settings object. electron-store would
  // not throw on those, it would merge them into an empty object and produce nonsense,
  // so treat them as unreadable too.
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unreadable';

  return 'ok';
}

/**
 * Sits next to the original and says what it is, so the user can find it without being
 * told where to look. Timestamped because a broken config that keeps being rewritten
 * would otherwise overwrite its own rescue copy.
 */
export function getCorruptConfigBackupPath({ configPath, now }: { configPath: string, now: Date }) {
  const stamp = now.toISOString().replaceAll(/[:.]/gu, '-');
  return `${configPath}.corrupt-${stamp}`;
}

/** A failed backup must stop initialization before the store can replace the only copy. */
export async function preserveUnreadableConfig(configPath: string) {
  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
  const state = getConfigFileState(content);
  if (state === 'ok') return undefined;
  if (state === 'empty') {
    await unlink(configPath);
    return undefined;
  }
  const backupPath = getCorruptConfigBackupPath({ configPath, now: new Date() });
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  // Valid JSON with an invalid top-level type is not cleared by electron-store itself.
  await unlink(configPath);
  return { configPath, backupPath };
}
