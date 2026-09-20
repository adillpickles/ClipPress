/**
 * Deciding what to do with a config file we cannot read.
 *
 * electron-store is configured (by its own default) to discard a config file whose JSON
 * does not parse, and the next setting the user changes then writes over it. Every
 * preference they had chosen disappears with nothing said and nothing left to recover
 * from. A config file can end up truncated for ordinary reasons — a power cut or a hard
 * kill while it was being written — so this is not a hypothetical.
 *
 * Pure so the decision and the naming can be tested without a filesystem; the copying
 * itself lives in `configStore`.
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
