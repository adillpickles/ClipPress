import { describe, expect, it } from 'vitest';

import runSizeLimitedAttempts from './sizeLimitedAttempts';
import { planSizeLimitedEncode } from './sizeLimitedPlanner';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { SizeLimitedRetryStep } from './sizeLimitedTypes';

const strategy = resolveSizeLimitedStrategy({
  controlMode: 'simple',
  preset: 'quality',
  advancedEncoder: 'av1_cpu',
  advancedTwoPass: false,
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
  capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true },
});
const plan = planSizeLimitedEncode({ targetSizeMb: 10, duration: 30, hasAudio: true, strategy });

const cancel = () => Object.assign(new Error('User canceled'), { name: 'AbortError' });

/** A fake disk and encoder: `sizes` gives each attempt's output size, or an error to throw. */
function createRun(sizes: (number | Error)[]) {
  const files = new Set<string>();
  const attempts: number[] = [];
  const run = () => runSizeLimitedAttempts({
    plan,
    strategy,
    buildAttempt: async (attempt: SizeLimitedRetryStep) => ({ outPath: `attempt${attempt.attemptNumber}.mp4`, pass1OutPath: `attempt${attempt.attemptNumber}.pass1.mp4` }),
    runAttempt: async (attemptFiles, attempt) => {
      attempts.push(attempt.attemptNumber);
      files.add(attemptFiles.pass1OutPath);
      const size = sizes[attempt.attemptNumber - 1];
      if (size instanceof Error) {
        files.add(attemptFiles.outPath); // a partial file
        throw size;
      }
      files.add(attemptFiles.outPath);
    },
    cleanUpAttempt: async (attemptFiles) => { files.delete(attemptFiles.pass1OutPath); },
    readFileSize: async (path) => {
      const size = sizes[Number(/attempt(\d+)/.exec(path)![1]) - 1];
      if (typeof size !== 'number') throw new Error('no file');
      return size;
    },
    deleteIfExists: async (path) => { files.delete(path); },
    isCancellation: (error) => error instanceof Error && error.name === 'AbortError',
  });
  return { run, files, attempts };
}

const undershoot = Math.floor(plan.undershootRetryBelowBytes * 0.5);

describe('runSizeLimitedAttempts', () => {
  it('tops up a result that used too little of the budget, keeping the larger one', async () => {
    const { run, files, attempts } = createRun([undershoot, plan.targetZoneMaxBytes - 1]);
    const result = await run();
    expect(attempts).toEqual([1, 2]);
    expect(result).toMatchObject({ path: 'attempt2.mp4', metTarget: true, created: true });
    expect([...files]).toEqual(['attempt2.mp4']);
  });

  it('keeps the earlier result when a top-up fails', async () => {
    const { run, files } = createRun([undershoot, new Error('encoder crashed')]);
    const result = await run();
    expect(result).toMatchObject({ path: 'attempt1.mp4', metTarget: true });
    expect([...files]).toEqual(['attempt1.mp4']);
  });

  it('reports a cancel during a top-up as a cancel and leaves no files behind', async () => {
    const canceled = cancel();
    const { run, files, attempts } = createRun([undershoot, canceled]);
    await expect(run()).rejects.toBe(canceled);
    expect(attempts).toEqual([1, 2]);
    expect([...files]).toEqual([]);
  });

  it('reports a cancel during the first attempt as a cancel', async () => {
    const canceled = cancel();
    const { run, files } = createRun([canceled]);
    await expect(run()).rejects.toBe(canceled);
    expect([...files]).toEqual([]);
  });

  it('removes an over-cap attempt when a later attempt fails', async () => {
    const failure = new Error('encoder crashed');
    const { run, files, attempts } = createRun([plan.hardTargetBytes * 1.2, failure]);
    await expect(run()).rejects.toBe(failure);
    expect(attempts).toEqual([1, 2]);
    expect([...files]).toEqual([]);
  });

  it('fails without leaving the over-cap file when nothing fits', async () => {
    const overCap = plan.hardTargetBytes * 1.5;
    const { run, files } = createRun(Array.from({ length: plan.maxAttempts }, () => overCap));
    await expect(run()).rejects.toThrow();
    expect([...files]).toEqual([]);
  });
});
