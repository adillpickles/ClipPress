import { describe, expect, it } from 'vitest';

import { computeBucketPeaks, computePeaks, getPeaksArgs, getPeaksBucketSeconds, getPeaksSampleRate, getPeaksStretches, joinPeaks, peakBetween } from './audioPeaks';

describe('audioPeaks', () => {
  it('keeps the decoded audio small for long recordings', () => {
    expect(getPeaksSampleRate(90)).toBe(4000);
    expect(getPeaksSampleRate(3600)).toBe(417);
    expect(getPeaksSampleRate(36_000)).toBe(200);
    expect(getPeaksBucketSeconds(90)).toBe(0.01);
    expect(getPeaksBucketSeconds(3600)).toBe(0.18);
  });

  it('decodes one audio track to mono 16-bit samples on stdout', () => {
    const args = getPeaksArgs({ filePath: 'a.mp4', streamIndex: 2, sampleRate: 1000 });
    expect(args.slice(args.indexOf('-map'), args.indexOf('-map') + 2)).toEqual(['-map', '0:2']);
    expect(args).toEqual(expect.arrayContaining(['-ac', '1', '-ar', '1000', '-f', 's16le']));
    // Padded to the recording's start, and rectified before the rate drops.
    expect(args[args.indexOf('-af') + 1]).toBe('aresample=async=1:first_pts=0,aformat=channel_layouts=mono,aresample=16000,aeval=exprs=abs(val(0)),aresample=1000');
    expect(getPeaksArgs({ filePath: 'a.mp4', streamIndex: undefined, sampleRate: 1000 })).toContain('0:a:0');
  });

  it('keeps the loudest sample per bucket, normalised', () => {
    const samples = new Int16Array([0, 100, -200, 50, 1000, -2000, 0, 0]);
    const { peaks, bucketSeconds } = computePeaks(samples, 4, 0.5);
    expect(bucketSeconds).toBe(0.5);
    expect([...peaks]).toEqual([0.05, 0.1, 1, 0].map((v) => Math.fround(v)));
  });

  it('handles silence', () => {
    const { peaks } = computePeaks(new Int16Array(10), 10, 0.1);
    expect([...peaks].every((v) => v === 0)).toBe(true);
  });

  it('does long recordings in stretches that start on a bucket', () => {
    expect(getPeaksStretches(90, 0.01)).toEqual([{ from: 0, length: undefined }]);
    const stretches = getPeaksStretches(3601, 0.18);
    expect(stretches).toHaveLength(4);
    stretches.forEach(({ from }) => expect(Math.abs(Math.round(from / 0.18) - from / 0.18)).toBeLessThan(1e-9));
    // Back to back, and the last one runs to the end.
    stretches.slice(1).forEach(({ from }, i) => expect(stretches[i]!.from + stretches[i]!.length!).toBeCloseTo(from));
    expect(stretches.at(-1)!.length).toBeUndefined();
    const args = getPeaksArgs({ filePath: 'a.mp4', streamIndex: 1, sampleRate: 417, from: 900, length: 900 });
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 4)).toEqual(['-ss', '900.000', '-t', '900.000']);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });

  it('joins stretches into one waveform, relative to the loudest so far', () => {
    const first = computeBucketPeaks(new Int16Array([0, 100, -200, 50]), 2);
    expect([...first]).toEqual([100, 200]);
    const partial = joinPeaks([{ offset: 2, peaks: new Float32Array([400]) }], 0.5);
    expect([...partial.peaks]).toEqual([0, 0, 1]);
    const whole = joinPeaks([{ offset: 2, peaks: new Float32Array([400]) }, { offset: 0, peaks: first }], 0.5);
    expect([...whole.peaks]).toEqual([0.25, 0.5, 1]);
    expect(whole.bucketSeconds).toBe(0.5);
  });

  it('finds the loudest peak in a time range', () => {
    const p = computePeaks(new Int16Array([10, 0, 0, 0, 100, 0, 0, 50]), 2, 0.5);
    expect(peakBetween(p, 0, 1)).toBeCloseTo(0.1);
    expect(peakBetween(p, 2, 4)).toBeCloseTo(1);
    expect(peakBetween(p, 3.5, 4)).toBeCloseTo(0.5);
  });
});
