/**
 * The audio track's waveform: one FFmpeg pass decodes the audio to low-rate mono samples, reduced here to a
 * peak per small time bucket. In memory for the open recording only.
 */

export interface AudioPeaks {
  /** 0..1, the loudest sample in each bucket relative to the loudest in the recording. */
  peaks: Float32Array,
  bucketSeconds: number,
}

/** Keeps the decoded samples (and the data passed back from FFmpeg) to a few MB even for long recordings. */
export function getPeaksSampleRate(duration: number) {
  return Math.min(4000, Math.max(200, Math.round(1_500_000 / Math.max(duration, 1))));
}

export function getPeaksBucketSeconds(duration: number) {
  return Math.max(0.01, duration / 20_000);
}

export function getPeaksArgs({ filePath, streamIndex, sampleRate }: { filePath: string, streamIndex: number | undefined, sampleRate: number }) {
  return [
    '-hide_banner',
    '-nostats',
    '-i', filePath,
    '-map', streamIndex != null ? `0:${streamIndex}` : '0:a:0',
    '-vn', '-sn', '-dn',
    '-ac', '1',
    '-ar', String(sampleRate),
    '-c:a', 'pcm_s16le',
    '-f', 's16le',
    '-',
  ];
}

export function computePeaks(samples: Int16Array, sampleRate: number, bucketSeconds: number): AudioPeaks {
  const perBucket = Math.max(1, Math.round(sampleRate * bucketSeconds));
  const count = Math.ceil(samples.length / perBucket);
  const peaks = new Float32Array(count);
  let loudest = 0;
  for (let b = 0; b < count; b += 1) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * perBucket);
    for (let i = b * perBucket; i < end; i += 1) {
      const v = Math.abs(samples[i]!);
      if (v > max) max = v;
    }
    peaks[b] = max;
    if (max > loudest) loudest = max;
  }
  if (loudest > 0) {
    for (let b = 0; b < count; b += 1) peaks[b] = peaks[b]! / loudest;
  }
  return { peaks, bucketSeconds: perBucket / sampleRate };
}

/** The loudest peak between two times (inclusive of the bucket at `from`). */
export function peakBetween({ peaks, bucketSeconds }: AudioPeaks, from: number, to: number) {
  const first = Math.max(0, Math.floor(from / bucketSeconds));
  const last = Math.min(peaks.length - 1, Math.max(first, Math.ceil(to / bucketSeconds) - 1));
  let max = 0;
  for (let i = first; i <= last; i += 1) {
    const v = peaks[i]!;
    if (v > max) max = v;
  }
  return max;
}
