import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { getDurationMismatch, getProjectEditsEnd, getProjectMediaCandidates, getProjectMediaDuration, getProjectMediaOldPath, shortenFolderPath } from './missingRecording';
import type { LlcProject } from './types';

const win = path.win32;
const env = { join: win.join, dirname: win.dirname };

const project = (props: Partial<LlcProject>): LlcProject => ({ version: 3, mediaFileName: 'clip.mp4', cutSegments: [], ...props });
const text = { overlayId: 't', type: 'text' as const, text: 'GG', start: 50, end: 70, box: { x: 0, y: 0, width: 1, height: 1 } };

describe('a project\'s recording', () => {
  const inApp = String.raw`C:\Data\Projects\clip-0123456789abcdef.llc`;

  it('is looked for next to the project, then where the project says it is', () => {
    expect(getProjectMediaCandidates(project({ mediaFilePath: String.raw`D:\Clips\clip.mp4` }), inApp, env)).toEqual([String.raw`C:\Data\Projects\clip.mp4`, String.raw`D:\Clips\clip.mp4`]);
    expect(getProjectMediaCandidates(project({}), String.raw`D:\Clips\clip-proj.llc`, env)).toEqual([String.raw`D:\Clips\clip.mp4`]);
    expect(getProjectMediaCandidates(project({ mediaFileName: undefined }), inApp, env)).toEqual([]);
  });

  it('was where the project says, or else next to it', () => {
    expect(getProjectMediaOldPath(project({ mediaFilePath: String.raw`D:\Clips\clip.mp4` }), inApp, env)).toBe(String.raw`D:\Clips\clip.mp4`);
    expect(getProjectMediaOldPath(project({}), String.raw`D:\Old\clip-proj.llc`, env)).toBe(String.raw`D:\Old\clip.mp4`);
    expect(getProjectMediaOldPath(project({ mediaFileName: undefined }), inApp, env)).toBeUndefined();
  });
});

describe('the folder it was in', () => {
  it('is shown whole when short', () => {
    expect(shortenFolderPath(String.raw`C:\Users\Me\Videos\Valorant`)).toBe(String.raw`C:\Users\Me\Videos\Valorant`);
  });

  it('keeps its drive and last folders when long', () => {
    const long = String.raw`D:\projects\ClipPress\notes\beta6-ux\runs\qa-edits-impl-relocate\moved`;
    expect(shortenFolderPath(long)).toBe(String.raw`D:\…\beta6-ux\runs\qa-edits-impl-relocate\moved`);
    expect(shortenFolderPath(long).length).toBeLessThanOrEqual(52);
    expect(shortenFolderPath('/home/me/very/long/path/to/some/videos/of/games/valorant/clips', 30)).toBe('/…/of/games/valorant/clips');
    expect(shortenFolderPath(String.raw`\\nas\share\recordings\2026\october\valorant\ranked`, 40)).toBe(String.raw`\\nas\share\…\october\valorant\ranked`);
  });

  it('keeps at least the last folder, however long', () => {
    const longName = 'x'.repeat(80);
    expect(shortenFolderPath(win.join('D:\\', 'a', longName))).toBe(win.join('D:\\', '…', longName));
  });
});

describe('a recording found somewhere else', () => {
  it('has the length the project noted, or of its untouched whole recording', () => {
    expect(getProjectMediaDuration(project({ mediaDuration: 95.2, cutSegments: [{ start: 2, end: 10, name: '' }] }))).toBe(95.2);
    expect(getProjectMediaDuration(project({ cutSegments: [{ start: 0, end: 95.2, name: '', selected: true, initial: true }] }))).toBe(95.2);
    expect(getProjectMediaDuration(project({ cutSegments: [{ start: 0, end: 95.2, name: '' }] }))).toBeUndefined();
    expect(getProjectEditsEnd(project({ cutSegments: [{ start: 2, end: 10, name: '' }, { start: 20, name: '' }], overlayClips: [text] }))).toBe(70);
    expect(getProjectEditsEnd(project({}))).toBeUndefined();
  });

  it('is accepted when its length fits, within a second or 1%', () => {
    const known = project({ mediaDuration: 300 });
    expect(getDurationMismatch(known, 300)).toBeUndefined();
    expect(getDurationMismatch(known, 302.9)).toBeUndefined();
    expect(getDurationMismatch(project({ mediaDuration: 30 }), 30.9)).toBeUndefined();
  });

  it('is clearly another recording when its length differs, longer or shorter', () => {
    expect(getDurationMismatch(project({ mediaDuration: 300 }), 120)).toEqual({ kind: 'length', expected: 300 });
    expect(getDurationMismatch(project({ mediaDuration: 30 }), 45)).toEqual({ kind: 'length', expected: 30 });
  });

  it('is clearly another recording when the edits run past its end, if the project doesn\'t know the length', () => {
    const edits = project({ cutSegments: [{ start: 2, end: 10, name: '' }], overlayClips: [text] });
    expect(getDurationMismatch(edits, 40)).toEqual({ kind: 'editsEnd', expected: 70 });
    expect(getDurationMismatch(edits, 69.5)).toBeUndefined();
    // A longer one can't be told apart.
    expect(getDurationMismatch(edits, 600)).toBeUndefined();
  });

  it('is accepted when its length can\'t be read', () => {
    expect(getDurationMismatch(project({ mediaDuration: 300 }), undefined)).toBeUndefined();
    expect(getDurationMismatch(project({ mediaDuration: 300 }), Number.NaN)).toBeUndefined();
  });
});
