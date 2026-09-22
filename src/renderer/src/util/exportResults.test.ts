import { expect, it } from 'vitest';

import { getWrittenExportPaths } from './exportResults';

it('excludes skipped files from completed outputs', () => {
  expect(getWrittenExportPaths({ files: [{ path: 'new', created: true }, { path: 'old', created: false }] })).toEqual(['new']);
  expect(getWrittenExportPaths({ files: [{ path: 'old', created: false }] })).toEqual([]);
});

it('counts a merge only if it was created and keeps any retained new segments', () => {
  const files = [{ path: 'clip', created: true }];
  expect(getWrittenExportPaths({ files, merged: { path: 'old-merge', created: false } })).toEqual(['clip']);
  expect(getWrittenExportPaths({ files, merged: { path: 'new-merge', created: true } })).toEqual(['clip', 'new-merge']);
  expect(getWrittenExportPaths({ files, merged: { path: 'new-merge', created: true }, deletedSegments: true })).toEqual(['new-merge']);
});
