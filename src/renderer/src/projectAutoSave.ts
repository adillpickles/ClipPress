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
 */
export default class ProjectAutoSave {
  private session: OpenSession | undefined;

  /** The newest session seen. Snapshots of earlier, ended sessions are ignored. */
  private newestSessionId = -Infinity;

  private enabled = true;

  private timer: ReturnType<typeof setTimeout> | undefined;

  private queue = Promise.resolve();

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

  private enqueue(session: OpenSession, { path, project, fileData }: ProjectSnapshot) {
    this.queue = this.queue.then(async () => {
      try {
        const saved = session.saved.get(path);
        const needsSave = saved != null ? !isEqual(saved, project) : session.hasProject || hasProjectEdits(project);
        if (!needsSave) return;
        console.log('Saving project file', path, fileData);
        await this.options.write(path, fileData);
        session.saved.set(path, project);
        // eslint-disable-next-line no-param-reassign
        session.hasProject = true;
      } catch (err) {
        this.options.onError(err);
      }
    });
  }
}
