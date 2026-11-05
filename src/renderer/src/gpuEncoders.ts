import type { SizeLimitAdvancedNvencPreset } from '../../common/types.js';
import type { EncoderSizeRules } from './sizeLimitedResolution';
import type { SizeLimitedCodec, SizeLimitedEncoderCapabilities, SizeLimitedEncoderName, SizeLimitedGpuCapability, SizeLimitedHardwareTarget } from './sizeLimitedTypes';

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

export type GpuEncoderName = Exclude<SizeLimitedEncoderName, 'libx264' | 'libx265' | 'libsvtav1'>;
export type GpuVendor = Exclude<SizeLimitedHardwareTarget, 'cpu'>;
type GpuCapabilityKey = SizeLimitedGpuCapability;

interface GpuEncoderInfo {
  encoder: GpuEncoderName,
  codec: SizeLimitedCodec,
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
  // For cards that can't encode AV1 (RTX 20/30, RX 5000/6000, older Intel): about as quick as H.264 and much sharper
  // at the same size. Discord plays HEVC on desktop and the web since 2024.
  { encoder: 'hevc_nvenc', codec: 'hevc', vendor: 'nvidia', capability: 'hevcNvenc' },
  { encoder: 'hevc_amf', codec: 'hevc', vendor: 'amd', capability: 'hevcAmf' },
  { encoder: 'hevc_qsv', codec: 'hevc', vendor: 'intel', capability: 'hevcQsv' },
];

export function getGpuEncoderInfo(encoder: SizeLimitedEncoderName) {
  return gpuEncoders.find((info) => info.encoder === encoder);
}

export function isGpuEncoderAvailable(capabilities: SizeLimitedEncoderCapabilities, encoder: GpuEncoderName) {
  const info = getGpuEncoderInfo(encoder);
  return info != null && capabilities[info.capability] === true;
}

/** The preferred working GPU encoder for a codec, if any. */
export function pickGpuEncoder(capabilities: SizeLimitedEncoderCapabilities, codec: SizeLimitedCodec) {
  return gpuEncoders.find((info) => info.codec === codec && capabilities[info.capability] === true);
}

/** "Use the GPU" switched off: the encoders found, minus every one on the graphics card. */
export function withoutGpuEncoders(capabilities: SizeLimitedEncoderCapabilities): SizeLimitedEncoderCapabilities {
  const cpuOnly = { ...capabilities };
  for (const { capability } of gpuEncoders) cpuOnly[capability] = false;
  return cpuOnly;
}

/**
 * Quality on a graphics card without the codec's own encoder: from this many CPU threads the CPU's sharper encode is
 * worth its time, below it the card's H.264 is far quicker. SVT-AV1 at preset 7 takes 2-2.75× a 1080p60 clip's length on
 * 4 threads of a recent CPU (measured: 40-55 s for 20 s; a 2015-era one, the kind beside a card without the codec, is
 * slower): kept from 4 threads.
 */
export const minCpuThreadsForCpuAv1 = 4;

/**
 * The same for CPU HEVC (x265 Quality): about 1.5× SVT-AV1's time (61 s for 20 s of 1080p60 on 4 threads, 112 s on 2,
 * measured), so it reaches AV1's 4-thread time at about 6.
 */
export const minCpuThreadsForCpuHevc = 6;

/** NVENC preset names are the shared vocabulary; AMD and Intel map them to their own scales. */
export function getAmfQualityPreset(encoder: 'av1_amf' | 'h264_amf' | 'hevc_amf', preset: SizeLimitAdvancedNvencPreset) {
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

/** The longest side every GPU's H.264 encoder takes. */
export const maxGpuH264Side = 4096;

/**
 * The picture sizes an encoder takes as they are. AMD's AV1 encoder needs 64×16 blocks on RX 7000 cards and current
 * Ryzen chips (8×2 on RX 9000; 64×16 suits both), or it pads the picture and players show black bars; every GPU's
 * H.264 encoder stops at 4096 on a side (`notes/beta6-ux/research/gpu-encoders.md`, c1 and c6), and so does HEVC on the
 * oldest cards that have it (GTX 900, RX 400, 6th-gen Intel).
 */
export function getEncoderSizeRules(encoder: SizeLimitedEncoderName): EncoderSizeRules | undefined {
  if (encoder === 'av1_amf') return { alignWidth: 64, alignHeight: 16 };
  if (encoder === 'h264_nvenc' || encoder === 'h264_amf' || encoder === 'h264_qsv') return { alignWidth: 2, alignHeight: 2, maxSide: maxGpuH264Side };
  if (encoder === 'hevc_nvenc' || encoder === 'hevc_amf' || encoder === 'hevc_qsv') return { alignWidth: 2, alignHeight: 2, maxSide: maxGpuH264Side };
  return undefined;
}

export const gpuVendorLabels: Record<GpuVendor, string> = {
  nvidia: 'NVIDIA',
  amd: 'AMD',
  intel: 'Intel',
};

export const gpuEncoderLabels: Record<SizeLimitedEncoderName, string> = {
  libsvtav1: 'CPU AV1 (SVT-AV1)',
  libx264: 'CPU H.264',
  libx265: 'CPU HEVC (x265)',
  av1_nvenc: 'NVIDIA AV1',
  h264_nvenc: 'NVIDIA H.264',
  av1_amf: 'AMD AV1',
  h264_amf: 'AMD H.264',
  av1_qsv: 'Intel AV1',
  h264_qsv: 'Intel H.264',
  hevc_nvenc: 'NVIDIA HEVC',
  hevc_amf: 'AMD HEVC',
  hevc_qsv: 'Intel HEVC',
};

/**
 * Hardware decoding for exports.
 *
 * D3D11VA works on NVIDIA, AMD and Intel GPUs alike and hands frames back to system memory, so
 * every CPU filter (crop, speed, text, scaling) keeps working unchanged. Codecs or profiles the
 * GPU cannot decode fall back to software inside FFmpeg.
 *
 * Measured with 1440p60 HEVC and NVENC: a single-input export went from 12.4 s to 7.2 s on 4 CPU
 * threads and 6.8 s to 6.0 s on 8, and was unchanged on 16.
 *
 * Merges decode on the GPU too, whatever the CPU (Beta 6.1, the owner's kind of share: AV1 NVENC
 * recordings, a 16-thread Ryzen and an RTX 5060 Ti, `notes/beta6-ux/perf/speedlab*.sh`). Two 1440p30
 * AV1 clips at 400% took 8.6 s instead of 21 s, the same pair at 100% 2.9 s instead of 5.2 s, two
 * 1080p60 HEVC clips 14 s instead of 36-44 s at 400% and 6.0 s instead of 12.2 s at 100%, and
 * three of them 6.5 s instead of 11.4 s, every output byte-for-byte the same size. (Beta 6 kept
 * merges on the CPU above 8 threads, from an older HEVC measurement this didn't reproduce.)
 *
 * Every input of a merged export gets its own decoder, all open at once, and each holds a pool
 * of GPU frames (about 250 MB for 1440p). Above this many source pixels across inputs we decode
 * on the CPU rather than risk running a smaller card out of memory.
 */
export const maxHardwareDecodePixels = 17_000_000;

export function shouldUseHardwareDecode({ platform, enabled, inputCount, width, height }: {
  platform: string,
  enabled: boolean,
  inputCount: number,
  width: number | undefined,
  height: number | undefined,
}) {
  if (!enabled || platform !== 'win32' || inputCount < 1) return false;
  const pixels = (width ?? 0) * (height ?? 0);
  if (!(pixels > 0)) return false;
  return pixels * inputCount <= maxHardwareDecodePixels;
}

/** Input options; place before each video `-i`. */
export function getHardwareDecodeArgs(useHardwareDecode: boolean, keepFramesOnGpu = false) {
  if (!useHardwareDecode) return [];
  return keepFramesOnGpu ? ['-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11'] : ['-hwaccel', 'd3d11va'];
}

/**
 * A sped-up clip decoded on the GPU can keep its frames there until `fps` has dropped the ones the export doesn't
 * keep (at 400%, three in four): `setpts` and `fps` only read timestamps, so only the kept frames are copied to the
 * CPU for the rest of the filters. That copy was most of a sped-up export's time (`notes/beta6-ux/perf/speedlab4.sh`):
 * the owner's kind of share (two 1440p30 AV1 clips at 400%, a text, AV1 NVENC) took 3.9 s instead of 6.6 s, two
 * 1080p60 HEVC clips 5.4 s instead of 9.4 s, 10-bit HEVC 2.7 s instead of 6.5 s, with as many frames and a size
 * within 1%. It also drops them evenly from the first frame (the encoder's own dropping kept the first three).
 *
 * The format to copy the frames into, or undefined for a source D3D11 doesn't decode to one of these.
 */
export function getGpuFramesDownloadFormat(pixFmt: string | undefined) {
  if (pixFmt === 'yuv420p' || pixFmt === 'yuvj420p') return 'nv12';
  if (pixFmt === 'yuv420p10le') return 'p010';
  return undefined;
}

/**
 * Joined clips can drop their frames on the GPU only up to this many. Each clip's frames then sit on the export's own
 * frame grid, and concat takes each clip's length from them, so every join can land up to half a frame from where
 * it's planned (`notes/beta6-ux/perf/speedlab6.sh`: +12.5 ms per join at 30 fps). With up to two joins that stays
 * within one frame; longer merges take the old path, whose joins are exact.
 */
export const maxGpuFramesClips = 3;

/** Whether an export's sped-up clips can keep their frames on the GPU (given a source format it can copy off). */
export function shouldKeepFramesOnGpu({ clips, rotation, lowestFps }: {
  /** Each clip's playback rate and length in the export, in the order they're joined. */
  clips: { rate: number, duration: number }[],
  rotation: number | undefined,
  /** The lowest frame rate the export may have. */
  lowestFps: number | undefined,
}) {
  // A turned video isn't kept there: FFmpeg turns it with a CPU filter before ours.
  if (!clips.some(({ rate }) => rate > 1) || clips.length > maxGpuFramesClips || ((rotation ?? 0) % 360) !== 0) return false;
  if (clips.length === 1) return true;
  // concat needs two frames to know a clip's length (one counts as no time), so a sped-up clip shorter than that
  // would move the next join by more.
  return lowestFps != null && lowestFps > 0 && clips.every(({ rate, duration }) => rate <= 1 || duration * lowestFps >= 2);
}

/** Placed right after a clip's `setpts`: the frames to keep at the export's frame rate, copied off the GPU. */
export function getGpuFramesFilter({ rate, downloadFormat, outputFps }: {
  rate: number,
  downloadFormat: string,
  /** The export's frame rate when it's lowered; otherwise the source's, as FFmpeg sees it. */
  outputFps: number | undefined,
}) {
  return [...(rate > 1 ? [`fps=${outputFps ?? 'source_fps'}`] : []), 'hwdownload', `format=${downloadFormat}`].join(',');
}

/**
 * Video arguments for a regular export that has to re-encode (text, speed or crop). These aim
 * for visually lossless quality rather than a size, so each encoder uses its quality mode.
 * Measured on a 30 s 1080p60 clip: NVENC took 5.4 s against 20.1 s for x264 at a similar size.
 */
export function getRegularExportVideoArgs(encoder: GpuEncoderName | undefined, { basic = false }: { basic?: boolean | undefined } = {}) {
  switch (encoder) {
    case 'h264_nvenc': {
      // The basic settings leave out the look-ahead and temporal AQ a Maxwell card lacks.
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-profile:v', 'high', '-rc', 'vbr', '-cq', '19', '-b:v', '0', ...(basic ? [] : ['-rc-lookahead', '20']), '-spatial-aq', '1', ...(basic ? [] : ['-temporal-aq', '1']), '-pix_fmt', 'yuv420p'];
    }
    case 'h264_amf': {
      // High profile: AMD's own default is Main.
      return ['-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'quality', ...(basic ? [] : ['-profile:v', 'high']), '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20', '-qp_b', '22', '-pix_fmt', 'nv12'];
    }
    case 'h264_qsv': {
      return ['-c:v', 'h264_qsv', '-preset', 'slow', ...(basic ? [] : ['-profile:v', 'high']), '-global_quality', '20', '-pix_fmt', 'nv12'];
    }
    default: {
      // `faster` measured as visually lossless as `medium` at CRF 18, about 40% quicker, files up to ~4% bigger.
      return ['-c:v', 'libx264', '-preset', 'faster', '-crf', '18', '-pix_fmt', 'yuv420p'];
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
