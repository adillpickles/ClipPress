import { describe, expect, it } from 'vitest';
import { getReleaseNotes } from './releaseNotes';

const notes = [
  { version: '0.1.0-beta.4', highlightsMd: '- Actual ClipPress change' },
  { version: '0.1.0-beta.5', highlightsMd: '- Next preview' },
  { version: '3.68.0', highlightsMd: '- Upstream changes' },
  { version: 'invalid', highlightsMd: 'broken entry' },
];

describe('release notes shown after upgrade', () => {
  it('includes only real ClipPress notes since the previous version', () => {
    expect(getReleaseNotes(notes, '0.1.0-beta.3', '0.1.0-beta.4')).toEqual([notes[0]]);
  });
  it('shows nothing on repeated launches of the same version', () => {
    expect(getReleaseNotes(notes, '0.1.0-beta.4', '0.1.0-beta.4')).toEqual([]);
  });
  it('skips empty notes and unknown release ranges instead of opening an empty dialog', () => {
    expect(getReleaseNotes([{ version: '0.1.0-beta.4', highlightsMd: '  ' }], '0.1.0-beta.3', '0.1.0-beta.4')).toEqual([]);
    expect(getReleaseNotes([], '0.1.0-beta.3', '0.1.0-beta.4')).toEqual([]);
  });
  it('handles invalid saved versions and inherited upstream versions', () => {
    expect(getReleaseNotes(notes, 'unknown', '0.1.0-beta.4')).toEqual([]);
    expect(getReleaseNotes(notes, '3.68.0', '0.1.0-beta.4')).toEqual([]);
  });
  it('orders notes newest first when multiple releases were skipped', () => {
    expect(getReleaseNotes(notes, '0.1.0-beta.3', '0.1.0-beta.5')).toEqual([notes[1], notes[0]]);
  });
});
