/**
 * The audio track's waveform: one FFmpeg pass decodes the audio to low-rate mono samples, reduced here to a
 * peak per small time bucket as they arrive (so it fills in while it's made). In memory for the open recording
 * only.
 */

export interface AudioPeaks {
  /** 0..1, the loudest sample in each bucket relative to the loudest in the recording (so far, while it's made). */
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

/** The rate the sound is rectified at: keeps everything up to 8 kHz, so high-pitched sounds still show. */
const envelopeSampleRate = 16_000;

/**
 * Raw samples of the sound's loudness, starting at the recording's start:
 * - `aresample=async=1:first_pts=0` pads with silence where the track starts late or has gaps, since raw
 *   samples carry no timestamps;
 * - taking the absolute value before going down to the low output rate keeps the loudness of sounds above
 *   that rate's range, which resampling on its own would filter away.
 * One pass straight through the file: while a recording opens the filmstrip reads it the same way, which on a
 * hard disk costs about one read. Stretches decoded at once were quicker from the disk cache, but much slower
 * from a hard disk (notes/beta6-ux/perf/qa-filmstrip.md).
 */
export function getPeaksArgs({ filePath, streamIndex, sampleRate }: { filePath: string, streamIndex: number | undefined, sampleRate: number }) {
  return [
    '-hide_banner',
    '-nostats',
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

/**
 * Reduces FFmpeg's samples (16-bit little-endian, from getPeaksArgs) to the loudest one per bucket as they arrive,
 * in chunks of any size.
 */
export class AudioPeaksReader {
  private readonly perBucket: number;

  private readonly bucketSeconds: number;

  /** The loudest sample of each bucket so far; the last one may still be filling. */
  private loudest = new Float32Array(1024);

  private bucket = 0;

  private inBucket = 0;

  /** The first byte of a sample whose second byte comes with the next chunk. */
  private leftover: number | undefined;

  constructor(sampleRate: number, bucketSeconds: number) {
    this.perBucket = Math.max(1, Math.round(sampleRate * bucketSeconds));
    this.bucketSeconds = this.perBucket / sampleRate;
  }

  push(bytes: Uint8Array) {
    let i = 0;
    if (this.leftover != null && bytes.length > 0) {
      this.add(this.leftover + bytes[0]! * 256);
      this.leftover = undefined;
      i = 1;
    }
    for (; i + 1 < bytes.length; i += 2) this.add(bytes[i]! + bytes[i + 1]! * 256);
    if (i < bytes.length) this.leftover = bytes[i];
  }

  /** The waveform so far, relative to its loudest sample. */
  get peaks(): AudioPeaks {
    const peaks = this.loudest.slice(0, this.bucket + (this.inBucket > 0 ? 1 : 0));
    const loudest = peaks.reduce((max, v) => Math.max(max, v), 0);
    if (loudest > 0) {
      for (let b = 0; b < peaks.length; b += 1) peaks[b] = peaks[b]! / loudest;
    }
    return { peaks, bucketSeconds: this.bucketSeconds };
  }

  /** `word`: a sample's two bytes as an unsigned number. */
  private add(word: number) {
    const value = Math.abs(word >= 0x8000 ? word - 0x10000 : word);
    if (this.bucket >= this.loudest.length) {
      const grown = new Float32Array(this.loudest.length * 2);
      grown.set(this.loudest);
      this.loudest = grown;
    }
    if (value > this.loudest[this.bucket]!) this.loudest[this.bucket] = value;
    this.inBucket += 1;
    if (this.inBucket === this.perBucket) {
      this.bucket += 1;
      this.inBucket = 0;
    }
  }
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
