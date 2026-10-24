/** A shelf thumbnail: a blob URL, or null when none could be made (not a video FFmpeg can read). */
export type ShelfThumbnail = string | null;

export interface ShelfThumbnailJob {
  /** shelfThumbnailKey: the file's path, time and size. */
  key: string,
  path: string,
}

interface ShelfThumbnailsOptions {
  render: (path: string, signal: AbortSignal) => Promise<string | undefined>,
  revoke: (url: string) => void,
  /** A thumbnail someone asked for is ready (or couldn't be made): time to take a new snapshot. */
  onChange: () => void,
  maxEntries?: number,
  concurrency?: number,
  backgroundConcurrency?: number,
}

/** Enough for a big recordings folder; each is a few KB. */
const defaultMaxEntries = 200;
/** Made in the background: the top of the shelf, which is what shows when it opens. */
const maxPrefetch = 60;

/**
 * The thumbnails for the shelf's folder, kept in memory (blob URLs) and never on disk; the owner disposes of
 * them when the folder changes. Rows that show come first, several at a time. The rest of the folder is made
 * in the background, one at a time and only while nothing is waiting, so it never holds up a row that shows.
 */
export default class ShelfThumbnails {
  // Least recently used first.
  private readonly cache = new Map<string, ShelfThumbnail>();

  private readonly controller = new AbortController();

  private wanted: ShelfThumbnailJob[] = [];

  private background: ShelfThumbnailJob[] = [];

  private readonly inFlight = new Set<string>();

  // Asked for by a row or Up next: shown once it arrives. Background ones are shown with the next snapshot.
  private readonly waitingFor = new Set<string>();

  private running = 0;

  private runningBackground = 0;

  private readonly options: ShelfThumbnailsOptions;

  constructor(options: ShelfThumbnailsOptions) {
    this.options = options;
  }

  snapshot(): ReadonlyMap<string, ShelfThumbnail> {
    return new Map(this.cache);
  }

  /** A row needs this one now. */
  request({ key, path }: ShelfThumbnailJob) {
    if (this.controller.signal.aborted) return;
    if (this.cache.has(key)) {
      // Made in the background since the last snapshot.
      const thumbnail = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, thumbnail);
      this.options.onChange();
      return;
    }
    this.waitingFor.add(key);
    if (this.inFlight.has(key) || this.wanted.some((job) => job.key === key)) return;
    this.background = this.background.filter((job) => job.key !== key);
    this.wanted.push({ key, path });
    this.pump();
  }

  /** Make these in the background, in this order (replacing any not started yet). */
  prefetch(jobs: readonly ShelfThumbnailJob[]) {
    if (this.controller.signal.aborted) return;
    this.background = jobs.slice(0, maxPrefetch).filter((job) => !this.cache.has(job.key) && !this.inFlight.has(job.key));
    this.pump();
  }

  /** The editor needs FFmpeg for itself again: start no more in the background (those running finish). */
  stopPrefetch() {
    this.background = [];
  }

  dispose() {
    this.controller.abort();
    this.wanted = [];
    this.background = [];
    this.cache.forEach((thumbnail) => {
      if (thumbnail != null) this.options.revoke(thumbnail);
    });
    this.cache.clear();
  }

  private pump() {
    const { concurrency = 4, backgroundConcurrency = 1 } = this.options;
    while (this.running < concurrency) {
      let job = this.wanted.shift();
      const isBackground = job == null;
      if (job == null && this.runningBackground < backgroundConcurrency) job = this.background.shift();
      if (job == null) return;
      this.run(job, isBackground);
    }
  }

  private run({ key, path }: ShelfThumbnailJob, isBackground: boolean) {
    const { signal } = this.controller;
    this.inFlight.add(key);
    this.running += 1;
    if (isBackground) this.runningBackground += 1;
    this.options.render(path, signal)
      .catch(() => undefined)
      .then((url) => {
        this.inFlight.delete(key);
        this.running -= 1;
        if (isBackground) this.runningBackground -= 1;
        if (signal.aborted) {
          if (url != null) this.options.revoke(url);
          return;
        }
        this.cache.set(key, url ?? null);
        this.evict();
        if (this.waitingFor.delete(key)) this.options.onChange();
        this.pump();
      });
  }

  private evict() {
    const { maxEntries = defaultMaxEntries } = this.options;
    for (const [key, thumbnail] of this.cache) {
      if (this.cache.size <= maxEntries) return;
      this.cache.delete(key);
      if (thumbnail != null) this.options.revoke(thumbnail);
    }
  }
}
