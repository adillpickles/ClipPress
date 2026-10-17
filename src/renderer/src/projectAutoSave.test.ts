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

/**
 * A disk whose writes take `latencyMs`, and an autosave writing to it. The disk stores each file
 * under `pathKey(path)`: paths with the same key are the same file.
 */
function setup({ latencyMs = 10, pathKey }: { latencyMs?: number, pathKey?: (filePath: string) => string } = {}) {
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
      disk.set(pathKey?.(writePath) ?? writePath, data);
    },
    onError: (err) => errors.push(err),
    ...(pathKey != null ? { pathKey } : {}),
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

  // PR #56 re-audit finding 1: three rounds used to be the limit, with the last change left unsaved.
  it('saves the changes made while it saves, however many, before resolving', async () => {
    const t = setup({ latencyMs: 100 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, contents({ cutSegments: [{ ...trimmed, start: 1 }] }));
    let result: unknown;
    const flushing = t.autoSave.flush().then((failures) => { result = failures; });
    // A change arrives during each write (the user keeps editing, or an operation finishes).
    for (let start = 2; start <= 6; start += 1) {
      // eslint-disable-next-line no-await-in-loop
      await t.wait(50);
      t.show({ id: 1 }, contents({ cutSegments: [{ ...trimmed, start }] }));
      // eslint-disable-next-line no-await-in-loop
      await t.wait(50);
      expect(result).toBeUndefined();
    }
    await t.wait(150);
    await flushing;
    expect(result).toEqual([]);
    expect(t.disk.get(path)?.cutSegments[0]?.start).toBe(6);
    expect(t.autoSave.hasUnsavedChanges()).toBe(false);
  });

  it('stops at a failed save of the open file and reports it, even with changes still arriving', async () => {
    const t = setup({ latencyMs: 100 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    const flushing = t.autoSave.flush();
    await t.wait(50);
    t.show({ id: 1 }, withText);
    await t.wait(1000);
    expect(await flushing).toEqual([{ path, error: new Error('disk full') }]);
    // Nor is the change saved (and its failure shown) in the background while the user decides.
    await t.wait(2000);
    expect(t.writes).toHaveLength(1);
    expect(t.errors).toEqual([]);
    // Trying again saves the latest state.
    t.setDiskFailing(false);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.get(path)?.overlayClips).toEqual([textClip]);
  });

  // PR #56 re-audit finding 4: a failure reported by onError before closing used to be forgotten.
  describe('a final save that failed before the app closes', () => {
    function closedWithFailedSave() {
      const t = setup();
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      t.setDiskFailing(true);
      t.autoSave.endSession();
      return t;
    }

    it('is reported when the app closes while saving still fails', async () => {
      const t = closedWithFailedSave();
      await t.wait(100);
      expect(t.errors).toHaveLength(1);
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
      expect(await flushWhile(t)).toEqual([{ path, error: new Error('disk full') }]);
      expect(t.errors).toHaveLength(1);
    });

    it('is saved when the app closes once the disk works again', async () => {
      const t = closedWithFailedSave();
      await t.wait(100);
      t.setDiskFailing(false);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(path)).toEqual(withTrim);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
    });

    it('is still reported after another file was opened and closed in between', async () => {
      const t = closedWithFailedSave();
      await t.wait(100);
      const other = '/videos/other-proj.llc';
      t.show({ id: 2 }, untouched, { at: other });
      t.autoSave.endSession();
      await t.wait(2000);
      expect((await flushWhile(t)).map((f) => f.path)).toEqual([path]);
    });
  });

  // PR #56 re-audit finding 3: a later flush used to write the earlier open's state over the
  // reopened file, while the reopened session still believed the file held what it had loaded.
  describe('when a file whose save failed is opened again', () => {
    async function failedThenReopened({ diskWorksBeforeReopen }: { diskWorksBeforeReopen: boolean }) {
      const t = setup();
      t.disk.set(path, untouched);
      t.show({ id: 1, loadedProjectPath: path }, untouched);
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      t.setDiskFailing(true);
      // Closing the app failed; the user cancelled, then closed the file, whose final save failed too.
      expect(await flushWhile(t)).toHaveLength(1);
      t.autoSave.endSession();
      await t.wait(100);
      t.setDiskFailing(!diskWorksBeforeReopen);
      // Opening waits for earlier saves before reading the project file.
      const saved = t.autoSave.whenSaved();
      await t.wait(100);
      await saved;
      const read = t.disk.get(path)!;
      t.show({ id: 2, loadedProjectPath: path }, read);
      return { t, read };
    }

    it('tries the failed save again before the file is read, so the reopened project has it', async () => {
      const { t, read } = await failedThenReopened({ diskWorksBeforeReopen: true });
      expect(read).toEqual(withTrim);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(path)).toEqual(withTrim);
    });

    it('lets the reopened project supersede a failed save that still fails', async () => {
      const { t, read } = await failedThenReopened({ diskWorksBeforeReopen: false });
      expect(read).toEqual(untouched);
      // The failure was reported again when trying before the read.
      expect(t.errors).toHaveLength(2);
      t.setDiskFailing(false);
      // Closing the app does not write the earlier state over what the reopened project shows...
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(path)).toEqual(untouched);
      // ...so its own saves stay correct: undoing back to what it loaded leaves nothing to fix.
      t.show({ id: 2, loadedProjectPath: path }, withText);
      await t.wait(delayMs + 20);
      t.show({ id: 2, loadedProjectPath: path }, untouched);
      await t.wait(delayMs + 20);
      expect(t.disk.get(path)).toEqual(encodeLlcProjectFile(untouched, 8));
    });

    it('does not keep a failure of the earlier open that lands after the reopen', async () => {
      const t = setup({ latencyMs: 300 });
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      t.setDiskFailing(true);
      // The new open reports before the earlier final save has finished (and then fails).
      t.show({ id: 2 }, untouched);
      await t.wait(1000);
      expect(t.errors).toHaveLength(1);
      t.setDiskFailing(false);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.has(path)).toBe(false);
    });
  });

  // PR #56 re-audit 2 finding 2: ownership went by how a path was written, so opening the same
  // file through a path written differently (another case, on Windows) did not supersede an
  // earlier open's failed save, which closing the app then wrote over the newer project.
  describe('when the same project file is reached through a path written differently', () => {
    const alias = '/Videos/Clip-proj.llc';
    const sameFile = (filePath: string) => filePath.toUpperCase();

    async function failedThenReopenedAs(reopenPath: string, pathKey?: (filePath: string) => string) {
      const t = setup(pathKey != null ? { pathKey } : {});
      const key = pathKey ?? ((filePath: string) => filePath);
      t.disk.set(key(path), untouched);
      t.show({ id: 1, loadedProjectPath: path }, untouched, { at: path });
      t.show({ id: 1, loadedProjectPath: path }, withTrim, { at: path });
      t.setDiskFailing(true);
      t.autoSave.endSession();
      await t.wait(100);
      const saved = t.autoSave.whenSaved();
      await t.wait(100);
      await saved;
      // Still failing: the reopened project shows what the file holds.
      const read = t.disk.get(key(reopenPath))!;
      expect(read).toEqual(untouched);
      t.show({ id: 2, loadedProjectPath: reopenPath }, read, { at: reopenPath });
      t.setDiskFailing(false);
      // The reopened project is edited and saved.
      t.show({ id: 2, loadedProjectPath: reopenPath }, withText, { at: reopenPath });
      await t.wait(delayMs + 20);
      return { t, key };
    }

    it('lets the reopened project supersede the failed save, rather than be overwritten by it', async () => {
      const { t, key } = await failedThenReopenedAs(alias, sameFile);
      expect(t.disk.get(key(path))).toEqual(encodeLlcProjectFile(withText, 8));
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(key(path))).toEqual(encodeLlcProjectFile(withText, 8));
    });

    it('was overwritten when paths were compared as written (what the key prevents)', async () => {
      // The same scenario without a key for the file, on a disk where both paths are one file.
      const disk = new Map<string, LlcProject>();
      const failing = { value: false };
      const autoSave = new ProjectAutoSave({
        delayMs,
        write: async (writePath, data) => {
          if (failing.value) throw new Error('disk full');
          disk.set(sameFile(writePath), data);
        },
        onError: () => undefined,
      });
      const show = (id: number, at: string, project: LlcProject) => autoSave.update({ session: { id, loadedProjectPath: at }, path: at, project, fileData: project }, { enabled: true });
      disk.set(sameFile(path), untouched);
      show(1, path, untouched);
      show(1, path, withTrim);
      failing.value = true;
      autoSave.endSession();
      await vi.advanceTimersByTimeAsync(100);
      show(2, alias, untouched);
      failing.value = false;
      show(2, alias, withText);
      await vi.advanceTimersByTimeAsync(delayMs + 20);
      expect(disk.get(sameFile(path))).toEqual(withText);
      await autoSave.flush();
      expect(disk.get(sameFile(path))).toEqual(withTrim);
    });

    it('does not keep a failure of the earlier open that lands after the reopen', async () => {
      const t = setup({ latencyMs: 300, pathKey: sameFile });
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      t.setDiskFailing(true);
      t.show({ id: 2 }, untouched, { at: alias });
      await t.wait(1000);
      t.setDiskFailing(false);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.has(sameFile(path))).toBe(false);
    });

    it('does not copy a project loaded through one path to another path of the same file', async () => {
      const t = setup({ pathKey: sameFile });
      t.disk.set(sameFile(path), withTrim);
      t.show({ id: 1, loadedProjectPath: alias }, withTrim);
      await t.wait(2000);
      expect(t.writes).toEqual([]);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
    });

    it('reports a failed save under the path it was written to', async () => {
      const t = setup({ pathKey: sameFile });
      t.show({ id: 1 }, untouched, { at: alias });
      t.show({ id: 1 }, withTrim, { at: alias });
      t.setDiskFailing(true);
      expect(await flushWhile(t)).toEqual([{ path: alias, error: new Error('disk full') }]);
    });

    it('settles a failed save once the file is saved through another of its paths', async () => {
      const t = setup({ pathKey: sameFile });
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      t.setDiskFailing(true);
      await t.wait(delayMs + 20);
      t.setDiskFailing(false);
      // The open file is now saved through another path of the same file (a changed setting).
      t.show({ id: 1 }, withText, { at: alias });
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(sameFile(path))).toEqual(encodeLlcProjectFile(withText, 8));
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
    });
  });

  // PR #56 re-audit 2 finding 3: the clean-up after an export forgot a failed save before it
  // deleted the project file, so a deletion that failed or was cancelled lost the failed changes.
  describe('a failed save of a project file that the clean-up after an export deletes', () => {
    async function closedWithFailedSave(t: ReturnType<typeof setup>) {
      t.disk.set(path, untouched);
      t.show({ id: 1, loadedProjectPath: path }, untouched);
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      t.setDiskFailing(true);
      t.autoSave.endSession();
      await t.wait(100);
      // Clean-up waits for earlier saves first, which tries the failed one again.
      const saved = t.autoSave.whenSaved();
      await t.wait(100);
      await saved;
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
    }
    const existsOn = (t: ReturnType<typeof setup>) => async (filePath: string) => t.disk.has(filePath);

    it('is forgotten once the file is gone, and never brings it back', async () => {
      const t = setup();
      await closedWithFailedSave(t);
      t.disk.delete(path);
      await t.autoSave.forgetFailedSaveOfDeletedFile(path, existsOn(t));
      t.setDiskFailing(false);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
      expect(await flushWhile(t)).toEqual([]);
      await t.autoSave.whenSaved();
      expect(t.disk.has(path)).toBe(false);
    });

    it('is kept, reported and saved when deleting the file failed or was cancelled', async () => {
      const t = setup();
      await closedWithFailedSave(t);
      // The file is still there, with the state from before the failed save.
      await t.autoSave.forgetFailedSaveOfDeletedFile(path, existsOn(t));
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
      expect(await flushWhile(t)).toEqual([{ path, error: new Error('disk full') }]);
      t.setDiskFailing(false);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.get(path)).toEqual(withTrim);
    });

    it('is kept when it cannot be told whether the file is gone', async () => {
      const t = setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await closedWithFailedSave(t);
      t.disk.delete(path);
      await t.autoSave.forgetFailedSaveOfDeletedFile(path, async () => { throw new Error('EPERM'); });
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
    });

    it('is forgotten after a try that was still writing when the file was deleted, and failed', async () => {
      const t = setup({ latencyMs: 300 });
      t.disk.set(path, untouched);
      t.show({ id: 1, loadedProjectPath: path }, untouched);
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      t.setDiskFailing(true);
      t.autoSave.endSession();
      await t.wait(400);
      // Closing the app tries it again; meanwhile the clean-up deletes the file.
      const flushing = t.autoSave.flush();
      await t.wait(50);
      t.disk.delete(path);
      const forgetting = t.autoSave.forgetFailedSaveOfDeletedFile(path, existsOn(t));
      await t.wait(400);
      await forgetting;
      // That try failed after the deletion; it is not left behind to bring the file back.
      expect(await flushing).toEqual([]);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
      t.setDiskFailing(false);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.disk.has(path)).toBe(false);
    });

    it('does nothing to a file without a failed save', async () => {
      const t = setup();
      const exists = vi.fn(existsOn(t));
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      t.autoSave.endSession();
      await t.wait(100);
      await t.autoSave.forgetFailedSaveOfDeletedFile(path, exists);
      expect(exists).not.toHaveBeenCalled();
    });
  });

  it('neither tries again nor reports failed saves while autosave is turned off', async () => {
    const t = setup();
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    t.autoSave.endSession();
    await t.wait(100);
    t.setEnabled(false);
    t.show({ id: 2 }, untouched, { at: '/videos/other-proj.llc' });
    t.setDiskFailing(false);
    expect(t.autoSave.hasUnsavedChanges()).toBe(false);
    expect(await flushWhile(t)).toEqual([]);
    expect(t.disk.has(path)).toBe(false);
    // Turned back on, the failed save is tried again when closing.
    t.setEnabled(true);
    t.show({ id: 2 }, untouched, { at: '/videos/other-proj.llc' });
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

  // Closing again after cancelling a slow save starts a second flush while the first still waits.
  it('reports a failure to every flush that is waiting for it', async () => {
    const t = setup({ latencyMs: 1000 });
    t.show({ id: 1 }, untouched);
    t.show({ id: 1 }, withTrim);
    t.setDiskFailing(true);
    const first = t.autoSave.flush();
    await t.wait(100);
    const second = t.autoSave.flush();
    await t.wait(5000);
    expect(await first).toEqual([{ path, error: new Error('disk full') }]);
    expect(await second).toEqual([{ path, error: new Error('disk full') }]);
    expect(t.errors).toEqual([]);
    // A failure after both have finished is reported as usual again.
    t.show({ id: 1 }, withText);
    await t.wait(delayMs + 1100);
    expect(t.errors).toHaveLength(1);
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

  // What keeps the window from closing on a change accepted after `flush` resolved (re-audit finding 1).
  describe('hasUnsavedChanges', () => {
    it('is true while a change waits, while it is written, and after a failed save', async () => {
      const t = setup({ latencyMs: 200 });
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
      t.show({ id: 1, loadedProjectPath: path }, withText);
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
      await t.wait(delayMs + 100); // writing
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
      await t.wait(200);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
      t.setDiskFailing(true);
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      await t.wait(delayMs + 300);
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
    });

    it('is false for a change that only went back to what is saved', async () => {
      const t = setup();
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      t.show({ id: 1, loadedProjectPath: path }, withText);
      t.show({ id: 1, loadedProjectPath: path }, withTrim);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
    });

    it('is true again for a change made after flush resolved', async () => {
      const t = setup();
      t.show({ id: 1 }, untouched);
      t.show({ id: 1 }, withTrim);
      expect(await flushWhile(t)).toEqual([]);
      expect(t.autoSave.hasUnsavedChanges()).toBe(false);
      t.show({ id: 1 }, withText);
      expect(t.autoSave.hasUnsavedChanges()).toBe(true);
    });
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
