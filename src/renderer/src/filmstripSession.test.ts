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
    // Stopped by the Abort button: made again the same way.
    runner.runs[0]!.finish(true, 'AbortError');
    await flush();
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1]!.args).not.toContain('-skip_frame');
    session.dispose();
    // Nothing found: the older way is tried for this stretch only.
    const other = create();
    other.start();
    runner.runs[2]!.finish();
    await flush();
    runner.runs[3]!.frame(0);
    runner.runs[3]!.finish();
    await flush();
    create().start();
    expect(runner.runs[4]!.args).not.toContain('-skip_frame');
  });

  it('shows a stretch cut short only as far as it was read, and makes the rest again after the Abort button', async () => {
    const session = create();
    session.start();
    [0, 1, 2, 3].forEach((t) => runner.runs[0]!.frame(t));
    runner.runs[0]!.finish(true, 'AbortError');
    await flush();
    // Not the last frame over the rest of the recording.
    expect(session.snapshot()).toMatchObject({ done: false, covered: [{ from: 0, to: 3 }] });
    expect(runner.runs).toHaveLength(2);
    const rest = runner.runs[1]!;
    expect(rest.args.slice(rest.args.indexOf('-ss'), rest.args.indexOf('-ss') + 2)).toEqual(['-ss', '3.000']);
    expect(rest.args[rest.args.indexOf('-t') + 1]).toBe('117.000');
    rest.frame(4);
    rest.finish();
    await flush();
    expect(session.snapshot()).toMatchObject({ done: true, covered: [{ from: 0, to: 120 }] });
    expect(session.snapshot().frames.map((f) => f.time)).toEqual([0, 1, 2, 3, 4]);
    session.dispose();

    // Failed: not made again (it would fail again), and covers what it read.
    const failing = create();
    failing.start();
    runner.runs[2]!.frame(0);
    runner.runs[2]!.frame(1);
    runner.runs[2]!.finish(true);
    await flush();
    // The older way, which fails too.
    runner.runs[3]!.finish(true);
    await flush();
    expect(runner.runs).toHaveLength(4);
    expect(failing.snapshot()).toMatchObject({ done: true, covered: [{ from: 0, to: 1 }] });
    failing.dispose();
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

  it('makes a long zoomed-in window of a long recording from its keyframes, and closer in from every frame', async () => {
    vi.useFakeTimers();
    const session = create({ duration: 3600 });
    session.setView({ from: 1800, to: 1856, tileSeconds: 3.1 });
    session.start();
    while (!session.done) {
      runner.runs.filter((run) => !run.finished).forEach((run) => {
        const from = Number(run.args[run.args.indexOf('-ss') + 1] ?? 0);
        for (let t = 0; t < 600; t += 15) run.frame(from + t);
        run.finish();
      });
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(250);
    const keyframes = runner.runs.at(-1)!;
    // The default strip reads straight through (alongside the waveform); a window on its own skips to each keyframe.
    expect(runner.runs[0]!.args).not.toContain('-discard:v');
    expect(keyframes.args).toContain('-discard:v');
    expect(keyframes.args.slice(keyframes.args.indexOf('-ss'), keyframes.args.indexOf('-ss') + 2)).toEqual(['-ss', '1791.600']);
    expect(keyframes.args[keyframes.args.indexOf('-bsf:v') + 1]).toContain('2.000');
    keyframes.frame(1802);
    keyframes.finish();
    await vi.advanceTimersByTimeAsync(0);
    // Within it: nothing more to make.
    const count = runner.runs.length;
    session.setView({ from: 1805, to: 1861, tileSeconds: 3.1 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(count);
    // Closer in: every frame of a short window.
    session.setView({ from: 1820, to: 1834, tileSeconds: 0.78 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(count + 1);
    expect(runner.runs.at(-1)!.args).not.toContain('-discard:v');
    session.dispose();
  });

  /** Makes the default strip of `session`, a frame each `seconds`. */
  const makeStrip = async (session: FilmstripSessionType, seconds: number) => {
    session.start();
    while (!session.done) {
      runner.runs.filter((run) => !run.finished).forEach((run) => {
        const from = run.args.includes('-ss') ? Number(run.args[run.args.indexOf('-ss') + 1]) : 0;
        const length = Number(run.args[run.args.indexOf('-t') + 1]);
        for (let t = 0; t < length; t += seconds) run.frame(from + t);
        run.finish();
      });
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  it('decodes every frame of a longer window when the strip already has every keyframe', async () => {
    vi.useFakeTimers();
    const session = create();
    // OBS's default: a keyframe every 250 frames at 60 fps, so the strip has them all.
    await makeStrip(session, 250 / 60);
    session.setView({ from: 25, to: 55, tileSeconds: 2.3 });
    await vi.advanceTimersByTimeAsync(250);
    const detail = runner.runs.at(-1)!;
    expect(runner.runs).toHaveLength(2);
    expect(detail.args).not.toContain('-discard:v');
    expect(detail.args.join(' ')).toContain('select=');
    expect(detail.args[detail.args.indexOf('-t') + 1]).toBe('39.000');
    session.dispose();
  });

  it('decodes every frame once the keyframes of a window turn out to be in the strip already', async () => {
    vi.useFakeTimers();
    const session = create({ duration: 3600 });
    // Keyframes 15 s apart, as is the strip: its spacing can't show that it has them all.
    await makeStrip(session, 15);
    const count = runner.runs.length;
    session.setView({ from: 1800, to: 1840, tileSeconds: 2.2 });
    await vi.advanceTimersByTimeAsync(250);
    const keyframes = runner.runs.at(-1)!;
    expect(runner.runs).toHaveLength(count + 1);
    expect(keyframes.args).toContain('-discard:v');
    const urls = [keyframes.frame(1800), keyframes.frame(1815), keyframes.frame(1830)];
    keyframes.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.runs).toHaveLength(count + 2);
    const everyFrame = runner.runs.at(-1)!;
    expect(everyFrame.args).not.toContain('-discard:v');
    expect(everyFrame.args.join(' ')).toContain('select=');
    // The keyframes, already in the strip, are let go.
    expect(session.takeRetired().sort()).toEqual(urls.sort());
    everyFrame.finish();
    await vi.advanceTimersByTimeAsync(0);
    // And from then on.
    session.setView({ from: 2400, to: 2440, tileSeconds: 2.2 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs.at(-1)!.args).not.toContain('-discard:v');
    session.dispose();
  });

  /** OBS's default: a keyframe every 250 frames, at 60 fps. */
  const obsKeyframes = 250 / 60;
  /** Finishes a keyframes pass with the keyframes in its window; returns their URLs. */
  const giveKeyframes = (run: Run) => {
    const from = Number(run.args[run.args.indexOf('-ss') + 1]);
    const to = from + Number(run.args[run.args.indexOf('-t') + 1]);
    const urls: string[] = [];
    for (let t = Math.ceil(from / obsKeyframes) * obsKeyframes; t <= to; t += obsKeyframes) urls.push(run.frame(t));
    run.finish();
    return urls;
  };

  it('decodes every frame where a long recording\'s keyframes turn out too far apart for the tiles', async () => {
    vi.useFakeTimers();
    // An hour with OBS's keyframes: the strip has one per 15 s, which doesn't show how far apart they are.
    const session = create({ duration: 3600 });
    await makeStrip(session, 15);
    const count = runner.runs.length;
    // A 39 s window, a tile per 1.9 s (121x on an 1100 px timeline): its keyframes first, quick to read.
    session.setView({ from: 1785, to: 1815, tileSeconds: 1.92 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(count + 1);
    const keyframes = runner.runs.at(-1)!;
    expect(keyframes.args).toContain('-discard:v');
    const urls = giveKeyframes(keyframes);
    await vi.advanceTimersByTimeAsync(0);
    // One per 4.2 s, where the tiles need one per 1.9 s: every frame of the same window, at once.
    expect(runner.runs).toHaveLength(count + 2);
    const everyFrame = runner.runs.at(-1)!;
    expect(everyFrame.args).not.toContain('-discard:v');
    expect(everyFrame.args.join(' ')).toContain('select=');
    expect(everyFrame.args.slice(everyFrame.args.indexOf('-ss'), everyFrame.args.indexOf('-ss') + 2)).toEqual(['-ss', '1780.500']);
    // Its keyframes (more than the strip has there) show meanwhile.
    expect(session.takeRetired()).toEqual([]);
    expect(session.snapshot().frames).toHaveLength(240 + urls.length);
    everyFrame.finish();
    await vi.advanceTimersByTimeAsync(0);
    // From then on, every frame from the start.
    session.setView({ from: 600, to: 640, tileSeconds: 2.5 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(count + 3);
    expect(runner.runs.at(-1)!.args).not.toContain('-discard:v');
    session.dispose();
  });

  it('keeps a long window\'s keyframes while they do, and decodes every frame closer in', async () => {
    vi.useFakeTimers();
    const session = create({ duration: 3600 });
    await makeStrip(session, 15);
    const count = runner.runs.length;
    // 64x: a 73 s window, a tile per 3.6 s; a keyframe per 4.2 s is close enough.
    session.setView({ from: 1772, to: 1828, tileSeconds: 3.6 });
    await vi.advanceTimersByTimeAsync(250);
    giveKeyframes(runner.runs.at(-1)!);
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.runs).toHaveLength(count + 1);
    // 79x: a tile per 2.9 s, a 60 s window. Every frame, without asking for its keyframes first.
    session.setView({ from: 1777, to: 1823, tileSeconds: 2.9 });
    await vi.advanceTimersByTimeAsync(250);
    expect(runner.runs).toHaveLength(count + 2);
    const everyFrame = runner.runs.at(-1)!;
    expect(everyFrame.args).not.toContain('-discard:v');
    expect(everyFrame.args[everyFrame.args.indexOf('-t') + 1]).toBe('59.800');
    everyFrame.finish();
    await vi.advanceTimersByTimeAsync(0);
    // Zoomed back out: all of them let go.
    session.setView({ from: 0, to: 3600, tileSeconds: 230 });
    await vi.advanceTimersByTimeAsync(250);
    expect(session.snapshot().frames).toHaveLength(240);
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
