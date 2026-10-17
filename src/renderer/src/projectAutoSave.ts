import isEqual from 'lodash/isEqual';

import { hasProjectEdits } from './llcProject';
import type { LlcProject } from './types';

/** One open of a media file. Reopening the same file starts a new session. */
export interface ProjectSession {
  /** Increases with every open. */
  id: number,
  /** The project file the opened state was loaded from, if any. */
  loadedProjectPath?: string | undefined,
}

export interface ProjectSnapshot {
  session: ProjectSession,
  /** Where autosave writes the project. */
  path: string,
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
   */
  pathKey?: (path: string) => string,
}

/** A project file that could not be written. */
export interface ProjectSaveFailure {
  path: string,
  error: unknown,
}

/** Identifies a project file (see `ProjectAutoSaveOptions.pathKey`). Paths are only for writing and reporting. */
type FileKey = string & { readonly fileKey: unique symbol };

interface OpenSession {
  id: number,
  /** What each project file holds, as far as this session knows: it loaded or wrote it. */
  saved: Map<FileKey, LlcProject>,
  /** Whether this media file has a project: one was loaded, or this session wrote one. */
  hasProject: boolean,
  latest: ProjectSnapshot,
}

/** A save that failed, with what to write when trying again. */
interface FailedSave {
  session: OpenSession,
  snapshot: ProjectSnapshot,
  error: unknown,
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
 * behind its back.
 *
 * The app must not close while anything is unsaved (`hasUnsavedChanges`): call `flush` first, and
 * do not close if it reports a failure the user has not accepted.
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

  /** By project file: its latest save failed, and nothing has saved it since. */
  private readonly failed = new Map<FileKey, FailedSave>();

  /** By project file: the newest session that read or saved it. */
  private readonly owners = new Map<FileKey, number>();

  private readonly options: ProjectAutoSaveOptions;

  constructor(options: ProjectAutoSaveOptions) {
    this.options = options;
  }

  private key(path: string) {
    return (this.options.pathKey?.(path) ?? path) as FileKey;
  }

  /** Reports the state of the open file. A snapshot of a new session ends the previous one. */
  update(snapshot: ProjectSnapshot | undefined, { enabled }: { enabled: boolean }) {
    this.enabled = enabled;
    if (snapshot == null) {
      this.cancelTimer();
      return;
    }

    const { id, loadedProjectPath } = snapshot.session;
    if (this.session?.id === id) {
      this.session.latest = snapshot;
      // The project may now be saved elsewhere (the setting for where projects are stored changed).
      this.claim(snapshot.path, id);
      this.schedule();
      return;
    }
    if (id <= this.newestSessionId) return;

    this.endSession();
    this.newestSessionId = id;
    this.session = {
      id,
      saved: new Map(loadedProjectPath != null ? [[this.key(loadedProjectPath), snapshot.project]] : []),
      hasProject: loadedProjectPath != null,
      latest: snapshot,
    };
    if (loadedProjectPath != null) this.claim(loadedProjectPath, id);
    this.claim(snapshot.path, id);
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
    if (this.enabled) this.enqueue(session, session.latest);
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
    if (session != null && this.enabled) this.enqueue(session, session.latest);
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

  /** Forgets a failed save of `path`, whose project file is being deleted: it must not be written again. */
  discardFailedSave(path: string) {
    this.failed.delete(this.key(path));
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
        if (session != null && this.enabled) this.enqueue(session, session.latest);
        // eslint-disable-next-line no-await-in-loop
        await this.drain();
        // Until no change is left, or saving the open file failed (which is reported).
        const open = this.session;
        if (open == null || !this.enabled || !this.needsSave(open, open.latest)) break;
        if (this.failed.has(this.key(open.latest.path))) {
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
    return [...this.failed.values()].map(({ snapshot: { path }, error }) => ({ path, error }));
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
    const failure = this.failed.get(key);
    if (failure != null && failure.session.id < id) {
      console.warn('A newer open of the project supersedes its failed save', path, failure.error);
      this.failed.delete(key);
    }
  }

  /** Tries again every failed save: an ended session's with its own state, the open file's with its latest. */
  private retryFailed() {
    if (!this.enabled) return;
    for (const [key, failure] of this.failed) {
      const { session } = failure;
      if (session !== this.session) this.enqueue(session, failure.snapshot);
      else if (key === this.key(session.latest.path)) this.enqueue(session, session.latest);
      // The open file is now saved elsewhere (a changed setting), its latest state with it.
      else this.failed.delete(key);
    }
  }

  private schedule() {
    this.cancelTimer();
    const { session } = this;
    if (!this.enabled || session == null) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.enqueue(session, session.latest);
    }, this.options.delayMs);
  }

  private cancelTimer() {
    if (this.timer == null) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private needsSave(session: OpenSession, { path, project }: ProjectSnapshot) {
    const saved = session.saved.get(this.key(path));
    return saved != null ? !isEqual(saved, project) : session.hasProject || hasProjectEdits(project);
  }

  private enqueue(session: OpenSession, snapshot: ProjectSnapshot) {
    const { path, project, fileData } = snapshot;
    const key = this.key(path);
    this.pendingWrites += 1;
    this.queue = this.queue.then(async () => {
      try {
        const needsSave = this.needsSave(session, snapshot);
        if (needsSave) {
          console.log('Saving project file', path, fileData);
          await this.options.write(path, fileData);
          session.saved.set(key, project);
          // eslint-disable-next-line no-param-reassign
          session.hasProject = true;
        }
        // A write of the file by the same or a newer session settles an earlier failure, as does
        // finding the failed session's own state on disk. Another session having nothing to save does not.
        const failure = this.failed.get(key);
        if (failure != null && (needsSave ? failure.session.id <= session.id : failure.session === session)) this.failed.delete(key);
      } catch (err) {
        // Not if a newer session has read or saved the file since: its state must not be replaced by this one.
        if ((this.owners.get(key) ?? -Infinity) <= session.id) this.failed.set(key, { session, snapshot, error: err });
        if (this.flushing === 0) this.options.onError(err);
      } finally {
        this.pendingWrites -= 1;
      }
    });
  }
}
