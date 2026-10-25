import { countFramesBetween, getDetailRequest, getFilmstripArgs, getFilmstripChunks, getFilmstripDetailArgs, getFilmstripFallbackArgs, getFilmstripInterval, hasEveryKeyframe, mergeRanges, servesView } from './filmstrip';
import type { FilmstripFrame, FilmstripView, TimeRange } from './filmstrip';

/**
 * Runs one FFmpeg pass, handing over each frame as it's made; resolves with how many came (ffmpeg.ts). Rejects with
 * an AbortError if it was stopped (`signal`, or the app's Abort button).
 */
export type FilmstripRunner = (options: {
  args: string[],
  timeOffset: number,
  signal: AbortSignal,
  onFrame: (frame: FilmstripFrame & { aspect: number | undefined }) => void,
}) => Promise<number>;

export interface FilmstripSnapshot {
  /** Sorted by time: the default strip's frames, plus denser ones while zoomed in. */
  frames: readonly FilmstripFrame[],
  /** The stretches of the recording read so far. */
  covered: readonly TimeRange[],
  /** The frames' width / height, once the first has come. */
  aspect: number | undefined,
  /** The default strip is complete (or couldn't be made). */
  done: boolean,
}

export interface FilmstripSessionOptions {
  filePath: string,
  duration: number,
  /** The recording's start time, subtracted from FFmpeg's timestamps (the player starts at 0). */
  timeOffset: number,
  frameHeight: number,
  run: FilmstripRunner,
  revoke: (url: string) => void,
  /** Something changed (called often while frames arrive: the caller batches). */
  onChange: () => void,
}

/**
 * One FFmpeg pass over [from, to]: a stretch of the default strip, or denser frames (`spacing`, of any frame or
 * of keyframes only) for a zoomed-in window.
 */
class FilmPass {
  readonly from: number;

  /** Where it ends; where it got to, if it was stopped. */
  to: number;

  readonly spacing: number;

  readonly keyframes: boolean;

  state: 'waiting' | 'running' | 'done' = 'waiting';

  /** The last frame's time so far. */
  readTo: number;

  readonly frames: FilmstripFrame[] = [];

  readonly abortController = new AbortController();

  constructor({ from, to, spacing = 0, keyframes = true }: { from: number, to: number, spacing?: number, keyframes?: boolean }) {
    this.from = from;
    this.to = to;
    this.spacing = spacing;
    this.keyframes = keyframes;
    this.readTo = from;
  }

  get covered(): TimeRange | undefined {
    if (this.state === 'waiting') return undefined;
    return { from: this.from, to: this.state === 'done' ? this.to : this.readTo };
  }

  add(frame: FilmstripFrame) {
    this.frames.push({ time: frame.time, url: frame.url });
    this.readTo = Math.max(this.readTo, frame.time);
  }

  finish() {
    this.state = 'done';
  }

  /** Stops it where it got to; what it made so far stays. */
  stop() {
    this.abortController.abort();
    if (this.state === 'done') return;
    this.state = 'done';
    this.to = this.readTo;
  }
}

/** Stretches of the default strip made at a time. */
const concurrency = 2;
/** At most this many denser frames are kept (a few windows' worth); the oldest windows go first. */
export const maxDetailFrames = 600;
/** Zoom and scroll settle for this long before denser frames are made. */
export const detailDelayMs = 200;

/** Set once an FFmpeg turned out not to filter packets before decoding (a custom one older than 7). */
let packetFilterUnsupported = false;

/**
 * The filmstrip of one open recording: makes the default strip (stretches in view first), denser frames for a
 * zoomed-in view, and frees them. Frames are blob URLs; every one is revoked once it's no longer used, and all
 * of them on dispose.
 */
export default class FilmstripSession {
  private readonly options: FilmstripSessionOptions;

  private readonly stretches: FilmPass[];

  private detail: FilmPass[] = [];

  private aspect: number | undefined;

  private view: FilmstripView | undefined;

  private detailTimer: ReturnType<typeof setTimeout> | undefined;

  private disposed = false;

  /**
   * A long window's keyframes turned out to be no more than the default strip had there: it has every keyframe,
   * even though its frames' spacing didn't show it (hasEveryKeyframe).
   */
  private keyframesFoundInStrip = false;

  /** No longer shown: to be revoked once the timeline has stopped using them (takeRetired). */
  private retired: string[] = [];

  private cached: FilmstripSnapshot | undefined;

  constructor(options: FilmstripSessionOptions) {
    this.options = options;
    this.stretches = getFilmstripChunks(options.duration).map(({ from, length }) => new FilmPass({ from, to: from + length }));
  }

  get done() {
    return this.stretches.every((stretch) => stretch.state === 'done');
  }

  start() {
    for (let i = 0; i < concurrency; i += 1) this.startNextStretch();
  }

  /** What the timeline shows: stretches in view are made first, and zoomed in, denser frames once it settles. */
  setView(view: FilmstripView) {
    this.view = view;
    clearTimeout(this.detailTimer);
    if (this.disposed) return;
    this.detailTimer = setTimeout(() => this.updateDetail(), detailDelayMs);
  }

  snapshot(): FilmstripSnapshot {
    const passes = [...this.stretches, ...this.detail];
    this.cached ??= {
      frames: passes.flatMap((pass) => pass.frames).sort((a, b) => a.time - b.time),
      covered: mergeRanges(passes.flatMap((pass) => pass.covered ?? [])),
      aspect: this.aspect,
      done: this.done,
    };
    return this.cached;
  }

  /** Frames dropped since the last call; revoke them once the timeline has re-rendered without them. */
  takeRetired() {
    const { retired } = this;
    this.retired = [];
    return retired;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.detailTimer);
    const passes = [...this.stretches, ...this.detail];
    passes.forEach((pass) => pass.abortController.abort());
    passes.flatMap((pass) => pass.frames).forEach((frame) => this.options.revoke(frame.url));
    this.retired.forEach((url) => this.options.revoke(url));
    this.stretches.forEach((pass) => pass.frames.splice(0));
    this.detail = [];
    this.retired = [];
    this.cached = undefined;
  }

  private changed() {
    this.cached = undefined;
    if (!this.disposed) this.options.onChange();
  }

  /** Runs `args` for `pass`: the number of frames, or whether FFmpeg failed or was stopped. */
  private async runPass(pass: FilmPass, args: string[]): Promise<number | 'failed' | 'stopped'> {
    const { signal } = pass.abortController;
    try {
      return await this.options.run({
        args,
        timeOffset: this.options.timeOffset,
        signal,
        onFrame: (frame) => {
          // A frame of a pass that was stopped is already off the timeline's list.
          if (signal.aborted) {
            this.options.revoke(frame.url);
            return;
          }
          pass.add(frame);
          this.aspect ??= frame.aspect;
          this.changed();
        },
      });
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return 'stopped';
      console.warn('Filmstrip pass failed', err);
      return 'failed';
    }
  }

  private startNextStretch() {
    const waiting = this.stretches.filter((stretch) => stretch.state === 'waiting');
    if (this.disposed || waiting.length === 0) return;
    // The stretch at the start of the view first, then on from there (so, at Fit, left to right).
    const start = this.view?.from ?? 0;
    const distance = (pass: FilmPass) => (start < pass.from ? pass.from - start : Math.max(0, start - pass.to));
    const next = waiting.reduce((best, pass) => (distance(pass) < distance(best) ? pass : best));
    next.state = 'running';
    this.runStretch(next).then((result) => {
      if (typeof result === 'number') {
        next.finish();
      } else {
        // Cut short (FFmpeg failed, or the app's Abort button stopped it): it covers only what it read, so the
        // last frame isn't shown over the rest.
        const end = next.to;
        next.stop();
        // The session stops its own stretches only when it's disposed: this was the Abort button, so the rest is
        // made again.
        if (result === 'stopped' && !this.disposed && next.to < end) this.stretches.push(new FilmPass({ from: next.to, to: end }));
      }
      this.changed();
      if (this.done) this.updateDetail();
      else this.startNextStretch();
    });
  }

  private async runStretch(stretch: FilmPass) {
    const { filePath, duration, frameHeight } = this.options;
    const params = { filePath, from: stretch.from, length: stretch.to - stretch.from, interval: getFilmstripInterval(duration), height: frameHeight };
    if (packetFilterUnsupported) return this.runPass(stretch, getFilmstripFallbackArgs(params));
    const result = await this.runPass(stretch, getFilmstripArgs(params));
    if (result === 'stopped' || (typeof result === 'number' && result > 0)) return result;
    // Nothing came: maybe this FFmpeg can't pick packets before decoding, or the packets have no times to pick by.
    const fallback = await this.runPass(stretch, getFilmstripFallbackArgs(params));
    // FFmpeg refused the first way and the older one works: use that from now on.
    if (result === 'failed' && typeof fallback === 'number' && fallback > 0) packetFilterUnsupported = true;
    return fallback;
  }

  private get baseFrames() {
    return this.stretches.flatMap((pass) => pass.frames);
  }

  private updateDetail() {
    const { view } = this;
    if (this.disposed || view == null || !this.done) return;
    const keyframesInStrip = this.keyframesFoundInStrip
      || hasEveryKeyframe(this.stretches.map((pass) => pass.frames), getFilmstripInterval(this.options.duration));
    const wanted = getDetailRequest({ view, baseFrames: this.baseFrames, duration: this.options.duration, keyframesInStrip });
    if (wanted == null) {
      // Zoomed back out: the default strip is enough again.
      if (this.detail.length > 0) {
        this.retireDetail(this.detail);
        this.changed();
      }
      return;
    }
    if (this.detail.some((pass) => servesView(pass, view, wanted))) return;
    // A window still being made that's no longer in view stops where it got to.
    this.detail.forEach((pass) => pass.stop());
    this.retireDetail(this.detail.filter((pass) => pass.to <= pass.from));
    const pass = new FilmPass(wanted);
    pass.state = 'running';
    this.detail.push(pass);
    this.trimDetail();
    this.runDetail(pass);
  }

  private async runDetail(pass: FilmPass) {
    const { filePath, frameHeight } = this.options;
    const params = { filePath, from: pass.from, length: pass.to - pass.from, height: frameHeight };
    const getKeyframeArgs = packetFilterUnsupported ? getFilmstripFallbackArgs : getFilmstripArgs;
    // On its own (the recording has opened), so it can skip from keyframe to keyframe.
    const args = pass.keyframes ? getKeyframeArgs({ ...params, interval: pass.spacing, keyframesOnly: true }) : getFilmstripDetailArgs({ ...params, spacing: pass.spacing });
    const result = await this.runPass(pass, args);
    if (pass.abortController.signal.aborted) return;
    if (pass.keyframes && typeof result === 'number' && result <= countFramesBetween(this.baseFrames, pass.from, pass.to) * 1.25) {
      // The strip had (nearly) all of them already: from now on, decode every frame instead.
      this.keyframesFoundInStrip = true;
      this.retireDetail([pass]);
      this.changed();
      this.updateDetail();
      return;
    }
    // Cut short: it covers what it made, so a later look at the rest asks again.
    if (typeof result === 'number') pass.finish();
    else pass.stop();
    this.changed();
  }

  /** Keeps the denser frames to maxDetailFrames, dropping the oldest windows (never the newest). */
  private trimDetail() {
    const size = (pass: FilmPass) => Math.max(pass.frames.length, (pass.to - pass.from) / pass.spacing);
    let total = this.detail.reduce((sum, pass) => sum + size(pass), 0);
    const dropped: FilmPass[] = [];
    while (total > maxDetailFrames && this.detail.length - dropped.length > 1) {
      const oldest = this.detail[dropped.length]!;
      total -= size(oldest);
      dropped.push(oldest);
    }
    this.retireDetail(dropped);
  }

  private retireDetail(passes: FilmPass[]) {
    passes.forEach((pass) => {
      pass.abortController.abort();
      this.retired.push(...pass.frames.map((frame) => frame.url));
    });
    this.detail = this.detail.filter((pass) => !passes.includes(pass));
  }
}
