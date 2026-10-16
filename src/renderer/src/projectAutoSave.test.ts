import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLlcProjectData, encodeLlcProjectFile, getProjectSegmentsToSave } from './llcProject';
import ProjectAutoSave from './projectAutoSave';
import type { ProjectSession } from './projectAutoSave';
import type { LlcProject, OverlayClip, StateSegment } from './types';

const delayMs = 500;
const path = '/videos/clip-proj.llc';
const initialSegment: StateSegment = { start: 0, end: 8, name: '', segId: 'a', selected: true, segColorIndex: 0, initial: true };
const trimmed: StateSegment = { start: 2, end: 8, name: '', segId: 'b', selected: true, segColorIndex: 0 };
const textClip: OverlayClip = { overlayId: 't1', type: 'text', text: 'Title', start: 0, end: 2, box: { x: 0.2, y: 0.1, width: 0.6, height: 0.18 } };

const contents = ({ cutSegments = [initialSegment], overlayClips = [] }: { cutSegments?: StateSegment[], overlayClips?: OverlayClip[] } = {}) => buildLlcProjectData({
  mediaFileName: 'clip.mp4',
  mediaFilePath: '/videos/clip.mp4',
  cutSegments: getProjectSegmentsToSave(cutSegments),
  overlayClips,
});
const untouched = contents();
const withTrim = contents({ cutSegments: [trimmed] });
const withText = contents({ overlayClips: [textClip] });

/** A disk whose writes take `latencyMs`, and an autosave writing to it. */
function setup({ latencyMs = 10 } = {}) {
  const disk = new Map<string, LlcProject>();
  const writes: { path: string, data: LlcProject }[] = [];
  const errors: unknown[] = [];
  let failNext = false;
  let failAll = false;
  const autoSave = new ProjectAutoSave({
    delayMs,
    write: async (writePath, data) => {
      writes.push({ path: writePath, data });
      await new Promise((resolve) => { setTimeout(resolve, latencyMs); });
      if (failNext || failAll) {
        failNext = false;
        throw new Error('disk full');
      }
      disk.set(writePath, data);
    },
    onError: (err) => errors.push(err),
  });
  let enabled = true;
  const show = (session: ProjectSession, project: LlcProject, { at = path, fileDuration = 8 }: { at?: string, fileDuration?: number } = {}) => {
    autoSave.update({ session, path: at, project, fileData: encodeLlcProjectFile(project, fileDuration) }, { enabled });
  };
  return {
    autoSave,
    disk,
    writes,
    errors,
    show,
    setEnabled: (value: boolean) => { enabled = value; },
    failNextWrite: () => { failNext = true; },
    /** Every write fails until this is turned off again. */
    setDiskFailing: (value: boolean) => { failAll = value; },
    /** Lets time pass, running timers and the writes they start. */
    wait: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProjectAutoSave', () => {
  it('does not write anything for a file that was only opened', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    await t.wait(2000);
    t.autoSave.endSession();
    await t.wait(100);
    expect(t.writes).toEqual([]);
  });

  it('saves an edit once the state has stayed unchanged for the delay', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withText);
    await t.wait(delayMs - 1);
    expect(t.writes).toEqual([]);
    await t.wait(20);
    // The untouched whole file is stored as its flagged full-length segment.
    expect(t.disk.get(path)).toEqual({ ...withText, cutSegments: [{ start: 0, end: 8, name: '', selected: true, initial: true }] });
  });

  it('keeps a written project in sync when its edits are undone or deleted', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withText);
    await t.wait(delayMs + 20);
    t.show({ id: 1 }, untouched);
    await t.wait(delayMs + 20);
    expect(t.writes).toHaveLength(2);
    expect(t.disk.get(path)?.overlayClips).toBeUndefined();
  });

  it('does not rewrite a project that was opened and left unchanged', async () => {
    const t = setup();
    t.show({ id: 1, loadedProjectPath: path }, withTrim);
    // The whole-file segment is created only once the media has loaded: still the same project.
    t.show({ id: 1, loadedProjectPath: path }, withText, { fileDuration: 8 });
    t.show({ id: 1, loadedProjectPath: path }, contents({ cutSegments: [], overlayClips: [textClip] }));
    t.show({ id: 1, loadedProjectPath: path }, withTrim);
    await t.wait(2000);
    t.autoSave.endSession();
    await t.wait(100);
    expect(t.writes).toEqual([]);
  });

  // Re-audit finding 2: no save had finished in this open, but the project file exists.
  it('saves a loaded project cleared before its first save', async () => {
    const t = setup();
    t.show({ id: 1, loadedProjectPath: path }, withText);
    t.show({ id: 1, loadedProjectPath: path }, untouched);
    await t.wait(delayMs + 20);
    expect(t.writes).toHaveLength(1);
    expect(t.disk.get(path)?.overlayClips).toBeUndefined();
  });

  it('copies a project loaded from another location to where it saves, and keeps that in sync', async () => {
    const t = setup();
    t.show({ id: 1, loadedProjectPath: '/elsewhere/clip-proj.llc' }, withText);
    await t.wait(delayMs + 20);
    expect(t.disk.get(path)?.overlayClips).toEqual([textClip]);
    t.show({ id: 1, loadedProjectPath: '/elsewhere/clip-proj.llc' }, untouched);
    await t.wait(delayMs + 20);
    expect(t.disk.get(path)?.overlayClips).toBeUndefined();
  });

  it('saves segments created on open (from chapters) without a project file, as before', async () => {
    const t = setup();
    t.show({ id: 1 }, withTrim);
    await t.wait(delayMs + 20);
    expect(t.writes).toHaveLength(1);
  });

  it('does not write an untouched project to a new location', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, untouched, { at: '/workdir/clip-proj.llc' });
    await t.wait(delayMs + 20);
    expect(t.writes).toEqual([]);
  });

  it('saves the latest state at once when the file closes', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    await t.wait(100);
    t.autoSave.endSession();
    await t.wait(20);
    expect(t.disk.get(path)).toEqual(withTrim);
    // ...and only once: the cancelled delay does not save it again.
    await t.wait(2000);
    expect(t.writes).toHaveLength(1);
  });

  // Re-audit finding 1.
  describe('when the file is reopened while a save of the previous open is still writing', () => {
    function editThenReopen() {
      const t = setup({ latencyMs: 1200 });
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      return t;
    }

    it('lets the new open read the project only after that save', async () => {
      const t = editThenReopen();
      await t.wait(delayMs + 50); // the save has started
      expect(t.writes).toHaveLength(1);
      expect(t.disk.has(path)).toBe(false);
      t.autoSave.endSession();
      let saved = false;
      const saving = t.autoSave.whenSaved().then(() => { saved = true; });
      await t.wait(1000);
      expect(saved).toBe(false);
      await t.wait(200);
      await saving;
      expect(t.disk.get(path)).toEqual(withTrim);
      // The new open read the trim from its project file: nothing to save.
      t.show({ id: 2, loadedProjectPath: path }, withTrim);
      await t.wait(3000);
      expect(t.writes).toHaveLength(1);
      expect(t.disk.get(path)).toEqual(withTrim);
    });

    it('does not let that save make the new open overwrite it', async () => {
      const t = editThenReopen();
      await t.wait(delayMs + 50);
      t.autoSave.endSession();
      // Even an open that read no project file (before that save landed) leaves the trim alone.
      t.show({ id: 2 }, untouched);
      await t.wait(5000);
      expect(t.writes).toHaveLength(1);
      expect(t.disk.get(path)).toEqual(withTrim);
    });
  });

  it('ignores late reports from a session that has ended', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.autoSave.endSession();
    t.show({ id: 1 }, withTrim);
    t.show({ id: 0 }, withTrim);
    await t.wait(2000);
    expect(t.writes).toEqual([]);
  });

  it('writes one save at a time, the newest last', async () => {
    const t = setup({ latencyMs: 850 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withText);
    await t.wait(delayMs + 50);
    t.show({ id: 1 }, withTrim);
    await t.wait(delayMs + 50);
    expect(t.writes).toHaveLength(1); // the second waits for the first
    await t.wait(2000);
    expect(t.writes.map((w) => w.data.cutSegments[0]?.start)).toEqual([0, 2]);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('reports a failed save, retries with the next change, and keeps saving', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.failNextWrite();
    t.show({ id: 1 }, withText);
    await t.wait(delayMs + 20);
    expect(t.errors).toHaveLength(1);
    expect(t.disk.has(path)).toBe(false);
    t.show({ id: 1 }, withTrim);
    await t.wait(delayMs + 20);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('does not save while autosave is turned off, and saves once it is turned back on', async () => {
    const t = setup();
    t.setEnabled(false);
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    await t.wait(2000);
    expect(t.writes).toEqual([]);
    t.setEnabled(true);
    t.show({ id: 1 }, withTrim);
    await t.wait(delayMs + 20);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('does not save a file closed while autosave is off', async () => {
    const t = setup();
    t.setEnabled(false);
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.autoSave.endSession();
    await t.wait(2000);
    expect(t.writes).toEqual([]);
  });

  it('ends the previous session when a new one reports', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.show({ id: 2, loadedProjectPath: '/videos/other-proj.llc' }, withText, { at: '/videos/other-proj.llc' });
    await t.wait(20);
    expect(t.disk.get(path)).toEqual(withTrim);
    await t.wait(2000);
    expect(t.writes).toHaveLength(1);
  });
});

describe('ProjectAutoSave before the app closes', () => {
  /** Runs `flush` while time passes, as it would while writes take their time. */
  async function flushWhile(t: ReturnType<typeof setup>, ms = 3000) {
    const flushing = t.autoSave.flush();
    await t.wait(ms);
    return flushing;
  }

  // Audit finding 1: an edit made right before closing used to wait for the delay and be lost.
  it('saves an edit still waiting for the delay, and keeps the file open', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    await t.wait(100);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
    // Still the open session: later edits are saved as usual, and nothing is saved twice.
    expect(t.writes).toHaveLength(1);
    t.show({ id: 1 }, withText);
    await t.wait(delayMs + 20);
    expect(t.disk.get(path)?.overlayClips).toEqual([textClip]);
  });

  it('waits for a save that is already writing', async () => {
    const t = setup({ latencyMs: 1500 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    await t.wait(delayMs + 50); // writing
    let done = false;
    const flushing = t.autoSave.flush().then((failures) => { done = true; return failures; });
    await t.wait(1000);
    expect(done).toBe(false);
    await t.wait(1000);
    expect(await flushing).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
    expect(t.writes).toHaveLength(1);
  });

  it('waits for the final save of a file closed just before', async () => {
    const t = setup({ latencyMs: 400 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.autoSave.endSession();
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('writes nothing when nothing changed', async () => {
    const t = setup();
    t.show({ id: 1, loadedProjectPath: path }, withTrim);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.writes).toEqual([]);
  });

  it('reports a failed save instead of passing it to onError, and saves it when tried again', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    const failures = await flushWhile(t);
    expect(failures).toEqual([{ path, error: new Error('disk full') }]);
    expect(t.errors).toEqual([]);
    expect(t.disk.has(path)).toBe(false);
    t.setDiskFailing(false);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('tries again the final save of a closed file that failed while closing', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    t.autoSave.endSession();
    expect(await flushWhile(t)).toHaveLength(1);
    t.setDiskFailing(false);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('does not count another open of the file with nothing to save as saving a failed change', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    t.autoSave.endSession();
    expect(await flushWhile(t)).toHaveLength(1);
    // The file is opened again; the trim never reached the disk, so this open does not show it,
    // and its own autosave finds nothing to save.
    t.setDiskFailing(false);
    t.show({ id: 2 }, untouched);
    await t.wait(delayMs + 20);
    expect(t.disk.has(path)).toBe(false);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)).toEqual(withTrim);
  });

  it('settles an earlier failure once a newer state of the open file is saved', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    expect(await flushWhile(t)).toHaveLength(1);
    t.setDiskFailing(false);
    t.show({ id: 1 }, withText);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)?.overlayClips).toEqual([textClip]);
    expect(await flushWhile(t)).toEqual([]);
  });

  it('respects autosave being turned off', async () => {
    const t = setup();
    t.setEnabled(false);
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.writes).toEqual([]);
  });

  it('reports failures outside of closing through onError, as before', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    await t.wait(delayMs + 20);
    expect(t.errors).toHaveLength(1);
  });

  describe('saveNow', () => {
    it('starts a waiting save at once', async () => {
      const t = setup();
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      await t.wait(50);
      t.autoSave.saveNow();
      await t.wait(20);
      expect(t.disk.get(path)).toEqual(withTrim);
      await t.wait(2000);
      expect(t.writes).toHaveLength(1);
    });

    it('does nothing when no save is waiting', async () => {
      const t = setup();
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      await t.wait(delayMs + 20);
      t.autoSave.saveNow();
      t.autoSave.saveNow();
      await t.wait(2000);
      expect(t.writes).toHaveLength(1);
    });
  });
});
