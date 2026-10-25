import isEqual from 'lodash/isEqual';

import { hasProjectEdits } from './llcProject';
import type { ProjectFilePathKey } from './projectFilePathKey';
import type { LlcProject } from './types';

/** One open of a media file. Reopening the same file starts a new session. */
export interface ProjectSession {
  /** Increases with every open. */
  id: number,
  /** The project file the opened state was loaded from, if any. */
  loadedProjectPath?: string | undefined,
  /** Other project files found holding exactly what was loaded: the other copy, where the setting keeps two. */
  sameCopyPaths?: readonly string[] | undefined,
}

export interface ProjectSnapshot {
  session: ProjectSession,
  /** Where autosave writes the project. */
  path: string,
  /** Where it also writes a copy, after `path`: the setting keeps the edits in more than one place. */
  copyPaths?: readonly string[] | undefined,
  /** The project's contents, compared to decide whether a save is needed. */
  project: LlcProject,
  /** What is written to the file for `project`. */
  fileData: LlcProject,
}

export interface ProjectAutoSaveOptions {
  /** How long the state must stay unchanged before it is saved. */
  delayMs: number,
  write: (path: string, data: LlcProject) => Promise<void>,
  /** Reports a failed save. Must not throw: later saves, and opening files, wait on it. */
  onError: (err: unknown) => void,
  /**
   * The same key for every path to the same project file (see createProjectFilePathKey), so that a
   * path written differently cannot get around what a save may overwrite. By default, the path.
   * A key that is not resolved yet is asked for again before a save could overwrite a newer open.
   */
  pathKey?: (path: string) => ProjectFilePathKey,
}

/** A project file that could not be written. */
export interface ProjectSaveFailure {
  path: string,
  error: unknown,
}

/** What `saveTo` resolves with when nothing failed (a write may throw anything, even undefined). */
const noError = Symbol('noError');

/** Identifies a project file (see `ProjectAutoSaveOptions.pathKey`). Paths are only for writing and reporting. */
type FileKey = string & { readonly fileKey: unique symbol };

/** What a project file holds, as far as a session knows. */
interface SavedProject {
  project: LlcProject,
  /**
   * What the session wrote there, if it did. Written again when that is no longer what it would write, though the
   * contents are the same: the recording's length became known after an early save (a copy made on open, say).
   */
  fileData?: LlcProject | undefined,
}

interface OpenSession {
  id: number,
  /** What each project file holds, as far as this session knows: it loaded or wrote it. */
  saved: Map<FileKey, SavedProject>,
  /** Whether this media file has a project: one was loaded, or this session wrote one. */
  hasProject: boolean,
  latest: ProjectSnapshot,
}

/** A save that failed, with what to write when trying again. */
interface FailedSave {
  session: OpenSession,
  snapshot: ProjectSnapshot,
  /** The copy that could not be written: `snapshot.path`, or one of its `copyPaths`. */
  path: string,
  error: unknown,
  /** Increases with every failure, to tell which of two failures of one session is newer. */
  seq: number,
}

/**
 * Autosaves the project of the open media file.
 *
 * Opening a file never writes by itself (https://github.com/mifi/lossless-cut/issues/2745): its
 * project file already holds the opened state. Any edit is saved after `delayMs` without further
 * changes, and closing the file saves its latest state at once. Once the file has a project,
 * every change is saved, including back to an untouched state, so a deleted or undone edit does
 * not come back on reopen.
 *
 * Writes run one at a time, so an older save can never land after a newer one. Each write belongs
 * to the session that made it and only updates what that session knows, so a write that finishes
 * after the file was closed cannot affect the next open of the file. Before reading a project,
 * wait for `whenSaved` so the read sees every earlier save.
 *
 * A failed save is remembered until it is saved after all, tried again when the app closes or a
 * project is about to be read, and reported by `flush`. Only a newer open of the same project
 * file supersedes it: that open shows what the file held, and an older state must not replace it
 * behind its back. So no save of a session lands on a file that a newer session has read or saved,
 * and a try runs only if its save is still unsaved when its turn comes. Deleting the project file
 * on purpose (`deleteFile`) settles everything saved or failed before.
 *
 * The app must not close while anything is unsaved (`hasUnsavedChanges`): call `flush` first, and
 * do not close if it reports a failure the user has not accepted.
 *
 * A snapshot with `copyPaths` is saved to each of its paths in turn. Each copy is a project file of
 * its own here: saved, failed, owned and tried again on its own.
 *
 * Only the contents (`project`) decide whether a file needs saving, except for a file this session
 * wrote: it is written again when its `fileData` changed for the same contents, so a save made
 * before the recording's length was known gets that length too.
 */
export default class ProjectAutoSave {
  private session: OpenSession | undefined;

  /** The newest session seen. Snapshots of earlier, ended sessions are ignored. */
  private newestSessionId = -Infinity;

  private enabled = true;

  private timer: ReturnType<typeof setTimeout> | undefined;

  private queue = Promise.resolve();

  /** Writes queued or being written. */
  private pendingWrites = 0;

  /** Running `flush` calls, which report failures themselves rather than through `onError`. */
  private flushing = 0;

  private failureSeq = 0;

  /** By project file: its latest save failed, and nothing has saved it since. */
  private readonly failed = new Map<FileKey, FailedSave>();

  /** By project file: the newest session that read or saved it. */
  private readonly owners = new Map<FileKey, number>();

  /** The key of each path seen. One that is not resolved yet is asked for again by `resolveKeys`. */
  private readonly keys = new Map<string, ProjectFilePathKey>();

  private readonly options: ProjectAutoSaveOptions;

  constructor(options: ProjectAutoSaveOptions) {
    this.options = options;
  }

  private key(path: string) {
    let known = this.keys.get(path);
    if (known == null) {
      known = this.options.pathKey?.(path) ?? { key: path, resolved: true };
      this.keys.set(path, known);
    }
    return known.key as FileKey;
  }

  /** Every project file a snapshot is saved to, the main one first, each file once. */
  private paths({ path, copyPaths = [] }: ProjectSnapshot) {
    const all = [path, ...copyPaths];
    return all.filter((p, index) => all.findIndex((other) => this.key(other) === this.key(p)) === index);
  }

  private isSavedTo(snapshot: ProjectSnapshot, key: FileKey) {
    return this.paths(snapshot).some((p) => this.key(p) === key);
  }

  /** Reports the state of the open file. A snapshot of a new session ends the previous one. */
  update(snapshot: ProjectSnapshot | undefined, { enabled }: { enabled: boolean }) {
    this.enabled = enabled;
    if (snapshot == null) {
      this.cancelTimer();
      return;
    }

    const { id, loadedProjectPath, sameCopyPaths = [] } = snapshot.session;
    if (this.session?.id === id) {
      this.session.latest = snapshot;
      // The project may now be saved elsewhere (the setting for where projects are stored changed).
      for (const p of this.paths(snapshot)) this.claim(p, id);
      this.schedule();
      return;
    }
    if (id <= this.newestSessionId) return;

    this.endSession();
    this.newestSessionId = id;
    // So that the new session supersedes an earlier one's failed save of its file, even one made
    // while that file's folder could not be resolved.
    this.resolveKeys();
    const loadedPaths = loadedProjectPath != null ? [loadedProjectPath, ...sameCopyPaths] : [];
    this.session = {
      id,
      saved: new Map(loadedPaths.map((p) => [this.key(p), { project: snapshot.project }])),
      hasProject: loadedProjectPath != null,
      latest: snapshot,
    };
    for (const p of loadedPaths) this.claim(p, id);
    for (const p of this.paths(snapshot)) this.claim(p, id);
    // Usually nothing to save. But a project loaded from elsewhere is copied to where autosave
    // writes, and segments created on open (from chapters) are saved, as before.
    this.schedule();
  }

  /** Ends the open session (the file is closing), saving its latest state now. */
  endSession() {
    const { session } = this;
    if (session == null) return;
    this.session = undefined;
    this.cancelTimer();
    if (this.enabled) this.enqueueSave(session, session.latest);
  }

  /**
   * Resolves once every save started so far has finished, after trying again the saves that
   * failed. Wait for it before reading a project, so that the read sees every change that could be
   * saved: a session that then opens the file supersedes a failed save of it that is still failing.
   */
  async whenSaved() {
    this.retryFailed();
    await this.drain();
  }

  /**
   * Starts saving a change that is waiting for the delay, now. Does nothing when no change is
   * waiting. For moments when the app may be terminated without closing normally, such as losing
   * focus to an installer or the session ending.
   */
  saveNow() {
    if (this.timer == null) return;
    this.cancelTimer();
    const { session } = this;
    if (session != null && this.enabled) this.enqueueSave(session, session.latest);
  }

  /**
   * Whether open session `sessionId` has the project at `path` on disk as it knows it: it wrote it there, or loaded
   * it from there (or from a copy found the same, `sameCopyPaths`). Not true of a save that failed, nor of a file that
   * was there before.
   */
  hasSaved(sessionId: number, path: string) {
    const { session } = this;
    return session != null && session.id === sessionId && session.saved.has(this.key(path));
  }

  /**
   * Whether anything is not on disk yet: a change waiting for the delay or being written, or a
   * failed save. While autosave is turned off, nothing is saved, so nothing counts as unsaved.
   */
  hasUnsavedChanges() {
    if (!this.enabled) return false;
    if (this.pendingWrites > 0 || this.failed.size > 0) return true;
    const { session } = this;
    return session != null && this.needsSave(session, session.latest);
  }

  /**
   * Deletes a project file on purpose (the clean-up after an export) by calling `remove`, between
   * saves: after every save started so far, and before any started later, so none of them can
   * bring the file back after it is gone, nor fail and leave a failure behind.
   *
   * Once the file is gone, nothing from before brings it back: a failed save of it is forgotten,
   * and if the open file is saved there, its current state counts as saved (a later change saves
   * it again). If the file is still there (deleting it failed or was cancelled), or it cannot be
   * told, nothing is forgotten: it holds an older state, and a failed save of it is tried again
   * and reported like any other. Rejects when `remove` does.
   */
  async deleteFile(path: string, { remove, exists }: {
    remove: () => Promise<void>,
    /** Throws when it cannot tell. */
    exists: (filePath: string) => Promise<boolean>,
  }) {
    const deletion = this.queue.then(async () => {
      await remove();
      try {
        if (await exists(path)) {
          console.warn('Keeping a failed save of a project file that was not deleted', path);
          return;
        }
      } catch (err) {
        console.error('Could not tell whether a project file was deleted; keeping its failed save', path, err);
        return;
      }
      this.resolveKeys();
      const key = this.key(path);
      const failure = this.failed.get(key);
      if (failure != null) {
        console.warn('Forgetting a failed save of a deleted project file', path, failure.error);
        this.failed.delete(key);
      }
      const open = this.session;
      if (open != null && this.isSavedTo(open.latest, key)) {
        this.cancelTimer();
        open.saved.set(key, { project: open.latest.project });
        // Another copy of the project still waits for that change.
        if (this.enabled && this.needsSave(open, open.latest)) this.schedule();
      }
    });
    this.queue = deletion.then(() => undefined, () => undefined);
    await deletion;
  }

  /**
   * Saves everything before the app closes, and resolves with the files that could not be saved.
   *
   * That is the open file's latest state, including changes made while saving, every save already
   * started (such as the final save of a file closed just before), and every save that failed
   * earlier, which is tried again. The open file stays open. Failures are only reported here, not
   * through `onError`.
   */
  async flush(): Promise<ProjectSaveFailure[]> {
    this.flushing += 1;
    try {
      this.retryFailed();
      for (;;) {
        this.cancelTimer();
        const { session } = this;
        if (session != null && this.enabled) this.enqueueSave(session, session.latest);
        // eslint-disable-next-line no-await-in-loop
        await this.drain();
        // Until no change is left, or saving the open file failed (which is reported).
        const open = this.session;
        if (open == null || !this.enabled || !this.needsSave(open, open.latest)) break;
        if (this.paths(open.latest).some((p) => this.failed.has(this.key(p)))) {
          // Trying again saves the latest state. Not in the background meanwhile: its error
          // notification would replace the dialog that tells the user about this failure.
          this.cancelTimer();
          break;
        }
      }
    } finally {
      this.flushing -= 1;
    }
    if (!this.enabled) return [];
    return [...this.failed.values()].map(({ path, error }) => ({ path, error }));
  }

  /** Waits until no write is queued, including writes queued while waiting. */
  private async drain() {
    let queue: Promise<void> | undefined;
    while (queue !== this.queue) {
      ({ queue } = this);
      // eslint-disable-next-line no-await-in-loop
      await queue;
    }
  }

  /**
   * Session `id` reads or saves `path`. What it shows is based on that file as it is now, so an
   * earlier session's failed save of it is superseded: written later, it would silently replace
   * what this session shows (and believes is on disk). It was tried again before the file was read.
   */
  private claim(path: string, id: number) {
    const key = this.key(path);
    if ((this.owners.get(key) ?? -Infinity) >= id) return;
    this.owners.set(key, id);
    this.supersedeOlderFailure(key);
  }

  /** Forgets a failed save of `key` by a session older than the file's newest session (see claim). */
  private supersedeOlderFailure(key: FileKey) {
    const failure = this.failed.get(key);
    if (failure != null && failure.session.id < (this.owners.get(key) ?? -Infinity)) {
      console.warn('A newer open of the project supersedes its failed save', failure.snapshot.path, failure.error);
      this.failed.delete(key);
    }
  }

  /** The sessions that may still save: the open one, and those with a failed save. */
  private sessionsThatMaySave() {
    const sessions = new Set([...this.failed.values()].map(({ session }) => session));
    if (this.session != null) sessions.add(this.session);
    return sessions;
  }

  /**
   * Asks again for the keys of paths whose folder could not be resolved when they were first seen,
   * and files what was kept under such a key under the file's real key. Otherwise a failed save
   * made while a network drive was reconnecting, say, would never meet a newer open of the same
   * file through another of its paths, and could be written over it. Called before a save could
   * overwrite a newer open (trying a failed save again, opening a file, deleting one); a key that
   * nothing is kept under is forgotten instead, and asked for again when it is next needed.
   */
  private resolveKeys() {
    for (const [path, known] of this.keys) {
      if (!known.resolved) this.resolveKey(path, known.key as FileKey);
    }
  }

  private resolveKey(path: string, key: FileKey) {
    const sessions = this.sessionsThatMaySave();
    if (!this.owners.has(key) && !this.failed.has(key) && ![...sessions].some(({ saved }) => saved.has(key))) {
      this.keys.delete(path);
      return;
    }
    const now = this.options.pathKey?.(path);
    if (now?.resolved !== true) return;
    this.keys.set(path, now);
    if (now.key !== key) this.moveKey(key, now.key as FileKey, sessions);
  }

  /** What was kept under `from` belongs to the file whose key is `to`, with what was kept under that. */
  private moveKey(from: FileKey, to: FileKey, sessions: Set<OpenSession>) {
    const owner = this.owners.get(from);
    if (owner != null) {
      this.owners.delete(from);
      this.owners.set(to, Math.max(owner, this.owners.get(to) ?? -Infinity));
    }
    for (const { saved } of sessions) {
      const known = saved.get(from);
      if (known !== undefined) {
        saved.delete(from);
        // Two records of what one file holds, and which is newer is unknown: trust neither, which
        // only means saving the session's state once more.
        if (saved.has(to)) saved.delete(to);
        else saved.set(to, known);
      }
    }
    const failure = this.failed.get(from);
    if (failure != null) {
      this.failed.delete(from);
      const other = this.failed.get(to);
      // Of two failed saves of one file, the newer session's supersedes the older one's, as a newer
      // open would have; of one session's two, the later one is its newer state.
      if (other == null || failure.session.id > other.session.id || (failure.session === other.session && failure.seq > other.seq)) this.failed.set(to, failure);
    }
    this.supersedeOlderFailure(to);
  }

  /** Tries again every failed save: an ended session's with its own state, the open file's with its latest. */
  private retryFailed() {
    if (!this.enabled) return;
    this.resolveKeys();
    for (const [key, failure] of this.failed) {
      const { session } = failure;
      // The open file is now saved elsewhere (a changed setting), its latest state with it.
      if (session === this.session && !this.isSavedTo(session.latest, key)) this.failed.delete(key);
      else this.enqueueRetry(failure);
    }
  }

  private schedule() {
    this.cancelTimer();
    const { session } = this;
    if (!this.enabled || session == null) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.enqueueSave(session, session.latest);
    }, this.options.delayMs);
  }

  private cancelTimer() {
    if (this.timer == null) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private needsSave(session: OpenSession, snapshot: ProjectSnapshot) {
    return this.paths(snapshot).some((path) => this.needsSaveTo(session, snapshot, path));
  }

  private needsSaveTo(session: OpenSession, { project, fileData }: ProjectSnapshot, path: string) {
    const saved = session.saved.get(this.key(path));
    if (saved == null) return session.hasProject || hasProjectEdits(project);
    return !isEqual(saved.project, project) || (saved.fileData != null && !isEqual(saved.fileData, fileData));
  }

  /** Runs `job` after every write queued so far, counting it as a pending write until it has run. */
  private enqueue(job: () => Promise<void>) {
    this.pendingWrites += 1;
    this.queue = this.queue.then(async () => {
      try {
        await job();
      } finally {
        this.pendingWrites -= 1;
      }
    });
  }

  private enqueueSave(session: OpenSession, snapshot: ProjectSnapshot) {
    this.enqueue(async () => this.save(session, snapshot));
  }

  /**
   * Tries a failed save again, if it is still unsaved by then: it may have been saved meanwhile,
   * superseded by a newer open of its file, or forgotten because the file was deleted.
   */
  private enqueueRetry(failure: FailedSave) {
    this.enqueue(async () => {
      this.resolveKeys();
      if (![...this.failed.values()].includes(failure)) return;
      const { session, path } = failure;
      const snapshot = session === this.session ? session.latest : failure.snapshot;
      if (!this.isSavedTo(snapshot, this.key(path))) {
        // The open file stopped keeping this copy meanwhile (a changed setting).
        this.failed.delete(this.key(path));
        return;
      }
      const error = await this.saveTo(session, snapshot, path);
      if (error !== noError && this.flushing === 0) this.options.onError(error);
    });
  }

  /** Saves every copy of `snapshot`, one after the other, and reports the first that failed. */
  private async save(session: OpenSession, snapshot: ProjectSnapshot) {
    let firstError: unknown = noError;
    for (const path of this.paths(snapshot)) {
      // eslint-disable-next-line no-await-in-loop
      const error = await this.saveTo(session, snapshot, path);
      if (firstError === noError) firstError = error;
    }
    if (firstError !== noError && this.flushing === 0) this.options.onError(firstError);
  }

  /** Saves `snapshot` to one of its paths. Resolves with the error if that failed, otherwise with `noError`. */
  private async saveTo(session: OpenSession, snapshot: ProjectSnapshot, path: string): Promise<unknown> {
    const { project, fileData } = snapshot;
    // A newer session has read or saved this file since: what it shows must not be replaced by an
    // older state. (Only ever an ended session's save: the open session is the newest.)
    if ((this.owners.get(this.key(path)) ?? -Infinity) > session.id) {
      const key = this.key(path);
      if (this.failed.get(key)?.session === session) this.supersedeOlderFailure(key);
      console.warn('Not saving an older state over a newer open of the project', path);
      return noError;
    }
    try {
      const needsSave = this.needsSaveTo(session, snapshot, path);
      if (needsSave) {
        console.log('Saving project file', path, fileData);
        await this.options.write(path, fileData);
        session.saved.set(this.key(path), { project, fileData });
        // eslint-disable-next-line no-param-reassign
        session.hasProject = true;
      }
      // A write of the file by the same or a newer session settles an earlier failure, as does
      // finding the failed session's own state on disk. Another session having nothing to save does not.
      const key = this.key(path);
      const failure = this.failed.get(key);
      if (failure != null && (needsSave ? failure.session.id <= session.id : failure.session === session)) this.failed.delete(key);
      return noError;
    } catch (err) {
      const key = this.key(path);
      // Not if a newer session has read or saved the file since: its state must not be replaced by this one.
      if ((this.owners.get(key) ?? -Infinity) <= session.id) {
        this.failureSeq += 1;
        this.failed.set(key, { session, snapshot, path, error: err, seq: this.failureSeq });
      }
      return err;
    }
  }
}
