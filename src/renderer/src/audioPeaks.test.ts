import { describe, expect, it } from 'vitest';

import { computePeaks, getPeaksArgs, getPeaksBucketSeconds, getPeaksSampleRate, peakBetween } from './audioPeaks';

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

  it('finds the loudest peak in a time range', () => {
    const p = computePeaks(new Int16Array([10, 0, 0, 0, 100, 0, 0, 50]), 2, 0.5);
    expect(peakBetween(p, 0, 1)).toBeCloseTo(0.1);
    expect(peakBetween(p, 2, 4)).toBeCloseTo(1);
    expect(peakBetween(p, 3.5, 4)).toBeCloseTo(0.5);
  });
});
