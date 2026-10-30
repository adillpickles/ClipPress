import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';

import { buildLlcProjectData, encodeLlcProjectFile, getProjectSegmentsToLoad, getProjectSegmentsToSave, hasProjectEdits, isSameProjectEdits, withMediaDuration } from './llcProject';
import { llcProjectSaveableSegmentSchema, llcProjectV3Schema } from './types';
import type { OverlayClip, ParamsByStreamId, StateSegment } from './types';

const mediaFilePath = '/videos/clip.mp4';
const initialSegment: StateSegment = { start: 0, end: 8, name: '', segId: 'a', selected: true, segColorIndex: 0, initial: true };
const textClip: OverlayClip = { overlayId: 't1', type: 'text', text: 'Title', start: 0, end: 2, box: { x: 0.2, y: 0.1, width: 0.6, height: 0.18 } };
const gain = (audioGainDb: number | undefined): ParamsByStreamId => new Map([[mediaFilePath, new Map([[1, { audioGainDb }]])]]);

function project({ cutSegments = [initialSegment], overlayClips = [] as OverlayClip[], paramsByStreamId = new Map() as ParamsByStreamId, customTags }: {
  cutSegments?: StateSegment[],
  overlayClips?: OverlayClip[],
  paramsByStreamId?: ParamsByStreamId,
  customTags?: Record<string, string>,
} = {}) {
  return buildLlcProjectData({
    mediaFileName: 'clip.mp4',
    mediaFilePath,
    cutSegments: getProjectSegmentsToSave(cutSegments),
    customTagsByFile: customTags != null ? { [mediaFilePath]: customTags } : {},
    paramsByStreamId,
    overlayClips,
  });
}

/** Writes a project file as autosave does, and parses it back as the current reader does. */
const roundTrip = (data: unknown) => llcProjectV3Schema.parse(JSON5.parse(JSON5.stringify(data, null, 2)));

/**
 * The version 3 reader of released ClipPress versions (0.1.0-beta.4) and of the commit before this
 * change: the same schema without the `initial` flag, and a load that rejects a project without
 * segments ("No valid segments found") before it applies the text and gain.
 */
const olderV3Schema = llcProjectV3Schema.extend({ cutSegments: llcProjectSaveableSegmentSchema.omit({ initial: true }).array() });
function readWithOlderReader(fileContents: string) {
  const parsed = olderV3Schema.parse(JSON5.parse(fileContents));
  if (parsed.cutSegments.length === 0) return { error: 'No valid segments found' };
  return { segments: parsed.cutSegments, overlayClips: parsed.overlayClips, streamEdits: parsed.streamEdits };
}

describe('project contents', () => {
  it('holds no segments for the untouched full-file segment, which opening the media recreates', () => {
    expect(project().cutSegments).toEqual([]);
    expect(project({ cutSegments: [] }).cutSegments).toEqual([]);
    expect(hasProjectEdits(project())).toBe(false);
  });

  it('holds the full-file segment once it is deselected, as before', () => {
    const deselected = project({ cutSegments: [{ ...initialSegment, selected: false }] });
    expect(deselected.cutSegments).toEqual([{ start: 0, end: 8, name: '', tags: undefined, selected: false }]);
    expect(hasProjectEdits(deselected)).toBe(true);
  });

  it('counts text, gain and custom tags as edits without any segment change', () => {
    expect(hasProjectEdits(project({ overlayClips: [textClip] }))).toBe(true);
    expect(hasProjectEdits(project({ paramsByStreamId: gain(-6) }))).toBe(true);
    expect(hasProjectEdits(project({ customTags: { title: 'x' } }))).toBe(true);
    expect(project({ paramsByStreamId: gain(-6) }).streamEdits).toEqual({ streamParams: [{ streamId: 1, params: { audioGainDb: -6 } }] });
  });

  it('leaves out stream params and tags that were set back to their defaults', () => {
    const reset = project({ paramsByStreamId: gain(undefined), customTags: {} });
    expect(reset.streamEdits).toBeUndefined();
    expect(hasProjectEdits(reset)).toBe(false);
  });
});

describe('project file', () => {
  const wholeFileWithText = project({ overlayClips: [textClip], paramsByStreamId: gain(-6) });

  it('stores the whole file as one full-length segment flagged as the untouched one', () => {
    expect(encodeLlcProjectFile(wholeFileWithText, 8).cutSegments).toEqual([{ start: 0, end: 8, name: '', selected: true, initial: true }]);
    // Before the duration is known, from the start of the file.
    expect(encodeLlcProjectFile(wholeFileWithText, undefined).cutSegments).toEqual([{ start: 0, name: '', selected: true, initial: true }]);
    expect(encodeLlcProjectFile(wholeFileWithText, Number.NaN).cutSegments).toEqual([{ start: 0, name: '', selected: true, initial: true }]);
  });

  it('stores other segments unchanged', () => {
    const trimmed = project({ cutSegments: [{ start: 2, end: 8, name: '', segId: 'b', selected: true, segColorIndex: 0 }] });
    expect(encodeLlcProjectFile(trimmed, 8)).toBe(trimmed);
  });

  it('reads the stored whole file back as the whole file, with its text and gain', () => {
    const read = roundTrip(encodeLlcProjectFile(wholeFileWithText, 8));
    expect(getProjectSegmentsToLoad(read)).toEqual([]);
    expect(read.overlayClips).toEqual([textClip]);
    expect(read.streamEdits).toEqual(wholeFileWithText.streamEdits);
    // Read back into a session, the contents equal what was saved, so reopening saves nothing.
    expect({ ...read, cutSegments: getProjectSegmentsToLoad(read) }).toEqual(wholeFileWithText);
  });

  it('can be read by older version 3 readers, with nothing lost', () => {
    const fileContents = JSON5.stringify(encodeLlcProjectFile(wholeFileWithText, 8), null, 2);
    // They load the whole file as an ordinary full-length segment, and keep the text and gain.
    expect(readWithOlderReader(fileContents)).toEqual({
      segments: [{ start: 0, end: 8, name: '', selected: true }],
      overlayClips: [textClip],
      streamEdits: { streamParams: [{ streamId: 1, params: { audioGainDb: -6 } }] },
    });
    // What the previous representation did to them:
    expect(readWithOlderReader(JSON5.stringify(wholeFileWithText))).toEqual({ error: 'No valid segments found' });
  });

  it('loads a segment that an older reader saved back as an ordinary segment', () => {
    const resaved = roundTrip({ version: 3, mediaFileName: 'clip.mp4', cutSegments: [{ start: 0, end: 8, name: '', selected: true }] });
    expect(getProjectSegmentsToLoad(resaved)).toEqual([{ start: 0, end: 8, name: '', selected: true }]);
  });

  it('loads every other kind of project segment by segment', () => {
    const read = (cutSegments: unknown[]) => getProjectSegmentsToLoad(roundTrip({ version: 3, cutSegments }));
    // No segments (written by unreleased builds of this change) is the whole file too.
    expect(read([])).toEqual([]);
    // A flagged segment that was deselected, or is one of several, is not the untouched one.
    expect(read([{ start: 0, end: 8, name: '', selected: false, initial: true }])).toHaveLength(1);
    expect(read([{ start: 0, end: 8, name: '', initial: false }])).toHaveLength(1);
    expect(read([{ start: 0, end: 8, name: '', initial: true }, { start: 2, end: 4, name: '' }])).toHaveLength(2);
    expect(read([{ start: 2, end: 4, name: 'kept' }])).toEqual([{ start: 2, end: 4, name: 'kept' }]);
  });
});

describe('the recording\'s length in the project file', () => {
  const trimmed = project({ cutSegments: [{ start: 2, end: 8, name: '', segId: 'b', selected: true, segColorIndex: 0 }] });

  it('is noted once known, and read back', () => {
    expect(withMediaDuration(trimmed, 9.5)).toEqual({ ...trimmed, mediaDuration: 9.5 });
    expect(withMediaDuration(trimmed, undefined)).toBe(trimmed);
    expect(withMediaDuration(trimmed, Number.NaN)).toBe(trimmed);
    expect(roundTrip(withMediaDuration(trimmed, 9.5)).mediaDuration).toBe(9.5);
  });

  it('is ignored by older readers', () => {
    const olderSchema = llcProjectV3Schema.omit({ mediaDuration: true });
    expect(olderSchema.parse(JSON5.parse(JSON5.stringify(withMediaDuration(trimmed, 9.5))))).toEqual(trimmed);
  });
});

describe('two copies of a project', () => {
  const saved = encodeLlcProjectFile(project({ cutSegments: [{ start: 2, end: 8, name: 'Ace', segId: 'b', selected: true, segColorIndex: 0 }], overlayClips: [textClip] }), 8);

  it('hold the same edits however each was written', () => {
    // As an older version or a person wrote it: no path, no length, no "selected", keys in another order.
    const older = roundTrip({ version: 3, overlayClips: [textClip], mediaFileName: 'clip.mp4', cutSegments: [{ name: 'Ace', end: 8, start: 2 }] });
    expect(isSameProjectEdits(roundTrip(withMediaDuration(saved, 8)), older)).toBe(true);
    // The untouched whole recording, with or without its length
    const whole = project({ overlayClips: [textClip] });
    expect(isSameProjectEdits(roundTrip(encodeLlcProjectFile(whole, 8)), roundTrip(encodeLlcProjectFile(whole, undefined)))).toBe(true);
  });

  it('differ when what loads differs', () => {
    const other = roundTrip({ ...saved, cutSegments: [{ start: 2, end: 9, name: 'Ace', selected: true }] });
    expect(isSameProjectEdits(roundTrip(saved), other)).toBe(false);
    expect(isSameProjectEdits(roundTrip(saved), roundTrip({ ...saved, overlayClips: [] }))).toBe(false);
    expect(isSameProjectEdits(roundTrip(saved), roundTrip({ ...saved, cutSegments: [{ start: 2, end: 8, name: 'Ace', selected: false }] }))).toBe(false);
  });
});
