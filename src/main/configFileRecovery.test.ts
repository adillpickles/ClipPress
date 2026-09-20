import { describe, expect, it } from 'vitest';

import { getConfigFileState, getCorruptConfigBackupPath } from './configFileRecovery.ts';

describe('getConfigFileState', () => {
  it('accepts a settings object', () => {
    expect(getConfigFileState('{"simpleMode":true,"sizeLimitMb":10}')).toBe('ok');
    expect(getConfigFileState('{}')).toBe('ok');
    expect(getConfigFileState('\n  { "a": 1 }\n')).toBe('ok');
  });

  it('treats an empty file as a fresh start rather than a loss', () => {
    expect(getConfigFileState('')).toBe('empty');
    expect(getConfigFileState('   \n\t ')).toBe('empty');
  });

  it('flags a file that was cut off mid-write', () => {
    // What a config file looks like after a power cut or a hard kill.
    expect(getConfigFileState('{"simpleMode":true,"sizeLimit')).toBe('unreadable');
  });

  it('flags content that is not JSON at all', () => {
    expect(getConfigFileState('not json')).toBe('unreadable');
    expect(getConfigFileState('\0\0\0\0')).toBe('unreadable');
  });

  it('flags a byte order mark, because electron-store cannot read past one either', () => {
    // Editing config.json in an editor that adds a BOM really does lose the settings;
    // calling it readable here would hide that instead of preserving the file.
    expect(getConfigFileState('﻿{"simpleMode":true}')).toBe('unreadable');
  });

  it('flags valid JSON that is not a settings object', () => {
    // electron-store would not throw on these, it would merge them into an empty object
    // and carry on with nonsense.
    expect(getConfigFileState('[1,2,3]')).toBe('unreadable');
    expect(getConfigFileState('"a string"')).toBe('unreadable');
    expect(getConfigFileState('42')).toBe('unreadable');
    expect(getConfigFileState('null')).toBe('unreadable');
  });
});

describe('getCorruptConfigBackupPath', () => {
  const now = new Date('2026-09-20T22:17:31.535Z');

  it('keeps the copy beside the original and says what it is', () => {
    expect(getCorruptConfigBackupPath({ configPath: '/home/u/.config/ClipPress/config.json', now }))
      .toBe('/home/u/.config/ClipPress/config.json.corrupt-2026-09-20T22-17-31-535Z');
  });

  it('produces a name with no characters Windows rejects', () => {
    const backupPath = getCorruptConfigBackupPath({ configPath: String.raw`C:\Users\u\AppData\Roaming\ClipPress\config.json`, now });
    const fileName = backupPath.split('\\').pop()!;
    expect(fileName).not.toMatch(/[<>:"|?*]/u);
  });

  it('does not overwrite an earlier rescue copy', () => {
    const first = getCorruptConfigBackupPath({ configPath: '/c/config.json', now });
    const second = getCorruptConfigBackupPath({ configPath: '/c/config.json', now: new Date(now.getTime() + 1000) });
    expect(second).not.toBe(first);
  });
});
