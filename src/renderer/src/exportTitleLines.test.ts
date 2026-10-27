import { describe, expect, test } from 'vitest';

import { getExportTitleLines, pickExportTitleLine } from './exportTitleLines';
import type { ExportPhase } from './exportTitleLines';

const t = (key: string) => key;
const phases: ExportPhase[] = ['starting', 'cutting', 'encoding', 'sharper', 'smaller', 'finishing'];

describe('getExportTitleLines', () => {
  test('a dozen different lines for every phase (half as many for each kind of second encode), none shared', () => {
    const all = phases.flatMap((phase) => getExportTitleLines(phase, t));
    for (const phase of phases) expect(new Set(getExportTitleLines(phase, t)).size).toBeGreaterThanOrEqual(phase === 'sharper' || phase === 'smaller' ? 6 : 12);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('pickExportTitleLine', () => {
  test('shows every line once before any comes back, and never the same one twice in a row', () => {
    const lines = getExportTitleLines('encoding', t);
    const shown = new Set<string>();
    let current: string | undefined;
    const picked: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const next = pickExportTitleLine(lines, shown, current);
      expect(next).not.toBe(current);
      picked.push(next);
      current = next;
    }
    expect(new Set(picked.slice(0, 12)).size).toBe(12);
    expect(new Set(picked.slice(12, 24)).size).toBe(12);
  });

  test('random picks from what is left', () => {
    const shown = new Set(['a']);
    expect(pickExportTitleLine(['a', 'b', 'c'], shown, 'a', () => 0.99)).toBe('c');
    expect(pickExportTitleLine(['a', 'b', 'c'], shown, 'c', () => 0)).toBe('b');
  });
});
