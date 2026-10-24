import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FilmstripRunner, FilmstripSessionOptions } from './filmstripSession';
import type FilmstripSessionType from './filmstripSession';

interface Run {
  args: string[],
  signal: AbortSignal,
  finished: boolean,
  /** Hands over a frame; returns its URL. */
  frame: (time: number) => string,
  finish: (fail?: boolean, errorName?: string) => void,
}

let urlCount = 0;

/** A runner whose passes the test drives: frames and the end come when it says. */
function createRunner() {
  const runs: Run[] = [];
  const run: FilmstripRunner = ({ args, signal, onFrame }) => new Promise((resolve, reject) => {
    let count = 0;
    const entry: Run = {
      args,
      signal,
      finished: false,
      frame: (time) => {
        count += 1;
        urlCount += 1;
        const url = `blob:${urlCount}`;
        onFrame({ time, url, aspect: 4 / 3 });
        return url;
      },
      finish: (fail, errorName) => {
        entry.finished = true;
        if (fail) reject(Object.assign(new Error('ffmpeg failed'), errorName != null ? { name: errorName } : {}));
        else resolve(count);
      },
    };
    runs.push(entry);
  });
  return { runs, run };
}

const flush = () => new Promise((resolve) => { setImmediate(resolve); });

describe('FilmstripSession', () => {
  let FilmstripSession: typeof FilmstripSessionType;
  let revoked: string[];
  let runner: ReturnType<typeof createRunner>;

  beforeEach(async () => {
    // A fresh module each time: it remembers an FFmpeg that can't pick packets.
    vi.resetModules();
    FilmstripSession = (await import('./filmstripSession')).default;
    revoked = [];
    runner = createRunner();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const create = (options: Partial<FilmstripSessionOptions> = {}) => new FilmstripSession({
    filePath: 'a.mp4',
    duration: 120,
    timeOffset: 0,
    frameHeight: 96,
    run: runner.run,
    revoke: (url) => revoked.push(url),
    onChange: () => undefined,
    ...options,
  });

  it('shows frames as they come, in time order, and what has been read', async () => {
    const session = create();
    session.start();
    expect(runner.runs).toHaveLength(1);
    const [run] = runner.runs;
    run!.frame(0);
    run!.frame(1);
    expect(session.snapshot()).toMatchObject({ aspect: 4 / 3, done: false, covered: [{ from: 0, to: 1 }] });
    expect(session.snapshot().frames.map((f) => f.time)).toEqual([0, 1]);
    run!.frame(2);
    run!.finish();
    await flush();
    expect(session.snapshot()).toMatchObject({ done: true, covered: [{ from: 0, to: 120 }] });
    expect(session.snapshot().frames).toHaveLength(3);
  });

  it('does long recordings two stretches at a time, the one in view first', async () => {
    const session = create({ duration: 3000 });
    session.setView({ from: 2500, to: 2600, tileSeconds: 6 });
    session.start();
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs.map((r) => r.args[r.args.indexOf('-ss') + 1])).toEqual(['2400.000', '1800.000']);
    // Scrolled back to the start: that next.
    session.setView({ from: 0, to: 100, tileSeconds: 6 });
    runner.runs[0]!.frame(2400);
    runner.runs[0]!.finish();
    await flush();
    expect(runner.runs[2]!.args).not.toContain('-ss');
    session.dispose();

    // At Fit: left to right.
    const fit = create({ duration: 3000 });
    fit.setView({ from: 0, to: 3000, tileSeconds: 180 });
    fit.start();
    expect(runner.runs.slice(3).map((r) => (r.args.includes('-ss') ? r.args[r.args.indexOf('-ss') + 1] : '0'))).toEqual(['0', '600.000']);
    fit.dispose();
  });

  it('falls back for an FFmpeg that cannot pick packets, from then on', async () => {
    const session = create();
    session.start();
    runner.runs[0]!.finish(true);
    await flush();
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1]!.args).toContain('-skip_frame');
    runner.runs[1]!.frame(0);
    runner.runs[1]!.finish();
    await flush();
    expect(session.snapshot().done).toBe(true);
    create().start();
    expect(runner.runs[2]!.args).toContain('-skip_frame');
  });

  it('only gives up on picking packets when FFmpeg refuses, not when it was stopped or found nothing', async () => {
    const session = create();
    session.start();
    // Stopped by the Abort button: no second try.
    runner.runs[0]!.finish(true, 'AbortError');
    await flush();
    expect(runner.runs).toHaveLength(1);
    expect(session.done).toBe(true);
    // Nothing found: the older way is tried for this stretch only.
    const other = create();
    other.start();
    runner.runs[1]!.finish();
    await flush();
    runner.runs[2]!.frame(0);
    runner.runs[2]!.finish();
    await flush();
    create().start();
    expect(runner.runs[3]!.args).not.toContain('-skip_frame');
  });

  it('makes denser frames once zoomed in and settled, and drops them when zoomed out', async () => {
    vi.useFakeTimers();
    const session = create();
    session.start();
    for (let t = 0; t < 120; t += 1) runner.runs[0]!.frame(t);
    runner.runs[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.done).toBe(true);

    session.setView({ from: 60, to: 64, tileSeconds: 0.24 });
    await vi.advanceTimersByTimeAsync(100);
    expect(runner.runs).toHaveLength(1);
    // Still moving: only the last view counts.
    session.setView({ from: 60, to: 64, tileSeconds: 0.24 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(2);
    const detail = runner.runs[1]!;
    expect(detail.args.slice(detail.args.indexOf('-ss'), detail.args.indexOf('-ss') + 2)).toEqual(['-ss', '59.400']);
    const detailUrls = [detail.frame(60.125), detail.frame(60.25)];
    expect(session.snapshot().frames).toHaveLength(122);

    // A little scroll stays within what's being made.
    session.setView({ from: 60.3, to: 64.3, tileSeconds: 0.24 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(2);

    // Scrolled on: that window stops, and its frames so far stay.
    session.setView({ from: 80, to: 84, tileSeconds: 0.24 });
    await vi.advanceTimersByTimeAsync(250);
    expect(detail.signal.aborted).toBe(true);
    expect(runner.runs).toHaveLength(3);
    detailUrls.push(runner.runs[2]!.frame(80.125));
    runner.runs[2]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.snapshot().frames).toHaveLength(123);

    // Zoomed out: back to the default strip, the denser frames are let go (once the timeline has moved on).
    session.setView({ from: 0, to: 120, tileSeconds: 7 });
    await vi.advanceTimersByTimeAsync(250);
    expect(session.snapshot().frames).toHaveLength(120);
    expect(session.takeRetired().sort()).toEqual(detailUrls.sort());
    expect(revoked).toEqual([]);
    session.dispose();
  });

  it('keeps the denser frames bounded', async () => {
    vi.useFakeTimers();
    const session = create({ duration: 3600 });
    session.start();
    while (!session.done) {
      runner.runs.filter((run) => !run.finished).forEach((run) => {
        const from = Number(run.args[run.args.indexOf('-ss') + 1] ?? 0);
        for (let t = 0; t < 600; t += 15) run.frame(from + t);
        run.finish();
      });
      await vi.advanceTimersByTimeAsync(0);
    }
    const baseCount = session.snapshot().frames.length;
    // Windows of 30 frames each, far apart.
    for (let i = 0; i < 30; i += 1) {
      session.setView({ from: i * 100, to: i * 100 + 4, tileSeconds: 0.24 });
      await vi.advanceTimersByTimeAsync(250);
      const run = runner.runs.at(-1)!;
      for (let f = 0; f < 30; f += 1) run.frame(i * 100 + f * 0.15);
      run.finish();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(session.snapshot().frames.length - baseCount).toBeLessThanOrEqual(600);
    expect(session.takeRetired().length).toBeGreaterThan(0);
    session.dispose();
  });

  it('frees everything when the recording closes', async () => {
    vi.useFakeTimers();
    const session = create();
    session.start();
    const urls = [runner.runs[0]!.frame(0), runner.runs[0]!.frame(1)];
    session.dispose();
    expect(runner.runs[0]!.signal.aborted).toBe(true);
    expect(revoked).toEqual(urls);
    // A frame still on its way is freed at once.
    runner.runs[0]!.frame(2);
    expect(revoked).toHaveLength(3);
    expect(session.snapshot().frames).toEqual([]);
  });
});
