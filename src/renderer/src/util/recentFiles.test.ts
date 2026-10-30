import { describe, expect, test } from 'vitest';

import { addRecentFile, maxRecentFiles, removeRecentFile } from './recentFiles';

describe('recent files', () => {
  test('a newly opened file goes first', () => {
    const list = addRecentFile([{ path: String.raw`C:\a.mp4`, openedAt: 1 }], String.raw`C:\b.mp4`, 2, true);
    expect(list.map((f) => f.path)).toEqual([String.raw`C:\b.mp4`, String.raw`C:\a.mp4`]);
  });

  test('reopening moves the file to the top instead of duplicating it', () => {
    const list = addRecentFile([{ path: String.raw`C:\a.mp4`, openedAt: 1 }, { path: String.raw`C:\b.mp4`, openedAt: 2 }], 'c:/A.mp4', 3, true);
    expect(list).toEqual([{ path: 'c:/A.mp4', openedAt: 3 }, { path: String.raw`C:\b.mp4`, openedAt: 2 }]);
  });

  test('paths differing only in case are different files when the file system is case-sensitive', () => {
    const list = addRecentFile([{ path: '/v/a.mp4', openedAt: 1 }], '/v/A.mp4', 2, false);
    expect(list).toHaveLength(2);
  });

  test('the list is capped', () => {
    let list = addRecentFile([], '/v/0.mp4', 0, false);
    for (let i = 1; i < maxRecentFiles + 5; i += 1) list = addRecentFile(list, `/v/${i}.mp4`, i, false);
    expect(list).toHaveLength(maxRecentFiles);
    expect(list[0]!.path).toBe(`/v/${maxRecentFiles + 4}.mp4`);
  });

  test('removing a file', () => {
    expect(removeRecentFile([{ path: String.raw`C:\a.mp4`, openedAt: 1 }, { path: String.raw`C:\b.mp4`, openedAt: 2 }], String.raw`c:\A.MP4`, true)).toEqual([{ path: String.raw`C:\b.mp4`, openedAt: 2 }]);
  });
});
