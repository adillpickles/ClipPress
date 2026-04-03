import type { FFprobeStream } from '../../common/ffprobe.js';
import type { SizeLimitAdvancedEncoder, SizeLimitControlMode, SizeLimitPreset } from '../../common/types.js';
import { getExperimentalArgs, logStdoutStderr, runFfmpeg, runFfmpegWithProgress } from './ffmpeg';
import mainApi from './mainApi';
import { getNextSizeLimitedRetryStep, planSizeLimitedEncode } from './sizeLimitedPlanner';
import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { SegmentToExport, SizeLimitedEncoderCapabilities, SizeLimitedExecutionResult, SizeLimitedProgressMetadata, SizeLimitedResolvedStrategy, SizeLimitedRetryStep } from './types';
import { assertFileExists, readFileSize, renameWithRetry, transferTimestamps, unlinkWithRetry } from './util';
import { UserFacingError } from '../errors';

const { access, constants: { W_OK }, mkdir } = window.require('fs/promises');
const { dirname } = window.require('path');

const retryTempSuffix = 'clippress-size-limit';
const fastCpuX264Params = 'aq-mode=3:aq-strength=0.8:deblock=-1,-1:rc-lookahead=20:me=hex:subme=6';
const qualityCpuX264Params = 'aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3';
const premiumCpuX264Params = 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=40:me=umh:subme=8:ref=4';
const svtAv1MaxQualityPreset = '6';
const svtAv1QualityPreset = '8';
const nvencProbeSource = 'color=c=black:s=640x360:r=30:d=0.2';
const nvencProbeFrames = '3';

let encoderCapabilitiesPromise: Promise<SizeLimitedEncoderCapabilities> | undefined;

function toKbitrateArg(bitrate: number) {
  return `${Math.max(1, Math.floor(bitrate / 1000))}k`;
}

function decodeProcessOutput({ stdout, stderr }: { stdout: Uint8Array, stderr: Uint8Array }) {
  return `${new TextDecoder().decode(stdout)}\n${new TextDecoder().decode(stderr)}`;
}

async function probeNvencEncoder(encoder: 'h264_nvenc' | 'av1_nvenc') {
  const ffmpegArgs = [
    '-hide_banner',
    '-f', 'lavfi',
    '-i', nvencProbeSource,
    '-frames:v', nvencProbeFrames,
    '-an',
    '-c:v', encoder,
    '-f', 'null',
    '-',
  ];

  try {
    await runFfmpeg(ffmpegArgs, undefined, { logCli: false });
    return true;
  } catch (error) {
    console.warn(`Failed to initialize ${encoder}`, error);
    return false;
  }
}

export async function getSizeLimitedEncoderCapabilities() {
  if (encoderCapabilitiesPromise == null) {
    encoderCapabilitiesPromise = (async () => {
      try {
        const result = await runFfmpeg(['-hide_banner', '-encoders'], undefined, { logCli: false });
        const output = decodeProcessOutput(result);
        const encoders = parseFfmpegEncoderNames(output);
        const libx264 = encoders.has('libx264');
        const libsvtav1 = encoders.has('libsvtav1');
        const h264Nvenc = encoders.has('h264_nvenc') ? await probeNvencEncoder('h264_nvenc') : false;
        const av1Nvenc = encoders.has('av1_nvenc') ? await probeNvencEncoder('av1_nvenc') : false;
        return { h264Nvenc, av1Nvenc, libx264, libsvtav1 };
      } catch (error) {
        console.warn('Failed to detect size-limited encoder capabilities, falling back to CPU encoders when available', error);
        return { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: false };
      }
    })();
  }

  return encoderCapabilitiesPromise;
}

function assertStrategySupported({ strategy, capabilities }: {
  strategy: SizeLimitedResolvedStrategy,
  capabilities: SizeLimitedEncoderCapabilities,
}) {
  if (strategy.encoder === 'libx264' && !capabilities.libx264) {
    throw new UserFacingError('Size-limited export could not find a usable H.264 encoder.');
  }
  if (strategy.encoder === 'libsvtav1' && !capabilities.libsvtav1) {
    throw new UserFacingError('Size-limited export could not find a usable AV1 encoder.');
  }
  if (strategy.encoder === 'h264_nvenc' && !capabilities.h264Nvenc) {
    throw new UserFacingError('Size-limited export could not find a usable NVIDIA H.264 encoder.');
  }
  if (strategy.encoder === 'av1_nvenc' && !capabilities.av1Nvenc) {
    throw new UserFacingError('Size-limited export could not find a usable NVIDIA AV1 encoder.');
  }
}

async function pathExists(path: string) {
  return mainApi.pathExists(path);
}

async function ensureWritableOutput(path: string, enableOverwriteOutput: boolean) {
  const exists = await pathExists(path);

  if (!exists) return false;

  try {
    await access(path, W_OK);
  } catch {
    throw new UserFacingError('Output file is not writable');
  }

  return !enableOverwriteOutput;
}

async function ensureOutputDir(outPath: string) {
  await mkdir(dirname(outPath), { recursive: true });
}

async function deleteIfExists(path: string | undefined) {
  if (path == null) return;
  if (!(await pathExists(path))) return;
  await unlinkWithRetry(path).catch(() => undefined);
}

async function deletePassArtifacts(basePath: string | undefined) {
  if (basePath == null) return;
  const artifacts = [
    basePath,
    `${basePath}-0.log`,
    `${basePath}-0.log.mbtree`,
    `${basePath}.log`,
    `${basePath}.log.mbtree`,
  ];

  await Promise.all(artifacts.map((artifact) => deleteIfExists(artifact)));
}

function getRotationArgs(rotation: number | undefined) {
  return rotation !== undefined ? ['-display_rotation:v:0', String(360 - rotation)] : [];
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

function getAudioArgs({ audioInputLabel, audioBitrate }: {
  audioInputLabel: string | undefined,
  audioBitrate: number,
}) {
  if (audioInputLabel == null) return ['-an'];
  return ['-map', audioInputLabel, '-c:a', 'aac', '-b:a', toKbitrateArg(audioBitrate), '-ac', '2'];
}

function getStrategyVideoArgs({ strategy, videoBitrate }: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
}) {
  switch (strategy.id) {
    case 'fast_h264_nvenc': {
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p6',
        '-tune', 'hq',
        '-profile:v', 'high',
        '-rc', 'vbr',
        '-multipass', 'qres',
        '-cq', '23',
        '-rc-lookahead', '20',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', '8',
        '-b_ref_mode', 'middle',
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.1, bufferFactor: 2 }),
      ];
    }
    case 'ultra_fast_h264_nvenc': {
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-tune', 'hq',
        '-profile:v', 'high',
        '-rc', 'vbr',
        '-cq', '24',
        '-rc-lookahead', '12',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', '6',
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.12, bufferFactor: 2 }),
      ];
    }
    case 'max_quality_av1_nvenc': {
      return [
        '-c:v', 'av1_nvenc',
        '-preset', 'p7',
        '-tune', 'uhq',
        '-rc', 'vbr',
        '-multipass', 'fullres',
        '-cq', '26',
        '-rc-lookahead', '32',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', '10',
        '-b_ref_mode', 'middle',
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.08, bufferFactor: 2.2 }),
      ];
    }
    case 'quality_av1_nvenc':
    case 'advanced_av1_nvenc': {
      return [
        '-c:v', 'av1_nvenc',
        '-preset', 'p6',
        '-tune', 'hq',
        '-rc', 'vbr',
        '-multipass', 'qres',
        '-cq', '28',
        '-rc-lookahead', '24',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', '8',
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.1, bufferFactor: 2 }),
      ];
    }
    case 'max_quality_av1_cpu':
    case 'advanced_av1_cpu': {
      return [
        '-c:v', 'libsvtav1',
        '-preset', svtAv1MaxQualityPreset,
        '-pix_fmt', 'yuv420p',
        '-b:v', toKbitrateArg(videoBitrate),
      ];
    }
    case 'quality_av1_cpu': {
      return [
        '-c:v', 'libsvtav1',
        '-preset', svtAv1QualityPreset,
        '-pix_fmt', 'yuv420p',
        '-b:v', toKbitrateArg(videoBitrate),
      ];
    }
    case 'fast_h264_cpu': {
      return [
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-pix_fmt', 'yuv420p',
        '-x264-params', fastCpuX264Params,
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.08, bufferFactor: 2 }),
      ];
    }
    case 'ultra_fast_h264_cpu': {
      return [
        '-c:v', 'libx264',
        '-preset', 'faster',
        '-pix_fmt', 'yuv420p',
        '-x264-params', fastCpuX264Params,
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.12, bufferFactor: 2 }),
      ];
    }
    case 'quality_h264_cpu':
    case 'advanced_h264_cpu_single_pass': {
      return [
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-pix_fmt', 'yuv420p',
        '-x264-params', qualityCpuX264Params,
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.08, bufferFactor: 2.2 }),
      ];
    }
    case 'max_quality_h264_cpu_two_pass':
    case 'advanced_h264_cpu_two_pass': {
      return [
        '-c:v', 'libx264',
        '-preset', 'slower',
        '-pix_fmt', 'yuv420p',
        '-x264-params', premiumCpuX264Params,
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.05, bufferFactor: 2.2 }),
      ];
    }
    case 'advanced_h264_nvenc': {
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p6',
        '-tune', 'hq',
        '-profile:v', 'high',
        '-rc', 'vbr',
        '-multipass', 'qres',
        '-cq', '23',
        '-rc-lookahead', '20',
        '-spatial-aq', '1',
        '-temporal-aq', '1',
        '-aq-strength', '8',
        '-b_ref_mode', 'middle',
        '-pix_fmt', 'yuv420p',
        ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.1, bufferFactor: 2 }),
      ];
    }
    default: {
      return [];
    }
  }
}

function getCommonEncodeArgs({
  strategy,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  ffmpegExperimental,
  rotation,
  outPath,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  outPath: string,
}) {
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...getStrategyVideoArgs({ strategy, videoBitrate }),
    ...getRotationArgs(rotation),
    ...getAudioArgs({ audioInputLabel, audioBitrate }),
    '-movflags', '+faststart',
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

function getCpuH264Pass1Args({
  videoBitrate,
  videoInputLabel,
  ffmpegExperimental,
  rotation,
  passlogFile,
  outPath,
}: {
  videoBitrate: number,
  videoInputLabel: string,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  passlogFile: string,
  outPath: string,
}) {
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    '-c:v', 'libx264',
    '-preset', 'slower',
    '-pix_fmt', 'yuv420p',
    '-x264-params', premiumCpuX264Params,
    ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.05, bufferFactor: 2.2 }),
    '-pass', '1',
    '-passlogfile', passlogFile,
    ...getRotationArgs(rotation),
    '-an',
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

function getCpuH264Pass2Args({
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  ffmpegExperimental,
  rotation,
  passlogFile,
  outPath,
}: {
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  passlogFile: string,
  outPath: string,
}) {
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    '-c:v', 'libx264',
    '-preset', 'slower',
    '-pix_fmt', 'yuv420p',
    '-x264-params', premiumCpuX264Params,
    ...getBitrateWindowArgs({ videoBitrate, maxRateFactor: 1.05, bufferFactor: 2.2 }),
    '-pass', '2',
    '-passlogfile', passlogFile,
    ...getRotationArgs(rotation),
    ...getAudioArgs({ audioInputLabel, audioBitrate }),
    '-movflags', '+faststart',
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

function getSegmentInputArgs({ filePath, segment, outputPlaybackRate }: {
  filePath: string,
  segment: SegmentToExport,
  outputPlaybackRate: number,
}) {
  const duration = segment.end - segment.start;
  return [
    ...(outputPlaybackRate !== 1 ? ['-itsscale', String(1 / outputPlaybackRate)] : []),
    '-ss', segment.start.toFixed(5),
    '-i', filePath,
    '-ss', '0',
    '-t', duration.toFixed(5),
  ];
}

function getMergeInputArgs({ filePath, segments, outputPlaybackRate }: {
  filePath: string,
  segments: SegmentToExport[],
  outputPlaybackRate: number,
}) {
  return segments.flatMap((segment) => [
    ...(outputPlaybackRate !== 1 ? ['-itsscale', String(1 / outputPlaybackRate)] : []),
    '-ss', segment.start.toFixed(5),
    '-i', filePath,
    '-ss', '0',
    '-t', (segment.end - segment.start).toFixed(5),
  ]);
}

function getConcatFilter({ segments, videoStreamIndex, audioStreamIndex }: {
  segments: SegmentToExport[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
}) {
  if (audioStreamIndex == null) {
    const labels = segments.map((_, index) => `[${index}:${videoStreamIndex}]`).join('');
    return `${labels}concat=n=${segments.length}:v=1:a=0[v]`;
  }

  const labels = segments.map((_, index) => `[${index}:${videoStreamIndex}][${index}:${audioStreamIndex}]`).join('');
  return `${labels}concat=n=${segments.length}:v=1:a=1[v][a]`;
}

function makeProgressMetadata({
  attemptNumber,
  maxAttempts,
  phaseNumber,
  phaseCount,
}: SizeLimitedProgressMetadata) {
  return { attemptNumber, maxAttempts, phaseNumber, phaseCount } satisfies SizeLimitedProgressMetadata;
}

async function runSinglePassEncode({
  ffmpegArgs,
  duration,
  onProgress,
  progressMetadata,
}: {
  ffmpegArgs: string[],
  duration: number,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  progressMetadata: SizeLimitedProgressMetadata,
}) {
  const result = await runFfmpegWithProgress({ ffmpegArgs, duration, onProgress: (progress) => onProgress(progress, progressMetadata) });
  logStdoutStderr(result);
}

async function runTwoPassEncode({
  pass1Args,
  pass2Args,
  duration,
  onProgress,
  pass1ProgressMetadata,
  pass2ProgressMetadata,
}: {
  pass1Args: string[],
  pass2Args: string[],
  duration: number,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  pass1ProgressMetadata: SizeLimitedProgressMetadata,
  pass2ProgressMetadata: SizeLimitedProgressMetadata,
}) {
  const pass1Result = await runFfmpegWithProgress({
    ffmpegArgs: pass1Args,
    duration,
    onProgress: (progress) => onProgress(progress / 2, pass1ProgressMetadata),
  });
  logStdoutStderr(pass1Result);

  const pass2Result = await runFfmpegWithProgress({
    ffmpegArgs: pass2Args,
    duration,
    onProgress: (progress) => onProgress(0.5 + (progress / 2), pass2ProgressMetadata),
  });
  logStdoutStderr(pass2Result);
}

interface AttemptFiles {
  outPath: string,
  ffmpegArgs: string[],
  passlogFile?: string | undefined,
  pass1Args?: string[] | undefined,
  pass1OutPath?: string | undefined,
}

async function executeWithRetries({
  plan,
  strategy,
  buildAttempt,
  onProgress,
}: {
  plan: ReturnType<typeof planSizeLimitedEncode>,
  strategy: SizeLimitedResolvedStrategy,
  buildAttempt: (attempt: SizeLimitedRetryStep) => Promise<AttemptFiles>,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
}) {
  let bestResult: SizeLimitedExecutionResult | undefined;
  let currentAttempt: SizeLimitedRetryStep | undefined = plan.initialAttempt;

  while (currentAttempt != null) {
    const attemptFiles = await buildAttempt(currentAttempt);

    try {
      if (strategy.executionMode === 'ffmpeg_two_pass') {
        const { pass1Args } = attemptFiles;
        if (pass1Args == null) throw new UserFacingError('2-pass encoding was not configured correctly');
        await runTwoPassEncode({
          pass1Args,
          pass2Args: attemptFiles.ffmpegArgs,
          duration: plan.duration,
          onProgress,
          pass1ProgressMetadata: makeProgressMetadata({
            attemptNumber: currentAttempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 1,
            phaseCount: 2,
          }),
          pass2ProgressMetadata: makeProgressMetadata({
            attemptNumber: currentAttempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 2,
            phaseCount: 2,
          }),
        });
      } else {
        await runSinglePassEncode({
          ffmpegArgs: attemptFiles.ffmpegArgs,
          duration: plan.duration,
          onProgress,
          progressMetadata: makeProgressMetadata({
            attemptNumber: currentAttempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 1,
            phaseCount: 1,
          }),
        });
      }

      const size = await readFileSize(attemptFiles.outPath);
      const metTarget = size <= plan.targetBytes;
      const candidate = {
        path: attemptFiles.outPath,
        size,
        targetBytes: plan.targetBytes,
        attemptCount: currentAttempt.attemptNumber,
        metTarget,
        created: true,
        strategy,
      } satisfies SizeLimitedExecutionResult;

      if (metTarget) {
        if (bestResult && bestResult.path !== candidate.path) await deleteIfExists(bestResult.path);
        return candidate;
      }

      if (bestResult == null || candidate.size < bestResult.size) {
        if (bestResult && bestResult.path !== candidate.path) await deleteIfExists(bestResult.path);
        bestResult = candidate;
      } else {
        await deleteIfExists(candidate.path);
      }

      currentAttempt = getNextSizeLimitedRetryStep({
        plan,
        previousAttempt: currentAttempt,
        previousOutputSize: size,
      });
    } catch (error) {
      await deleteIfExists(attemptFiles.outPath);
      throw error;
    } finally {
      await deleteIfExists(attemptFiles.pass1OutPath);
      await deletePassArtifacts(attemptFiles.passlogFile);
    }
  }

  if (bestResult != null) return bestResult;
  throw new UserFacingError('Unable to create a size-limited export');
}

function makeAttemptPath(outPath: string, attemptNumber: number) {
  return `${outPath}.${retryTempSuffix}.${attemptNumber}.mp4`;
}

function makePass1Path(outPath: string, attemptNumber: number) {
  return `${outPath}.${retryTempSuffix}.pass1.${attemptNumber}.mp4`;
}

function makePasslogPath(outPath: string, attemptNumber: number) {
  return `${outPath}.${retryTempSuffix}.passlog.${attemptNumber}`;
}

async function resolveSizeLimitedPlan({
  controlMode,
  preset,
  advancedEncoder,
  advancedTwoPass,
  targetSizeMb,
  duration,
  hasAudio,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  targetSizeMb: number,
  duration: number,
  hasAudio: boolean,
}) {
  const capabilities = await getSizeLimitedEncoderCapabilities();
  const strategy = resolveSizeLimitedStrategy({ controlMode, preset, advancedEncoder, advancedTwoPass, capabilities });
  assertStrategySupported({ strategy, capabilities });
  const plan = planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, strategy });
  return { capabilities, strategy, plan };
}

export function pickSizeLimitedStreams(streams: FFprobeStream[]) {
  const videoStream = streams.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  return { videoStream, audioStream };
}

export async function exportSizeLimitedSegment({
  filePath,
  outPath,
  segment,
  sourceDuration,
  targetSizeMb,
  controlMode,
  preset,
  advancedEncoder,
  advancedTwoPass,
  videoStream,
  audioStream,
  enableOverwriteOutput,
  ffmpegExperimental,
  treatInputFileModifiedTimeAsStart,
  treatOutputFileModifiedTimeAsStart,
  outputPlaybackRate,
  rotation,
  appendFfmpegCommandLog,
  onProgress,
  onStageChange,
}: {
  filePath: string,
  outPath: string,
  segment: SegmentToExport,
  sourceDuration: number | undefined,
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  videoStream: Pick<FFprobeStream, 'index'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  onStageChange?: ((metadata: SizeLimitedProgressMetadata | undefined) => void) | undefined,
}) {
  await assertFileExists(filePath);
  await ensureOutputDir(outPath);

  const plannedDuration = (segment.end - segment.start) / outputPlaybackRate;
  const { strategy, plan } = await resolveSizeLimitedPlan({
    controlMode,
    preset,
    advancedEncoder,
    advancedTwoPass,
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
  });

  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    return {
      path: outPath,
      size: existingSize,
      targetBytes: plan.targetBytes,
      attemptCount: 0,
      metTarget: existingSize <= plan.targetBytes,
      created: false,
      strategy,
    } satisfies SizeLimitedExecutionResult;
  }

  const result = await executeWithRetries({
    plan,
    strategy,
    buildAttempt: async (attempt) => {
      const attemptOutPath = makeAttemptPath(outPath, attempt.attemptNumber);
      const inputArgs = getSegmentInputArgs({ filePath, segment, outputPlaybackRate });

      if (strategy.executionMode === 'ffmpeg_two_pass') {
        const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
        const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
        const pass1Args = [
          '-hide_banner',
          ...inputArgs,
          ...getCpuH264Pass1Args({
            videoBitrate: attempt.videoBitrate,
            videoInputLabel: `0:${videoStream.index}`,
            ffmpegExperimental,
            rotation,
            passlogFile,
            outPath: pass1OutPath,
          }),
        ];

        const pass2Args = [
          '-hide_banner',
          ...inputArgs,
          ...getCpuH264Pass2Args({
            videoBitrate: attempt.videoBitrate,
            audioBitrate: attempt.audioBitrate,
            videoInputLabel: `0:${videoStream.index}`,
            audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
            ffmpegExperimental,
            rotation,
            passlogFile,
            outPath: attemptOutPath,
          }),
        ];

        appendFfmpegCommandLog(pass1Args);
        appendFfmpegCommandLog(pass2Args);
        return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
      }

      const ffmpegArgs = [
        '-hide_banner',
        ...inputArgs,
        ...getCommonEncodeArgs({
          strategy,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: `0:${videoStream.index}`,
          audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
          ffmpegExperimental,
          rotation,
          outPath: attemptOutPath,
        }),
      ];

      appendFfmpegCommandLog(ffmpegArgs);
      return { ffmpegArgs, outPath: attemptOutPath };
    },
    onProgress: (progress, metadata) => {
      onStageChange?.(metadata);
      onProgress(progress, metadata);
    },
  });

  if (result.path !== outPath) {
    await deleteIfExists(outPath);
    await renameWithRetry(result.path, outPath);
  }

  await transferTimestamps({
    inPath: filePath,
    outPath,
    cutFrom: segment.start,
    cutTo: segment.end,
    duration: sourceDuration,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
  });

  return { ...result, path: outPath };
}

export async function exportSizeLimitedMerge({
  filePath,
  outPath,
  segments,
  targetSizeMb,
  controlMode,
  preset,
  advancedEncoder,
  advancedTwoPass,
  videoStream,
  audioStream,
  enableOverwriteOutput,
  ffmpegExperimental,
  treatInputFileModifiedTimeAsStart,
  treatOutputFileModifiedTimeAsStart,
  outputPlaybackRate,
  rotation,
  appendFfmpegCommandLog,
  onProgress,
  onStageChange,
}: {
  filePath: string,
  outPath: string,
  segments: SegmentToExport[],
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  videoStream: Pick<FFprobeStream, 'index'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  onStageChange?: ((metadata: SizeLimitedProgressMetadata | undefined) => void) | undefined,
}) {
  await assertFileExists(filePath);
  await ensureOutputDir(outPath);

  const totalSourceDuration = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const plannedDuration = totalSourceDuration / outputPlaybackRate;
  const { strategy, plan } = await resolveSizeLimitedPlan({
    controlMode,
    preset,
    advancedEncoder,
    advancedTwoPass,
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
  });

  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    return {
      path: outPath,
      size: existingSize,
      targetBytes: plan.targetBytes,
      attemptCount: 0,
      metTarget: existingSize <= plan.targetBytes,
      created: false,
      strategy,
    } satisfies SizeLimitedExecutionResult;
  }

  const result = await executeWithRetries({
    plan,
    strategy,
    buildAttempt: async (attempt) => {
      const attemptOutPath = makeAttemptPath(outPath, attempt.attemptNumber);
      const inputArgs = getMergeInputArgs({ filePath, segments, outputPlaybackRate });
      const filterComplex = getConcatFilter({
        segments,
        videoStreamIndex: videoStream.index,
        audioStreamIndex: audioStream?.index,
      });

      const commonArgs = [
        ...inputArgs,
        '-filter_complex', filterComplex,
      ];

      if (strategy.executionMode === 'ffmpeg_two_pass') {
        const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
        const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
        const pass1Args = [
          '-hide_banner',
          ...commonArgs,
          ...getCpuH264Pass1Args({
            videoBitrate: attempt.videoBitrate,
            videoInputLabel: '[v]',
            ffmpegExperimental,
            rotation,
            passlogFile,
            outPath: pass1OutPath,
          }),
        ];

        const pass2Args = [
          '-hide_banner',
          ...commonArgs,
          ...getCpuH264Pass2Args({
            videoBitrate: attempt.videoBitrate,
            audioBitrate: attempt.audioBitrate,
            videoInputLabel: '[v]',
            audioInputLabel: audioStream != null ? '[a]' : undefined,
            ffmpegExperimental,
            rotation,
            passlogFile,
            outPath: attemptOutPath,
          }),
        ];

        appendFfmpegCommandLog(pass1Args);
        appendFfmpegCommandLog(pass2Args);
        return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
      }

      const ffmpegArgs = [
        '-hide_banner',
        ...commonArgs,
        ...getCommonEncodeArgs({
          strategy,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: '[v]',
          audioInputLabel: audioStream != null ? '[a]' : undefined,
          ffmpegExperimental,
          rotation,
          outPath: attemptOutPath,
        }),
      ];

      appendFfmpegCommandLog(ffmpegArgs);
      return { ffmpegArgs, outPath: attemptOutPath };
    },
    onProgress: (progress, metadata) => {
      onStageChange?.(metadata);
      onProgress(progress, metadata);
    },
  });

  if (result.path !== outPath) {
    await deleteIfExists(outPath);
    await renameWithRetry(result.path, outPath);
  }

  const mergedDuration = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  await transferTimestamps({
    inPath: filePath,
    outPath,
    duration: mergedDuration,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
  });

  return { ...result, path: outPath };
}
