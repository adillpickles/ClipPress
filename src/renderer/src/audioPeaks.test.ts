import { describe, expect, it } from 'vitest';

import { AudioPeaksReader, getPeaksArgs, getPeaksBucketSeconds, getPeaksSampleRate, peakBetween } from './audioPeaks';

/** 16-bit little-endian, as FFmpeg sends them. */
const toBytes = (samples: number[]) => new Uint8Array(new Int16Array(samples).buffer);

function computePeaks(samples: number[], sampleRate: number, bucketSeconds: number) {
  const reader = new AudioPeaksReader(sampleRate, bucketSeconds);
  reader.push(toBytes(samples));
  return reader.peaks;
}

describe('audioPeaks', () => {
  it('keeps the decoded audio small for long recordings', () => {
    expect(getPeaksSampleRate(90)).toBe(4000);
    expect(getPeaksSampleRate(3600)).toBe(417);
    expect(getPeaksSampleRate(36_000)).toBe(200);
    expect(getPeaksBucketSeconds(90)).toBe(0.01);
    expect(getPeaksBucketSeconds(3600)).toBe(0.18);
  });

  it('decodes one audio track to mono 16-bit samples on stdout, in one pass', () => {
    const args = getPeaksArgs({ filePath: 'a.mp4', streamIndex: 2, sampleRate: 1000 });
    expect(args.slice(args.indexOf('-map'), args.indexOf('-map') + 2)).toEqual(['-map', '0:2']);
    expect(args).toEqual(expect.arrayContaining(['-ac', '1', '-ar', '1000', '-f', 's16le']));
    expect(args).not.toContain('-ss');
    // Padded to the recording's start, and rectified before the rate drops.
    expect(args[args.indexOf('-af') + 1]).toBe('aresample=async=1:first_pts=0,aformat=channel_layouts=mono,aresample=16000,aeval=exprs=abs(val(0)),aresample=1000');
    expect(getPeaksArgs({ filePath: 'a.mp4', streamIndex: undefined, sampleRate: 1000 })).toContain('0:a:0');
  });

  it('keeps the loudest sample per bucket, normalised', () => {
    const { peaks, bucketSeconds } = computePeaks([0, 100, -200, 50, 1000, -2000, 0, 0], 4, 0.5);
    expect(bucketSeconds).toBe(0.5);
    expect([...peaks]).toEqual([0.05, 0.1, 1, 0].map((v) => Math.fround(v)));
    expect([...computePeaks([-32768, 16384], 1, 1).peaks]).toEqual([1, 0.5]);
  });

  it('handles silence', () => {
    const { peaks } = computePeaks(Array.from({ length: 10 }, () => 0), 10, 0.1);
    expect(peaks).toHaveLength(10);
    expect([...peaks].every((v) => v === 0)).toBe(true);
  });

  it('fills in as the samples arrive, however they are split, relative to the loudest so far', () => {
    const bytes = toBytes([0, 100, -200, 50, 400, 0, 7]);
    const reader = new AudioPeaksReader(2, 1);
    expect(reader.peaks.peaks).toHaveLength(0);
    // Split mid-sample.
    reader.push(bytes.subarray(0, 3));
    expect([...reader.peaks.peaks]).toEqual([0]);
    reader.push(bytes.subarray(3, 8));
    expect([...reader.peaks.peaks]).toEqual([0.5, 1]);
    // A louder sound later scales what came before.
    reader.push(bytes.subarray(8, 13));
    expect([...reader.peaks.peaks]).toEqual([0.25, 0.5, 1]);
    reader.push(bytes.subarray(13));
    expect([...reader.peaks.peaks]).toEqual([0.25, 0.5, 1, 7 / 400].map((v) => Math.fround(v)));
    // Many buckets: the store grows.
    const long = new AudioPeaksReader(1, 1);
    long.push(toBytes(Array.from({ length: 5000 }, (_, i) => i % 1000)));
    expect(long.peaks.peaks).toHaveLength(5000);
    expect(long.peaks.peaks[999]).toBe(1);
  });

  it('finds the loudest peak in a time range', () => {
    const p = computePeaks([10, 0, 0, 0, 100, 0, 0, 50], 2, 0.5);
    expect(peakBetween(p, 0, 1)).toBeCloseTo(0.1);
    expect(peakBetween(p, 2, 4)).toBeCloseTo(1);
    expect(peakBetween(p, 3.5, 4)).toBeCloseTo(0.5);
  });
});
