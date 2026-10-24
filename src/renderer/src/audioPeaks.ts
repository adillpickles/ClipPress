/**
 * The audio track's waveform: FFmpeg decodes the audio to low-rate mono samples, reduced here to a peak per small
 * time bucket. One pass, or for long recordings a few stretches at once (decoding audio uses one core), shown as
 * each is done. In memory for the open recording only.
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

/** Recordings longer than this are done in stretches, this many at once. */
const stretchAbove = 600;
export const peaksStretchCount = 4;

/**
 * The stretches to decode, each starting on a bucket (`bucketSeconds`, see computeBucketPeaks); the last one runs
 * to the end, wherever that turns out to be.
 */
export function getPeaksStretches(duration: number, bucketSeconds: number) {
  const count = duration > stretchAbove ? peaksStretchCount : 1;
  const starts = Array.from({ length: count }, (_, i) => Math.round((duration * i) / count / bucketSeconds) * bucketSeconds);
  return starts.map((from, i) => ({ from, length: i < count - 1 ? starts[i + 1]! - from : undefined }));
}

/** The rate the sound is rectified at: keeps everything up to 8 kHz, so high-pitched sounds still show. */
const envelopeSampleRate = 16_000;

/**
 * Raw samples of the sound's loudness, starting at the recording's start:
 * - `aresample=async=1:first_pts=0` pads with silence where the track starts late or has gaps, since raw
 *   samples carry no timestamps;
 * - taking the absolute value before going down to the low output rate keeps the loudness of sounds above
 *   that rate's range, which resampling on its own would filter away.
 */
export function getPeaksArgs({ filePath, streamIndex, sampleRate, from = 0, length }: {
  filePath: string,
  streamIndex: number | undefined,
  sampleRate: number,
  from?: number,
  length?: number | undefined,
}) {
  return [
    '-hide_banner',
    '-nostats',
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    ...(length != null ? ['-t', length.toFixed(3)] : []),
    '-i', filePath,
    '-map', streamIndex != null ? `0:${streamIndex}` : '0:a:0',
    '-vn', '-sn', '-dn',
    '-af', `aresample=async=1:first_pts=0,aformat=channel_layouts=mono,aresample=${envelopeSampleRate},aeval=exprs=abs(val(0)),aresample=${sampleRate}`,
    '-ac', '1',
    '-ar', String(sampleRate),
    '-c:a', 'pcm_s16le',
    '-f', 's16le',
    '-',
  ];
}

export function getPeaksPerBucket(sampleRate: number, bucketSeconds: number) {
  return Math.max(1, Math.round(sampleRate * bucketSeconds));
}

/** The loudest sample in each bucket of `perBucket` samples. */
export function computeBucketPeaks(samples: Int16Array, perBucket: number) {
  const count = Math.ceil(samples.length / perBucket);
  const peaks = new Float32Array(count);
  for (let b = 0; b < count; b += 1) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * perBucket);
    for (let i = b * perBucket; i < end; i += 1) {
      const v = Math.abs(samples[i]!);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}

/** Stretches' bucket peaks (each starting at bucket `offset`) as one waveform, relative to the loudest so far. */
export function joinPeaks(parts: readonly { offset: number, peaks: Float32Array }[], bucketSeconds: number): AudioPeaks {
  const peaks = new Float32Array(parts.reduce((length, part) => Math.max(length, part.offset + part.peaks.length), 0));
  parts.forEach((part) => peaks.set(part.peaks, part.offset));
  const loudest = peaks.reduce((max, v) => Math.max(max, v), 0);
  if (loudest > 0) {
    for (let b = 0; b < peaks.length; b += 1) peaks[b] = peaks[b]! / loudest;
  }
  return { peaks, bucketSeconds };
}

export function computePeaks(samples: Int16Array, sampleRate: number, bucketSeconds: number): AudioPeaks {
  const perBucket = getPeaksPerBucket(sampleRate, bucketSeconds);
  return joinPeaks([{ offset: 0, peaks: computeBucketPeaks(samples, perBucket) }], perBucket / sampleRate);
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
