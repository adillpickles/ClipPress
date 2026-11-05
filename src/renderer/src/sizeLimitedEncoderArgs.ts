import type { SizeLimitAdvancedNvencPreset } from '../../common/types.js';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import type { SizeLimitedResolvedStrategy } from './sizeLimitedTypes';
// The extension is required because `script/benchmarkSizeLimited.ts` loads this module in plain Node.
import { getAmfQualityPreset, getQsvPreset } from './gpuEncoders.ts';
import type { GpuEncoderName } from './gpuEncoders.ts';

const fastCpuX264Params = 'aq-mode=3:aq-strength=0.8:deblock=-1,-1:rc-lookahead=20:me=hex:subme=6';
const qualityCpuX264Params = 'aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3';
const premiumCpuX264Params = 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=40:me=umh:subme=8:ref=4';
const maxQualitySvtTune = '0';
/**
 * x265, measured on 1080p60 game footage at 5 Mbps (VMAF, three games). Quality is `fast` with slow's psychovisual
 * RDOQ: 1.3-3.1 sharper than plain `fast` and 1.2-3.5 than `medium`, in `medium`'s time. Fast is plain `veryfast`.
 * Max quality is `slow`'s two passes. SAO off is never worse (up to +0.3 on `slow`). `superfast` scores higher only by
 * leaving out adaptive quantisation, which bands flat and dark areas (VMAF doesn't see banding).
 */
const qualityX265Params = ['no-sao=1', 'rdoq-level=2', 'psy-rdoq=1.0'];
const maxQualityX265Params = ['no-sao=1'];
const longGopSeconds = 10;
const fallbackLongGopFrames = 300;
/** The most frames AMD's H.264 and HEVC encoders allow between keyframes. */
const maxAmfGopFrames = 1000;
const constrainedH264MaxRateFactor = 1.05;
const constrainedH264BufferFactor = 1.5;

export function toKbitrateArg(bitrate: number) {
  return `${Math.max(1, Math.floor(bitrate / 1000))}k`;
}

function getBitrateWindowArgs({ videoBitrate, maxRateFactor, bufferFactor }: {
  videoBitrate: number,
  maxRateFactor: number,
  bufferFactor: number,
}) {
  return [
    '-b:v', toKbitrateArg(videoBitrate),
    '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * maxRateFactor))),
    '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * bufferFactor))),
  ];
}

/**
 * HEVC's levels (H.265 table A.8, Main tier) from 3 up: the most luma samples a picture and a second may hold, and the
 * most bits a second (MaxBR, which is also the most bits the stream's buffer may hold, MaxCPB; the stream's own limits
 * are 1.1 times them). The level's number is 30 times the level.
 */
const hevcLevels = [
  { idc: 90, maxPictureSamples: 552_960, maxSampleRate: 16_588_800, maxBitrate: 6_000_000 },
  { idc: 93, maxPictureSamples: 983_040, maxSampleRate: 33_177_600, maxBitrate: 10_000_000 },
  { idc: 120, maxPictureSamples: 2_228_224, maxSampleRate: 66_846_720, maxBitrate: 12_000_000 },
  { idc: 123, maxPictureSamples: 2_228_224, maxSampleRate: 133_693_440, maxBitrate: 20_000_000 },
  { idc: 150, maxPictureSamples: 8_912_896, maxSampleRate: 267_386_880, maxBitrate: 25_000_000 },
  { idc: 153, maxPictureSamples: 8_912_896, maxSampleRate: 534_773_760, maxBitrate: 40_000_000 },
  { idc: 156, maxPictureSamples: 8_912_896, maxSampleRate: 1_069_547_520, maxBitrate: 60_000_000 },
  { idc: 180, maxPictureSamples: 35_651_584, maxSampleRate: 1_069_547_520, maxBitrate: 60_000_000 },
  { idc: 183, maxPictureSamples: 35_651_584, maxSampleRate: 2_139_095_040, maxBitrate: 120_000_000 },
  { idc: 186, maxPictureSamples: 35_651_584, maxSampleRate: 4_278_190_080, maxBitrate: 240_000_000 },
] as const;

/** The smallest HEVC level an encode fits in: its picture, its pictures a second, its peak bitrate and its buffer. */
export function getHevcLevel({ width, height, fps, maxBitrate, bufferSize }: { width: number, height: number, fps: number, maxBitrate: number, bufferSize: number }) {
  const pictureSamples = width * height;
  const sampleRate = pictureSamples * fps;
  const bits = Math.max(maxBitrate, bufferSize);
  return (hevcLevels.find((level) => pictureSamples <= level.maxPictureSamples && sampleRate <= level.maxSampleRate && bits <= level.maxBitrate * 1.1)
    ?? hevcLevels.at(-1)!).idc;
}

/**
 * The rate FFmpeg encodes a video at when nothing sets one, as its av_guess_frame_rate picks it: the stream's nominal
 * rate (ffprobe's `r_frame_rate`), unless that's over 210 while the average is under 70 (a time base, not a rate);
 * never below the average, so a level worked out from it is never too low (a variable-rate recording can average 30
 * and still have 60 a second in places).
 */
export function getEncodedFrameRate({ nominal, average }: { nominal: number | undefined, average: number | undefined }) {
  const guessed = nominal != null && nominal > 0 && !(nominal > 210 && average != null && average < 70) ? nominal : average;
  if (guessed == null) return average;
  return Math.max(guessed, average ?? 0);
}

/** A rate as ffprobe writes it ("60/1", "30000/1001"), or undefined. */
export function parseFfprobeRate(value: string | undefined) {
  const match = value?.match(/^(\d+)\/(\d+)$/u);
  if (match == null) return undefined;
  const den = Number(match[2]);
  return den > 0 ? Number(match[1]) / den : undefined;
}

/** The encoded picture's size and rate, where known (AMD's HEVC declares its level from them). */
export interface SizeLimitedEncodedFrame {
  width: number,
  height: number,
  fps: number,
}

/**
 * About 10 s between keyframes: at these bitrates each one is costly, and the encoders still add one at a scene cut.
 * In frames of the output, which keeps the source's rate unless it's lowered (a whole-export speed change doesn't
 * raise it: measured CFR 30 at 400%).
 */
function getLongGopFrames({ outputFps, sourceFps }: { outputFps: number | undefined, sourceFps: number | undefined }) {
  const resolvedFps = outputFps ?? sourceFps;
  if (resolvedFps == null || !Number.isFinite(resolvedFps) || resolvedFps <= 0) return fallbackLongGopFrames;
  return Math.max(1, Math.round(resolvedFps * longGopSeconds));
}

/**
 * NVENC in VBR mode treats `-cq` as a quality ceiling: it will not spend more bits than
 * that quality needs, even when the bitrate window allows it. That is what keeps easy
 * content far below the requested file size. On a top-up attempt we lower the number
 * (higher quality) so the encoder can actually use the budget it was given.
 */
const minNvencCq = 10;

/** GPU strategies carry an NVENC-style preset; AMD and Intel translate it to their own scale. */
function getGpuPreset(strategy: SizeLimitedResolvedStrategy): SizeLimitAdvancedNvencPreset {
  const preset = String(strategy.encoderPreset);
  return /^p[1-7]$/u.test(preset) ? preset as SizeLimitAdvancedNvencPreset : 'p6';
}

/**
 * NVENC's own multipass. `fullres` stands in for a 2-pass request (FFmpeg pass logs do
 * nothing for hardware encoders); `qres` is the cheaper default for single-pass quality.
 */
function getNvencMultipassArgs(strategy: SizeLimitedResolvedStrategy, { twoPass, isFast }: { twoPass: boolean, isFast: boolean }) {
  if (strategy.encoderMultipass) return ['-multipass', 'fullres'];
  return !twoPass && !isFast ? ['-multipass', 'qres'] : [];
}

/**
 * Whether the encoder has a quality cap that `qualityCapOffset` relaxes: AV1 NVENC's `-cq`, and NVIDIA HEVC's own one
 * (it has no `-cq` until relaxed, then `-cq 1`).
 */
export function hasQualityCap(encoder: SizeLimitedResolvedStrategy['encoder']) {
  return encoder === 'av1_nvenc' || encoder === 'hevc_nvenc';
}

function resolveNvencCq({ baseCq, qualityCapOffset }: { baseCq: number, qualityCapOffset: number | undefined }) {
  if (qualityCapOffset == null || qualityCapOffset <= 0) return String(baseCq);
  return String(Math.max(minNvencCq, baseCq - qualityCapOffset));
}

export function getResolvedVideoArgs({ strategy, videoBitrate, twoPass, passNumber, videoProfile, sourceFps, qualityCapOffset, frame }: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  twoPass: boolean,
  /** Which pass of a two-pass encode these are for. */
  passNumber?: 1 | 2 | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  qualityCapOffset?: number | undefined,
  frame?: SizeLimitedEncodedFrame | undefined,
}) {
  switch (strategy.encoder) {
    case 'libsvtav1': {
      // Quantisation matrices: a small gain at no cost on the faster presets, neutral on Max quality's (measured).
      const svtav1Params = strategy.tuningProfile === 'max_quality'
        ? `tune=${maxQualitySvtTune}:keyint=${getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps })}`
        : (strategy.tuningProfile === 'quality' || strategy.tuningProfile === 'fast' ? 'enable-qm=1' : undefined);
      return [
        '-c:v', 'libsvtav1',
        '-preset', String(strategy.encoderPreset),
        '-pix_fmt', 'yuv420p',
        '-b:v', toKbitrateArg(videoBitrate),
        ...(svtav1Params != null ? ['-svtav1-params', svtav1Params] : []),
      ];
    }

    case 'libx265': {
      const tuning = strategy.tuningProfile === 'max_quality' ? maxQualityX265Params : (strategy.tuningProfile === 'quality' ? qualityX265Params : []);
      const x265Params = [
        `keyint=${getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps })}`,
        ...tuning,
        // The first pass only reads the clip: x265's quicker settings there leave the second pass's result the same
        // (measured: 87.4 vs 87.3 and 96.1 vs 96.1) in a third less time.
        ...(passNumber === 1 ? ['no-slow-firstpass=1'] : []),
        // Its settings and per-frame notes would only fill the export log; errors still show.
        'log-level=error',
      ];
      return [
        '-c:v', 'libx265',
        '-preset', String(strategy.encoderPreset),
        '-profile:v', 'main',
        '-pix_fmt', 'yuv420p',
        '-x265-params', x265Params.join(':'),
        // Apple's players (iPhones, Macs) and Photos want `hvc1`; FFmpeg's MP4 default is `hev1`.
        '-tag:v', 'hvc1',
        // Size-first like H.264's, so the planner's under-cap budget holds.
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: constrainedH264MaxRateFactor, bufferFactor: constrainedH264BufferFactor }),
      ];
    }

    case 'av1_nvenc': {
      const isMaxQuality = strategy.tuningProfile === 'max_quality';
      const isFast = strategy.tuningProfile === 'fast';
      if (strategy.basicEncoderSettings) {
        return [
          '-c:v', 'av1_nvenc',
          '-preset', String(strategy.encoderPreset),
          '-rc', 'vbr',
          '-cq', resolveNvencCq({ baseCq: isMaxQuality ? 26 : (isFast ? 33 : 28), qualityCapOffset }),
          '-pix_fmt', 'yuv420p',
          ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.05, bufferFactor: 1.5 }),
        ];
      }
      return [
        '-c:v', 'av1_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', isMaxQuality ? 'uhq' : 'hq',
        '-rc', 'vbr',
        ...getNvencMultipassArgs(strategy, { twoPass, isFast }),
        '-cq', resolveNvencCq({ baseCq: isMaxQuality ? 26 : (isFast ? 33 : 28), qualityCapOffset }),
        '-rc-lookahead', isMaxQuality ? '32' : (isFast ? '4' : '20'),
        '-spatial-aq', '1',
        '-temporal-aq', isFast ? '0' : '1',
        '-aq-strength', isMaxQuality ? '10' : (isFast ? '4' : '8'),
        ...(!isFast ? ['-b_ref_mode', 'middle'] : []),
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isMaxQuality ? 1.08 : 1.05,
          bufferFactor: isMaxQuality ? 2.2 : 1.5,
        }),
      ];
    }

    case 'libx264': {
      const isFast = strategy.tuningProfile === 'fast';
      // Max quality's two passes get the Quality params: the premium ones measured no better there, only slower.
      const qualityParams = twoPass && strategy.tuningProfile === 'advanced' ? premiumCpuX264Params : (isFast ? fastCpuX264Params : qualityCpuX264Params);
      return [
        '-c:v', 'libx264',
        '-preset', String(strategy.encoderPreset),
        '-pix_fmt', 'yuv420p',
        '-x264-params', qualityParams,
        // Keep H.264 size-first so the planner's under-cap budget remains trustworthy.
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: constrainedH264MaxRateFactor,
          bufferFactor: constrainedH264BufferFactor,
        }),
      ];
    }

    case 'h264_nvenc': {
      const isFast = strategy.tuningProfile === 'fast';
      // Without the look-ahead, temporal AQ and B-frames as references a Maxwell card lacks.
      if (strategy.basicEncoderSettings) {
        return [
          '-c:v', 'h264_nvenc',
          '-preset', String(strategy.encoderPreset),
          '-tune', 'hq',
          '-profile:v', 'high',
          '-rc', 'vbr',
          '-multipass', 'qres',
          '-spatial-aq', '1',
          '-aq-strength', isFast ? '6' : '8',
          '-pix_fmt', 'yuv420p',
          ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: constrainedH264MaxRateFactor, bufferFactor: constrainedH264BufferFactor }),
        ];
      }
      return [
        '-c:v', 'h264_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', 'hq',
        '-profile:v', 'high',
        // vbr_hq is deprecated: vbr with the multipass below makes the same file.
        '-rc', 'vbr',
        ...getNvencMultipassArgs(strategy, { twoPass, isFast: false }),
        '-rc-lookahead', isFast ? '12' : '20',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', isFast ? '6' : '8',
        '-strict_gop', '1',
        ...(!isFast ? ['-b_ref_mode', 'middle'] : []),
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: constrainedH264MaxRateFactor,
          bufferFactor: constrainedH264BufferFactor,
        }),
      ];
    }

    // H.264's settings in HEVC's names, with NVIDIA's "ultra high quality" tuning for Quality and Max quality where the
    // card takes it: it sets its own look-ahead, temporal filter and five B-frames. Measured on an RTX 5060 Ti against
    // "hq" at the same bitrate: a little higher on average and far better on the worst frames, a slightly smaller file,
    // about half as fast. Basic: without the look-ahead, temporal AQ and B-frames as references a GTX 900 or 10 card
    // lacks for HEVC. `hvc1` so Apple's players (iPhones, Macs) play the MP4 too.
    // Relaxed (a budget that isn't tight), the highest quality target: left to itself, NVIDIA's HEVC stops well short of
    // the size on quiet footage (a third of it on a 12 s stretch at 20 MB); with `-cq 1` it uses about half again as
    // much, at the same speed, and never ran over the limit (measured, perf/hevctune/cq-r71.mjs).
    case 'hevc_nvenc': {
      const isFast = strategy.tuningProfile === 'fast';
      return [
        '-c:v', 'hevc_nvenc',
        '-preset', String(strategy.encoderPreset),
        '-tune', strategy.nvencUhq ? 'uhq' : 'hq',
        '-profile:v', 'main',
        '-rc', 'vbr',
        ...(strategy.basicEncoderSettings ? ['-multipass', 'qres'] : [
          ...getNvencMultipassArgs(strategy, { twoPass, isFast: false }),
          ...(qualityCapOffset != null && qualityCapOffset > 0 ? ['-cq', '1'] : []),
          '-rc-lookahead', isFast ? '12' : '20',
          '-temporal-aq', '1',
          '-strict_gop', '1',
          ...(!isFast ? ['-b_ref_mode', 'middle'] : []),
        ]),
        '-spatial-aq', '1',
        '-aq-strength', isFast ? '6' : '8',
        '-pix_fmt', 'yuv420p',
        '-tag:v', 'hvc1',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: constrainedH264MaxRateFactor, bufferFactor: constrainedH264BufferFactor }),
      ];
    }

    // AMD: the quality tools OBS turns on for every AMD card (FFmpeg leaves out what a card can't do), plus its
    // pre-analysis (scene cuts, fast motion) and B-frames where the card has them, except for Fast. The pre-analysis
    // look-ahead of H.264 and AV1 stays below 16: a deeper one could deadlock in FFmpeg before 9.0. The basic settings
    // are the plain ones every driver accepts.
    // HEVC follows AMD's own recipe for files (its AMF wiki, "Recommended FFmpeg Encoder Settings"): a 40-frame
    // look-ahead, and the high-motion boost for Fast too. It declares the smallest level its picture fits, in every
    // tier: AMD's default (5.2, or 6.2 as OBS saw it) made some players refuse the file. No HEVC B-frames: AMD's HEVC
    // encoder has none.
    case 'av1_amf':
    case 'h264_amf':
    case 'hevc_amf': {
      const isAv1 = strategy.encoder === 'av1_amf';
      const isHevc = strategy.encoder === 'hevc_amf';
      const isFast = strategy.tuningProfile === 'fast';
      const gopFrames = getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps });
      const hevcLevelArgs = isHevc && frame != null
        ? ['-level:v', String(getHevcLevel({ ...frame, maxBitrate: Math.floor(videoBitrate * constrainedH264MaxRateFactor), bufferSize: Math.floor(videoBitrate * constrainedH264BufferFactor) }))]
        : [];
      return [
        '-c:v', strategy.encoder,
        '-usage', 'transcoding',
        '-quality', getAmfQualityPreset(strategy.encoder, getGpuPreset(strategy)),
        ...hevcLevelArgs,
        ...(strategy.basicEncoderSettings ? [
          // The GOP and the bitrate limits are rate control every AMD card has (OBS sets them on all).
          ...(isHevc ? ['-enforce_hrd', '1', '-g', String(Math.min(gopFrames, maxAmfGopFrames))] : []),
        ] : [
          ...(isAv1 ? ['-aq_mode', 'caq'] : ['-profile:v', isHevc ? 'main' : 'high', '-vbaq', '1', '-preencode', '1']),
          '-enforce_hrd', '1',
          '-g', String(isAv1 ? gopFrames : Math.min(gopFrames, maxAmfGopFrames)),
          ...(!isFast ? ['-preanalysis', '1', '-pa_lookahead_buffer_depth', isHevc ? '40' : '11', '-pa_scene_change_detection_enable', '1', '-pa_high_motion_quality_boost_mode', 'auto', '-high_motion_quality_boost_enable', '1', ...(isHevc ? [] : ['-bf', '2'])] : []),
          ...(isFast && isHevc ? ['-high_motion_quality_boost_enable', '1'] : []),
        ]),
        '-rc', 'vbr_peak',
        '-pix_fmt', 'nv12',
        ...(isHevc ? ['-tag:v', 'hvc1'] : []),
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isAv1 ? 1.08 : constrainedH264MaxRateFactor,
          bufferFactor: isAv1 ? 2 : constrainedH264BufferFactor,
        }),
      ];
    }

    // Intel: High profile, no minimum bitrate (the driver's floor is about 0.9 Mbps at 1080p) and, except for Fast,
    // Intel's own recipe for its look-ahead rate control (Arc and newer; older chips turn it down and get the basic
    // settings). Never `-look_ahead 1`: Arc refuses it. HEVC takes Intel's HEVC recipe (its media-delivery "quality"
    // guide) with its 4 reference frames, but not its two settings that would break the size limit or seeking; its
    // profile and 10 s GOP are in the basic settings too (every chip takes them; FFmpeg's own GOP is 248 frames).
    case 'av1_qsv':
    case 'h264_qsv':
    case 'hevc_qsv': {
      const isAv1 = strategy.encoder === 'av1_qsv';
      const isHevc = strategy.encoder === 'hevc_qsv';
      const isFast = strategy.tuningProfile === 'fast';
      const gopArgs = ['-g', String(getLongGopFrames({ outputFps: videoProfile.outputFps, sourceFps }))];
      return [
        '-c:v', strategy.encoder,
        '-preset', getQsvPreset(getGpuPreset(strategy)),
        ...(strategy.basicEncoderSettings ? [
          ...(isHevc ? ['-profile:v', 'main', ...gopArgs] : []),
        ] : [
          ...(isAv1 ? [] : (isHevc ? ['-profile:v', 'main'] : ['-profile:v', 'high', '-bitrate_limit', '0'])),
          ...gopArgs,
          ...(!isFast ? ['-extbrc', '1', '-look_ahead_depth', '40', '-adaptive_i', '1', '-adaptive_b', '1', '-b_strategy', '1', '-bf', '7', ...(isHevc ? ['-refs', '4'] : [])] : []),
        ]),
        '-pix_fmt', 'nv12',
        ...(isHevc ? ['-tag:v', 'hvc1'] : []),
        ...getBitrateWindowArgs({
          videoBitrate,
          maxRateFactor: isAv1 ? 1.08 : constrainedH264MaxRateFactor,
          bufferFactor: isAv1 ? 2 : constrainedH264BufferFactor,
        }),
      ];
    }

    default: {
      return [];
    }
  }
}

/**
 * What the encoder check opens a GPU encoder with to see whether it takes the tuned settings: those of the most
 * demanding profile, at a typical bitrate. A card or driver that turns them down keeps to the basic settings. `nvencUhq`:
 * the same with NVIDIA HEVC's "ultra high quality" tuning, asked separately so a card without it keeps the tuned ones.
 */
export function getGpuProbeVideoArgs(encoder: GpuEncoderName, { nvencUhq = false }: { nvencUhq?: boolean } = {}) {
  const strategy = {
    encoder,
    encoderPreset: 'p7',
    tuningProfile: 'max_quality',
    encoderMultipass: encoder.endsWith('_nvenc'),
    nvencUhq,
  } as SizeLimitedResolvedStrategy;
  // NVIDIA HEVC's tuned settings include its relaxed quality target.
  const qualityCapOffset = encoder === 'hevc_nvenc' ? 1 : undefined;
  return getResolvedVideoArgs({ strategy, videoBitrate: 2_000_000, twoPass: false, videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: 30 }, sourceFps: 30, outputPlaybackRate: 1, qualityCapOffset });
}
