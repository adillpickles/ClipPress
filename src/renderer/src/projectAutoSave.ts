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
}

/** A project file that `flush` could not write. */
export interface ProjectSaveFailure {
  path: string,
  error: unknown,
}

interface OpenSession {
  id: number,
  /** What each project file holds, as far as this session knows: it loaded or wrote it. */
  saved: Map<string, LlcProject>,
  /** Whether this media file has a project: one was loaded, or this session wrote one. */
  hasProject: boolean,
  latest: ProjectSnapshot,
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
 * The app must not close while a change is still waiting for the delay or being written: call
 * `flush` first, and do not close if it reports a failure the user has not accepted.
 */
export default class ProjectAutoSave {
  private session: OpenSession | undefined;

  /** The newest session seen. Snapshots of earlier, ended sessions are ignored. */
  private newestSessionId = -Infinity;

  private enabled = true;

  private timer: ReturnType<typeof setTimeout> | undefined;

  private queue = Promise.resolve();

  /**
   * One per `flush` running: the files whose latest write failed. They are reported by `flush`, not
   * `onError`. Several can run at once (closing again while a slow save of the last attempt is still
   * writing), and each must see every failure until it finishes.
   */
  private readonly flushFailures = new Set<Map<string, ProjectSaveFailure>>();

  /** Writes that failed during a `flush`, so that the next `flush` (trying again) repeats them. */
  private readonly retryOnFlush = new Map<string, { session: OpenSession, snapshot: ProjectSnapshot }>();

  private readonly options: ProjectAutoSaveOptions;

  constructor(options: ProjectAutoSaveOptions) {
    this.options = options;
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
      this.schedule();
      return;
    }
    if (id <= this.newestSessionId) return;

    this.endSession();
    this.newestSessionId = id;
    this.session = {
      id,
      saved: new Map(loadedProjectPath != null ? [[loadedProjectPath, snapshot.project]] : []),
      hasProject: loadedProjectPath != null,
      latest: snapshot,
    };
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

  /** Resolves once every save started so far has finished (or failed). */
  whenSaved() {
    return this.queue;
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
   * Saves everything before the app closes, and resolves with the files that could not be saved.
   *
   * That is the open file's latest state, every save already started (such as the final save of a
   * file closed just before), and the saves that failed in an earlier `flush`, which are tried
   * again. The open file stays open. Failures are only reported here, not through `onError`.
   */
  async flush(): Promise<ProjectSaveFailure[]> {
    const failures = new Map<string, ProjectSaveFailure>();
    this.flushFailures.add(failures);
    try {
      for (const [path, { session, snapshot }] of this.retryOnFlush) {
        // The open file's latest state supersedes what failed to save earlier.
        if (session !== this.session) this.enqueue(session, snapshot);
        else this.retryOnFlush.delete(path);
      }
      // A change made while saving is saved too (bounded, in case changes keep coming).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        this.cancelTimer();
        const { session } = this;
        if (session != null && this.enabled) this.enqueue(session, session.latest);
        // eslint-disable-next-line no-await-in-loop
        await this.drain();
        if (this.timer == null) break;
      }
    } finally {
      this.flushFailures.delete(failures);
    }
    return [...failures.values()];
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

  private enqueue(session: OpenSession, snapshot: ProjectSnapshot) {
    const { path, project, fileData } = snapshot;
    this.queue = this.queue.then(async () => {
      try {
        const saved = session.saved.get(path);
        const needsSave = saved != null ? !isEqual(saved, project) : session.hasProject || hasProjectEdits(project);
        if (needsSave) {
          console.log('Saving project file', path, fileData);
          await this.options.write(path, fileData);
          session.saved.set(path, project);
          // eslint-disable-next-line no-param-reassign
          session.hasProject = true;
        }
        // A newer write of the file, or the failed session's own state found on disk, settles an
        // earlier failure. Another session merely having nothing to save does not.
        if (needsSave || this.retryOnFlush.get(path)?.session === session) {
          for (const failures of this.flushFailures) failures.delete(path);
          this.retryOnFlush.delete(path);
        }
      } catch (err) {
        if (this.flushFailures.size > 0) {
          for (const failures of this.flushFailures) failures.set(path, { path, error: err });
          this.retryOnFlush.set(path, { session, snapshot });
        } else {
          this.options.onError(err);
        }
      }
    });
  }
}
