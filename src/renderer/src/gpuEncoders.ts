import type { SizeLimitAdvancedNvencPreset, SizeLimitCodec } from '../../common/types.js';
import type { SizeLimitedEncoderCapabilities, SizeLimitedEncoderName, SizeLimitedHardwareTarget } from './sizeLimitedTypes';

/**
 * Hardware encoders across GPU vendors.
 *
 * The bundled FFmpeg ships NVIDIA (NVENC), AMD (AMF) and Intel (Quick Sync) encoders, and each
 * only needs the graphics driver the user already has, so ClipPress can use any of them without
 * extra downloads. Availability is probed by actually opening the encoder, because a build that
 * lists `av1_nvenc` still fails on an RTX 30-series card (no AV1 encoder) or on AMD hardware.
 *
 * Kept free of `window` and the ffmpeg runner so the benchmark can load it in plain Node.
 */

export type GpuEncoderName = Exclude<SizeLimitedEncoderName, 'libx264' | 'libsvtav1'>;
export type GpuVendor = Exclude<SizeLimitedHardwareTarget, 'cpu'>;
type GpuCapabilityKey = 'h264Nvenc' | 'av1Nvenc' | 'h264Amf' | 'av1Amf' | 'h264Qsv' | 'av1Qsv';

interface GpuEncoderInfo {
  encoder: GpuEncoderName,
  codec: SizeLimitCodec,
  vendor: GpuVendor,
  capability: GpuCapabilityKey,
}

// Preference order: NVENC has the most tuned arguments, then AMD, then Intel. On a laptop with
// an Intel iGPU and a discrete NVIDIA or AMD card this picks the discrete card.
export const gpuEncoders: readonly GpuEncoderInfo[] = [
  { encoder: 'av1_nvenc', codec: 'av1', vendor: 'nvidia', capability: 'av1Nvenc' },
  { encoder: 'av1_amf', codec: 'av1', vendor: 'amd', capability: 'av1Amf' },
  { encoder: 'av1_qsv', codec: 'av1', vendor: 'intel', capability: 'av1Qsv' },
  { encoder: 'h264_nvenc', codec: 'h264', vendor: 'nvidia', capability: 'h264Nvenc' },
  { encoder: 'h264_amf', codec: 'h264', vendor: 'amd', capability: 'h264Amf' },
  { encoder: 'h264_qsv', codec: 'h264', vendor: 'intel', capability: 'h264Qsv' },
];

export function getGpuEncoderInfo(encoder: SizeLimitedEncoderName) {
  return gpuEncoders.find((info) => info.encoder === encoder);
}

export function isGpuEncoderAvailable(capabilities: SizeLimitedEncoderCapabilities, encoder: GpuEncoderName) {
  const info = getGpuEncoderInfo(encoder);
  return info != null && capabilities[info.capability] === true;
}

/** The preferred working GPU encoder for a codec, if any. */
export function pickGpuEncoder(capabilities: SizeLimitedEncoderCapabilities, codec: SizeLimitCodec) {
  return gpuEncoders.find((info) => info.codec === codec && capabilities[info.capability] === true);
}

/**
 * A size-limited export on a CPU with few threads is better served by a GPU H.264 encode than a
 * slow CPU AV1 one. With this many threads SVT-AV1 keeps up well enough to be worth its quality.
 */
export const minCpuThreadsForCpuAv1 = 8;

/** NVENC preset names are the shared vocabulary; AMD and Intel map them to their own scales. */
export function getAmfQualityPreset(encoder: 'av1_amf' | 'h264_amf', preset: SizeLimitAdvancedNvencPreset) {
  const level = Number(preset.slice(1));
  if (level <= 2) return 'speed';
  if (level <= 5) return 'balanced';
  // Only the AV1 encoder has a mode above "quality".
  return encoder === 'av1_amf' && level === 7 ? 'high_quality' : 'quality';
}

const qsvPresets = ['veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const;

export function getQsvPreset(preset: SizeLimitAdvancedNvencPreset) {
  return qsvPresets[Math.min(qsvPresets.length, Math.max(1, Number(preset.slice(1)))) - 1]!;
}

export const gpuVendorLabels: Record<GpuVendor, string> = {
  nvidia: 'NVIDIA',
  amd: 'AMD',
  intel: 'Intel',
};

export const gpuEncoderLabels: Record<SizeLimitedEncoderName, string> = {
  libsvtav1: 'CPU AV1 (SVT-AV1)',
  libx264: 'CPU H.264',
  av1_nvenc: 'NVIDIA AV1',
  h264_nvenc: 'NVIDIA H.264',
  av1_amf: 'AMD AV1',
  h264_amf: 'AMD H.264',
  av1_qsv: 'Intel AV1',
  h264_qsv: 'Intel H.264',
};

/**
 * Hardware decoding for exports.
 *
 * D3D11VA works on NVIDIA, AMD and Intel GPUs alike and hands frames back to system memory, so
 * every CPU filter (crop, speed, text, scaling) keeps working unchanged. Codecs or profiles the
 * GPU cannot decode fall back to software inside FFmpeg.
 *
 * Measured with 1440p60 HEVC and NVENC: a single-input export went from 12.4 s to 7.2 s on 4 CPU
 * threads and 6.8 s to 6.0 s on 8, and was unchanged on 16. A 3-input merge went from 7.8 s to
 * 5.0 s on 4 threads but was 8-25% slower on 8 or more, where several GPU decoders copying frames
 * back costs more than the CPU saves. So merges only decode on the GPU on smaller CPUs.
 *
 * Every input of a merged export gets its own decoder, all open at once, and each holds a pool
 * of GPU frames (about 250 MB for 1440p). Above this many source pixels across inputs we decode
 * on the CPU rather than risk running a smaller card out of memory.
 */
export const maxHardwareDecodePixels = 17_000_000;

export function shouldUseHardwareDecode({ platform, enabled, inputCount, width, height, cpuThreads }: {
  platform: string,
  enabled: boolean,
  inputCount: number,
  width: number | undefined,
  height: number | undefined,
  cpuThreads: number | undefined,
}) {
  if (!enabled || platform !== 'win32' || inputCount < 1) return false;
  if (inputCount > 1 && cpuThreads != null && cpuThreads >= minCpuThreadsForCpuAv1) return false;
  const pixels = (width ?? 0) * (height ?? 0);
  if (!(pixels > 0)) return false;
  return pixels * inputCount <= maxHardwareDecodePixels;
}

/** Input options; place before each video `-i`. */
export function getHardwareDecodeArgs(useHardwareDecode: boolean) {
  return useHardwareDecode ? ['-hwaccel', 'd3d11va'] : [];
}

/**
 * Video arguments for a regular export that has to re-encode (text, speed or crop). These aim
 * for visually lossless quality rather than a size, so each encoder uses its quality mode.
 * Measured on a 30 s 1080p60 clip: NVENC took 5.4 s against 20.1 s for x264 at a similar size.
 */
export function getRegularExportVideoArgs(encoder: GpuEncoderName | undefined) {
  switch (encoder) {
    case 'h264_nvenc': {
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-profile:v', 'high', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-rc-lookahead', '20', '-spatial-aq', '1', '-temporal-aq', '1', '-pix_fmt', 'yuv420p'];
    }
    case 'h264_amf': {
      return ['-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20', '-qp_b', '22', '-pix_fmt', 'nv12'];
    }
    case 'h264_qsv': {
      return ['-c:v', 'h264_qsv', '-preset', 'slow', '-global_quality', '20', '-pix_fmt', 'nv12'];
    }
    default: {
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'];
    }
  }
}

/**
 * Runs an export, recovering from GPU problems instead of failing it: first by retrying with CPU
 * decoding, then (when `onGpuEncoderFailed` agrees to switch) on the next encoder in line.
 * Errors that are not retryable, such as a user cancel, are rethrown untouched.
 */
export async function runWithGpuFallbacksCore<T>({ hardwareDecode, run, onGpuEncoderFailed, isRetryableFailure, onHardwareDecodeFailed }: {
  hardwareDecode: boolean,
  run: (decodeOnGpu: boolean) => Promise<T>,
  /** Switches to another encoder and resolves true, or resolves false when there is none. */
  onGpuEncoderFailed?: ((error: unknown) => Promise<boolean>) | undefined,
  isRetryableFailure: (error: unknown) => boolean,
  /** Called once a CPU-decoded retry succeeded, which shows the GPU decoder was at fault. */
  onHardwareDecodeFailed: () => void,
}): Promise<T> {
  let useHardwareDecode = hardwareDecode;
  let retriedWithoutHardwareDecode = false;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await run(useHardwareDecode);
      if (retriedWithoutHardwareDecode) onHardwareDecodeFailed();
      return result;
    } catch (error) {
      if (!isRetryableFailure(error)) throw error;
      if (useHardwareDecode) {
        console.warn('Export failed with GPU decoding; retrying with CPU decoding', error);
        useHardwareDecode = false;
        retriedWithoutHardwareDecode = true;
      } else {
        // eslint-disable-next-line no-await-in-loop
        if (onGpuEncoderFailed == null || !(await onGpuEncoderFailed(error))) throw error;
        // The decoder was not the problem after all; give it back for the next encoder.
        useHardwareDecode = hardwareDecode;
        retriedWithoutHardwareDecode = false;
      }
    }
  }
}
