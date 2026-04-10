import type { FFprobeStream } from '../../common/ffprobe.js';
import type {
  SizeLimitAdvancedAv1CpuPreset,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitControlMode,
  SizeLimitPreset,
  SizeLimitSimpleFps,
  SizeLimitSimpleResolution,
} from '../../common/types.js';
import { getExperimentalArgs, logStdoutStderr, runFfmpeg, runFfmpegWithProgress } from './ffmpeg';
import mainApi from './mainApi';
import { getResolvedVideoArgs, toKbitrateArg } from './sizeLimitedEncoderArgs';
import { finalizeSizeLimitedExecutionResult } from './sizeLimitedExecutionPolicy';
import { buildSizeLimitedVideoFilter, resolveSizeLimitedVideoProfile, sizeLimitedSwsFlags } from './sizeLimitedResolution';
import { getNextSizeLimitedRetryStep, planSizeLimitedEncode } from './sizeLimitedPlanner';
import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { OverlayClip, SegmentToExport, SizeLimitedEncoderCapabilities, SizeLimitedExecutionResult, SizeLimitedProgressMetadata, SizeLimitedResolvedStrategy, SizeLimitedRetryStep } from './types';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import { isMutedAudioGain } from './util/streams';
import { assertFileExists, readFileSize, renameWithRetry, transferTimestamps, unlinkWithRetry } from './util';
import { UserFacingError } from '../errors';
import { getRotatedVideoDimensions, renderTextOverlayPng } from './textOverlays';

const { access, constants: { W_OK }, mkdir, writeFile } = window.require('fs/promises');
const { dirname, join } = window.require('path');

const retryTempSuffix = 'clippress-size-limit';
const nvencProbeSource = 'color=c=black:s=640x360:r=30:d=0.2';
const nvencProbeFrames = '3';

let encoderCapabilitiesPromise: Promise<SizeLimitedEncoderCapabilities> | undefined;

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

function getSwsFlagsArgs() {
  return ['-sws_flags', sizeLimitedSwsFlags];
}

interface PreparedTextOverlayAsset {
  imagePath: string;
  x: number;
  y: number;
  start: number;
  end: number;
}

async function prepareTextOverlayAssets({
  overlayClips,
  outputDir,
  videoWidth,
  videoHeight,
  rotation,
}: {
  overlayClips: OverlayClip[],
  outputDir: string,
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
}) {
  const rotatedVideoDimensions = getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation });
  const assets: PreparedTextOverlayAsset[] = [];

  for (const [index, overlayClip] of overlayClips.entries()) {
    const width = Math.max(8, Math.round(rotatedVideoDimensions.width * overlayClip.box.width));
    const height = Math.max(8, Math.round(rotatedVideoDimensions.height * overlayClip.box.height));
    const imageData = await renderTextOverlayPng({ text: overlayClip.text, width, height });
    const imagePath = join(outputDir, `clippress-size-limit-text-overlay-${Date.now()}-${index}.png`);
    await writeFile(imagePath, imageData);
    assets.push({
      imagePath,
      x: Math.max(0, Math.round(rotatedVideoDimensions.width * overlayClip.box.x)),
      y: Math.max(0, Math.round(rotatedVideoDimensions.height * overlayClip.box.y)),
      start: overlayClip.start,
      end: overlayClip.end,
    });
  }

  return assets;
}

function buildSegmentTextOverlayFilter({
  videoStreamIndex,
  overlayAssets,
  segmentStart,
  segmentEnd,
  imageInputStartIndex,
  outputPlaybackRate,
  videoFilter,
}: {
  videoStreamIndex: number,
  overlayAssets: PreparedTextOverlayAsset[],
  segmentStart: number,
  segmentEnd: number,
  imageInputStartIndex: number,
  outputPlaybackRate: number,
  videoFilter: string | undefined,
}) {
  if (overlayAssets.length === 0) return undefined;

  const graph: string[] = [];
  let currentLabel = '[v0]';
  graph.push(`[0:${videoStreamIndex}]null${currentLabel}`);

  overlayAssets.forEach((overlayAsset, index) => {
    const relativeStart = Math.max(0, (Math.max(overlayAsset.start, segmentStart) - segmentStart) / outputPlaybackRate);
    const relativeEnd = Math.max(relativeStart, (Math.min(overlayAsset.end, segmentEnd) - segmentStart) / outputPlaybackRate);
    const nextLabel = index === overlayAssets.length - 1 && videoFilter == null ? '[v]' : `[v${index + 1}]`;
    graph.push(`${currentLabel}[${imageInputStartIndex + index}:v]overlay=${overlayAsset.x}:${overlayAsset.y}:enable='between(t,${relativeStart.toFixed(5)},${relativeEnd.toFixed(5)})'${nextLabel}`);
    currentLabel = nextLabel;
  });

  if (videoFilter != null) graph.push(`${currentLabel}${videoFilter}[v]`);

  return { filterComplex: graph.join(';'), videoInputLabel: '[v]' };
}

function getMergedOverlayAssets({
  overlayAssets,
  segments,
  outputPlaybackRate,
}: {
  overlayAssets: PreparedTextOverlayAsset[],
  segments: SegmentToExport[],
  outputPlaybackRate: number,
}) {
  const mergedAssets: PreparedTextOverlayAsset[] = [];
  let mergedCursor = 0;

  segments.forEach((segment) => {
    const segmentDuration = (segment.end - segment.start) / outputPlaybackRate;
    overlayAssets.forEach((overlayAsset) => {
      if (overlayAsset.start >= segment.end || overlayAsset.end <= segment.start) return;
      mergedAssets.push({
        ...overlayAsset,
        start: mergedCursor + ((Math.max(overlayAsset.start, segment.start) - segment.start) / outputPlaybackRate),
        end: mergedCursor + ((Math.min(overlayAsset.end, segment.end) - segment.start) / outputPlaybackRate),
      });
    });
    mergedCursor += segmentDuration;
  });

  return mergedAssets;
}

function getAudioArgs({ audioInputLabel, audioBitrate, audioGainDb }: {
  audioInputLabel: string | undefined,
  audioBitrate: number,
  audioGainDb?: number | undefined,
}) {
  if (audioInputLabel == null) return ['-an'];
  return [
    '-map', audioInputLabel,
    ...(audioGainDb != null && Math.abs(audioGainDb) >= 0.01 ? ['-filter:a', isMutedAudioGain(audioGainDb) ? 'volume=0' : `volume=${audioGainDb.toFixed(2)}dB`] : []),
    '-c:a', 'aac', '-b:a', toKbitrateArg(audioBitrate), '-ac', '2',
  ];
}

function getCommonEncodeArgs({
  strategy,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  videoProfile,
  ffmpegExperimental,
  rotation,
  outPath,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  outPath: string,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...getResolvedVideoArgs({ strategy, videoBitrate, twoPass: false, videoProfile, sourceFps, outputPlaybackRate }),
    ...(videoFilter != null ? ['-vf', videoFilter] : []),
    ...getRotationArgs(rotation),
    ...getAudioArgs({ audioInputLabel, audioBitrate, audioGainDb }),
    '-movflags', '+faststart',
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

function getTwoPassEncodeArgs({
  strategy,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  videoProfile,
  ffmpegExperimental,
  rotation,
  passlogFile,
  outPath,
  passNumber,
  sourceFps,
  outputPlaybackRate,
  audioGainDb,
}: {
  strategy: SizeLimitedResolvedStrategy,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  passlogFile: string,
  outPath: string,
  passNumber: 1 | 2,
  sourceFps: number | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...getResolvedVideoArgs({ strategy, videoBitrate, twoPass: true, videoProfile, sourceFps, outputPlaybackRate }),
    ...(videoFilter != null ? ['-vf', videoFilter] : []),
    '-pass', String(passNumber),
    '-passlogfile', passlogFile,
    ...getRotationArgs(rotation),
    ...(passNumber === 1 ? ['-an'] : getAudioArgs({ audioInputLabel, audioBitrate, audioGainDb })),
    ...(passNumber === 2 ? ['-movflags', '+faststart'] : []),
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

function getConcatFilter({ segments, videoStreamIndex, audioStreamIndex, videoProfile, overlayAssets, outputPlaybackRate }: {
  segments: SegmentToExport[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  overlayAssets?: PreparedTextOverlayAsset[] | undefined,
  outputPlaybackRate: number,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  const mergedOverlayAssets = overlayAssets != null
    ? getMergedOverlayAssets({ overlayAssets, segments, outputPlaybackRate })
    : [];
  const graph: string[] = [];
  const needsVideoPostProcessing = mergedOverlayAssets.length > 0 || videoFilter != null;
  const concatVideoLabel = needsVideoPostProcessing ? '[vconcat]' : '[v]';

  if (audioStreamIndex == null) {
    const labels = segments.map((_, index) => `[${index}:${videoStreamIndex}]`).join('');
    graph.push(`${labels}concat=n=${segments.length}:v=1:a=0${concatVideoLabel}`);
  } else {
    const labels = segments.map((_, index) => `[${index}:${videoStreamIndex}][${index}:${audioStreamIndex}]`).join('');
    graph.push(`${labels}concat=n=${segments.length}:v=1:a=1${concatVideoLabel}[a]`);
  }

  let currentLabel = concatVideoLabel;
  mergedOverlayAssets.forEach((overlayAsset, index) => {
    const nextLabel = index === mergedOverlayAssets.length - 1 && videoFilter == null ? '[v]' : `[v${index + 1}]`;
    graph.push(`${currentLabel}[${segments.length + index}:v]overlay=${overlayAsset.x}:${overlayAsset.y}:enable='between(t,${overlayAsset.start.toFixed(5)},${overlayAsset.end.toFixed(5)})'${nextLabel}`);
    currentLabel = nextLabel;
  });

  if (videoFilter != null) graph.push(`${currentLabel}${videoFilter}[v]`);

  return graph.join(';');
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
      const metTarget = size <= plan.hardTargetBytes;
      const candidate = {
        path: attemptFiles.outPath,
        size,
        targetBytes: plan.hardTargetBytes,
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

  if (bestResult != null && !bestResult.metTarget) {
    await deleteIfExists(bestResult.path);
  }

  return finalizeSizeLimitedExecutionResult(bestResult);
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
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  targetSizeMb,
  duration,
  hasAudio,
}: {
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  targetSizeMb: number,
  duration: number,
  hasAudio: boolean,
}) {
  const capabilities = await getSizeLimitedEncoderCapabilities();
  const strategy = resolveSizeLimitedStrategy({
    controlMode,
    preset,
    advancedEncoder,
    advancedTwoPass,
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
    capabilities,
  });
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
  resolution,
  fps,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  videoStream,
  audioStream,
  enableOverwriteOutput,
  ffmpegExperimental,
  treatInputFileModifiedTimeAsStart,
  treatOutputFileModifiedTimeAsStart,
  outputPlaybackRate,
  sourceFps,
  sourceRotation,
  rotation,
  appendFfmpegCommandLog,
  onProgress,
  onStageChange,
  audioGainDb,
  overlayClips,
  overlayVideoWidth,
  overlayVideoHeight,
}: {
  filePath: string,
  outPath: string,
  segment: SegmentToExport,
  sourceDuration: number | undefined,
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  videoStream: Pick<FFprobeStream, 'index' | 'width' | 'height'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  sourceFps: number | undefined,
  sourceRotation: number | undefined,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  onStageChange?: ((metadata: SizeLimitedProgressMetadata | undefined) => void) | undefined,
  audioGainDb?: number | undefined,
  overlayClips?: OverlayClip[] | undefined,
  overlayVideoWidth?: number | undefined,
  overlayVideoHeight?: number | undefined,
}) {
  await assertFileExists(filePath);
  await ensureOutputDir(outPath);

  const plannedDuration = (segment.end - segment.start) / outputPlaybackRate;
  const { strategy, plan } = await resolveSizeLimitedPlan({
    controlMode,
    preset,
    advancedEncoder,
    advancedTwoPass,
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
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
      targetBytes: plan.hardTargetBytes,
      attemptCount: 0,
      metTarget: existingSize <= plan.hardTargetBytes,
      created: false,
      strategy,
    } satisfies SizeLimitedExecutionResult;
  }

  const preparedOverlayAssets = overlayClips != null
    && overlayClips.length > 0
    && overlayVideoWidth != null
    && overlayVideoHeight != null
    ? await prepareTextOverlayAssets({
      overlayClips,
      outputDir: dirname(outPath),
      videoWidth: overlayVideoWidth,
      videoHeight: overlayVideoHeight,
      rotation: sourceRotation ?? rotation,
    })
    : [];

  let result: SizeLimitedExecutionResult;
  try {
    result = await executeWithRetries({
      plan,
      strategy,
      buildAttempt: async (attempt) => {
        const attemptOutPath = makeAttemptPath(outPath, attempt.attemptNumber);
        const inputArgs = getSegmentInputArgs({ filePath, segment, outputPlaybackRate });
        const videoProfile = resolveSizeLimitedVideoProfile({
          resolution,
          fps,
          sourceWidth: videoStream.width,
          sourceHeight: videoStream.height,
          rotation: sourceRotation ?? rotation,
          sourceFps,
          plannedVideoBitrate: attempt.videoBitrate,
        });
        const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
        const segmentOverlayAssets = preparedOverlayAssets.filter((overlayAsset) => overlayAsset.start < segment.end && overlayAsset.end > segment.start);
        const overlayInputArgs = segmentOverlayAssets.flatMap(({ imagePath }) => ['-loop', '1', '-i', imagePath]);
        const overlayFilter = buildSegmentTextOverlayFilter({
          videoStreamIndex: videoStream.index,
          overlayAssets: segmentOverlayAssets,
          segmentStart: segment.start,
          segmentEnd: segment.end,
          imageInputStartIndex: 1,
          outputPlaybackRate,
          videoFilter,
        });
        const commonArgs = [
          ...inputArgs,
          ...overlayInputArgs,
          ...(overlayFilter != null ? ['-filter_complex', overlayFilter.filterComplex] : []),
        ];
        const effectiveVideoProfile = overlayFilter != null
          ? { outputWidth: undefined, outputHeight: undefined, outputFps: undefined }
          : videoProfile;
        const videoInputLabel = overlayFilter?.videoInputLabel ?? `0:${videoStream.index}`;

        if (strategy.executionMode === 'ffmpeg_two_pass') {
          const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
          const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
          const pass1Args = [
            '-hide_banner',
            ...getSwsFlagsArgs(),
            ...commonArgs,
            ...getTwoPassEncodeArgs({
              strategy,
              videoBitrate: attempt.videoBitrate,
              audioBitrate: attempt.audioBitrate,
              videoInputLabel,
              audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
              videoProfile: effectiveVideoProfile,
              ffmpegExperimental,
              rotation,
              passlogFile,
              outPath: pass1OutPath,
              passNumber: 1,
              sourceFps,
              outputPlaybackRate,
              audioGainDb,
            }),
          ];

          const pass2Args = [
            '-hide_banner',
            ...getSwsFlagsArgs(),
            ...commonArgs,
            ...getTwoPassEncodeArgs({
              strategy,
              videoBitrate: attempt.videoBitrate,
              audioBitrate: attempt.audioBitrate,
              videoInputLabel,
              audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
              videoProfile: effectiveVideoProfile,
              ffmpegExperimental,
              rotation,
              passlogFile,
              outPath: attemptOutPath,
              passNumber: 2,
              sourceFps,
              outputPlaybackRate,
              audioGainDb,
            }),
          ];

          appendFfmpegCommandLog(pass1Args);
          appendFfmpegCommandLog(pass2Args);
          return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
        }

        const ffmpegArgs = [
          '-hide_banner',
          ...getSwsFlagsArgs(),
          ...commonArgs,
          ...getCommonEncodeArgs({
            strategy,
            videoBitrate: attempt.videoBitrate,
            audioBitrate: attempt.audioBitrate,
            videoInputLabel,
            audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
            videoProfile: effectiveVideoProfile,
            ffmpegExperimental,
            rotation,
            outPath: attemptOutPath,
            sourceFps,
            outputPlaybackRate,
            audioGainDb,
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
  } finally {
    await Promise.all(preparedOverlayAssets.map((asset) => deleteIfExists(asset.imagePath)));
  }

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
  resolution,
  fps,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  videoStream,
  audioStream,
  enableOverwriteOutput,
  ffmpegExperimental,
  treatInputFileModifiedTimeAsStart,
  treatOutputFileModifiedTimeAsStart,
  outputPlaybackRate,
  sourceFps,
  sourceRotation,
  rotation,
  appendFfmpegCommandLog,
  onProgress,
  onStageChange,
  audioGainDb,
  overlayClips,
  overlayVideoWidth,
  overlayVideoHeight,
}: {
  filePath: string,
  outPath: string,
  segments: SegmentToExport[],
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  videoStream: Pick<FFprobeStream, 'index' | 'width' | 'height'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  sourceFps: number | undefined,
  sourceRotation: number | undefined,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  onStageChange?: ((metadata: SizeLimitedProgressMetadata | undefined) => void) | undefined,
  audioGainDb?: number | undefined,
  overlayClips?: OverlayClip[] | undefined,
  overlayVideoWidth?: number | undefined,
  overlayVideoHeight?: number | undefined,
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
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
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
      targetBytes: plan.hardTargetBytes,
      attemptCount: 0,
      metTarget: existingSize <= plan.hardTargetBytes,
      created: false,
      strategy,
    } satisfies SizeLimitedExecutionResult;
  }

  const preparedOverlayAssets = overlayClips != null
    && overlayClips.length > 0
    && overlayVideoWidth != null
    && overlayVideoHeight != null
    ? await prepareTextOverlayAssets({
      overlayClips,
      outputDir: dirname(outPath),
      videoWidth: overlayVideoWidth,
      videoHeight: overlayVideoHeight,
      rotation: sourceRotation ?? rotation,
    })
    : [];

  let result: SizeLimitedExecutionResult;
  try {
    result = await executeWithRetries({
      plan,
      strategy,
      buildAttempt: async (attempt) => {
        const attemptOutPath = makeAttemptPath(outPath, attempt.attemptNumber);
        const inputArgs = getMergeInputArgs({ filePath, segments, outputPlaybackRate });
        const overlayInputArgs = preparedOverlayAssets.flatMap(({ imagePath }) => ['-loop', '1', '-i', imagePath]);
        const videoProfile = resolveSizeLimitedVideoProfile({
          resolution,
          fps,
          sourceWidth: videoStream.width,
          sourceHeight: videoStream.height,
          rotation: sourceRotation ?? rotation,
          sourceFps,
          plannedVideoBitrate: attempt.videoBitrate,
        });
        const filterComplex = getConcatFilter({
          segments,
          videoStreamIndex: videoStream.index,
          audioStreamIndex: audioStream?.index,
          videoProfile,
          overlayAssets: preparedOverlayAssets,
          outputPlaybackRate,
        });

        const commonArgs = [
          ...inputArgs,
          ...overlayInputArgs,
          '-filter_complex', filterComplex,
        ];

        if (strategy.executionMode === 'ffmpeg_two_pass') {
          const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
          const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
          const pass1Args = [
            '-hide_banner',
            ...getSwsFlagsArgs(),
            ...commonArgs,
            ...getTwoPassEncodeArgs({
              strategy,
              videoBitrate: attempt.videoBitrate,
              audioBitrate: attempt.audioBitrate,
              videoInputLabel: '[v]',
              audioInputLabel: audioStream != null ? '[a]' : undefined,
              videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
              ffmpegExperimental,
              rotation,
              passlogFile,
              outPath: pass1OutPath,
              passNumber: 1,
              sourceFps,
              outputPlaybackRate,
              audioGainDb,
            }),
          ];

          const pass2Args = [
            '-hide_banner',
            ...getSwsFlagsArgs(),
            ...commonArgs,
            ...getTwoPassEncodeArgs({
              strategy,
              videoBitrate: attempt.videoBitrate,
              audioBitrate: attempt.audioBitrate,
              videoInputLabel: '[v]',
              audioInputLabel: audioStream != null ? '[a]' : undefined,
              videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
              ffmpegExperimental,
              rotation,
              passlogFile,
              outPath: attemptOutPath,
              passNumber: 2,
              sourceFps,
              outputPlaybackRate,
              audioGainDb,
            }),
          ];

          appendFfmpegCommandLog(pass1Args);
          appendFfmpegCommandLog(pass2Args);
          return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
        }

        const ffmpegArgs = [
          '-hide_banner',
          ...getSwsFlagsArgs(),
          ...commonArgs,
          ...getCommonEncodeArgs({
            strategy,
            videoBitrate: attempt.videoBitrate,
            audioBitrate: attempt.audioBitrate,
            videoInputLabel: '[v]',
            audioInputLabel: audioStream != null ? '[a]' : undefined,
            videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
            ffmpegExperimental,
            rotation,
            outPath: attemptOutPath,
            sourceFps,
            outputPlaybackRate,
            audioGainDb,
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
  } finally {
    await Promise.all(preparedOverlayAssets.map((asset) => deleteIfExists(asset.imagePath)));
  }

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
