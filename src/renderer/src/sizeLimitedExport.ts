import type { FFprobeStream } from '../../common/ffprobe.js';
import type { SizeLimitQuality } from '../../common/types.js';
import { getExperimentalArgs, logStdoutStderr, runFfmpegWithProgress } from './ffmpeg';
import mainApi from './mainApi';
import { planSizeLimitedEncode } from './sizeLimitedPlanner';
import type { SegmentToExport, SizeLimitedExecutionResult } from './types';
import { assertFileExists, readFileSize, transferTimestamps, unlinkWithRetry } from './util';
import { UserFacingError } from '../errors';

const { access, constants: { W_OK }, mkdir } = window.require('fs/promises');
const { dirname } = window.require('path');

const retryTempSuffix = 'clippress-size-limit';

function getQualityPreset(quality: SizeLimitQuality) {
  return quality === 'high_quality' ? 'slow' : 'veryfast';
}

function toKbitrateArg(bitrate: number) {
  return `${Math.max(1, Math.floor(bitrate / 1000))}k`;
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

function getEncodeArgs({
  quality,
  videoBitrate,
  audioBitrate,
  videoInputLabel,
  audioInputLabel,
  ffmpegExperimental,
  rotation,
  pass,
  passlogFile,
  faststart = true,
  outPath,
}: {
  quality: SizeLimitQuality,
  videoBitrate: number,
  audioBitrate: number,
  videoInputLabel: string,
  audioInputLabel: string | undefined,
  ffmpegExperimental: boolean,
  rotation: number | undefined,
  pass?: 2 | undefined,
  passlogFile?: string | undefined,
  faststart?: boolean,
  outPath: string,
}) {
  return [
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', videoInputLabel,
    ...(audioInputLabel != null ? ['-map', audioInputLabel] : []),
    '-c:v', 'libx264',
    '-preset', getQualityPreset(quality),
    '-pix_fmt', 'yuv420p',
    '-b:v', toKbitrateArg(videoBitrate),
    '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.05))),
    '-bufsize', toKbitrateArg(Math.max(videoBitrate * 2, 1)),
    ...getRotationArgs(rotation),
    ...(audioInputLabel != null ? ['-c:a', 'aac', '-b:a', toKbitrateArg(audioBitrate), '-ac', '2'] : ['-an']),
    ...(pass != null ? ['-pass', String(pass), '-passlogfile', passlogFile ?? ''] : []),
    ...(faststart ? ['-movflags', '+faststart'] : []),
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

function getPass1Args({
  quality,
  videoBitrate,
  videoInputLabel,
  ffmpegExperimental,
  rotation,
  passlogFile,
  outPath,
}: {
  quality: SizeLimitQuality,
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
    '-preset', getQualityPreset(quality),
    '-pix_fmt', 'yuv420p',
    '-b:v', toKbitrateArg(videoBitrate),
    '-pass', '1',
    '-passlogfile', passlogFile,
    ...getRotationArgs(rotation),
    '-an',
    ...getExperimentalArgs(ffmpegExperimental),
    '-f', 'mp4',
    '-y', outPath,
  ];
}

async function runSinglePassEncode({
  ffmpegArgs,
  duration,
  onProgress,
}: {
  ffmpegArgs: string[],
  duration: number,
  onProgress: (progress: number) => void,
}) {
  const result = await runFfmpegWithProgress({ ffmpegArgs, duration, onProgress });
  logStdoutStderr(result);
}

async function runTwoPassEncode({
  pass1Args,
  pass2Args,
  duration,
  onProgress,
}: {
  pass1Args: string[],
  pass2Args: string[],
  duration: number,
  onProgress: (progress: number) => void,
}) {
  const pass1Result = await runFfmpegWithProgress({
    ffmpegArgs: pass1Args,
    duration,
    onProgress: (progress) => onProgress(progress / 2),
  });
  logStdoutStderr(pass1Result);

  const pass2Result = await runFfmpegWithProgress({
    ffmpegArgs: pass2Args,
    duration,
    onProgress: (progress) => onProgress(0.5 + (progress / 2)),
  });
  logStdoutStderr(pass2Result);
}

async function executeWithRetries({
  duration,
  targetSizeMb,
  hasAudio,
  quality,
  buildAttempt,
  onProgress,
}: {
  duration: number,
  targetSizeMb: number,
  hasAudio: boolean,
  quality: SizeLimitQuality,
  buildAttempt: (attempt: { videoBitrate: number, audioBitrate: number, attemptNumber: number }) => Promise<{ outPath: string, passlogFile?: string | undefined, pass1Args?: string[] | undefined, pass1OutPath?: string | undefined, ffmpegArgs: string[] }>,
  onProgress: (progress: number) => void,
}) {
  const plan = planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, quality });
  let bestResult: SizeLimitedExecutionResult | undefined;

  for (const retry of plan.retries) {
    const attemptFiles = await buildAttempt(retry);

    try {
      if (quality === 'high_quality') {
        const { pass1Args } = attemptFiles;
        if (pass1Args == null) throw new UserFacingError('2-pass encoding was not configured correctly');
        await runTwoPassEncode({ pass1Args, pass2Args: attemptFiles.ffmpegArgs, duration: plan.duration, onProgress });
      } else {
        await runSinglePassEncode({ ffmpegArgs: attemptFiles.ffmpegArgs, duration: plan.duration, onProgress });
      }

      const size = await readFileSize(attemptFiles.outPath);
      const metTarget = size <= plan.targetBytes;
      const candidate = {
        path: attemptFiles.outPath,
        size,
        targetBytes: plan.targetBytes,
        attemptCount: retry.attemptNumber,
        metTarget,
        created: true,
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
  quality,
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
}: {
  filePath: string,
  outPath: string,
  segment: SegmentToExport,
  sourceDuration: number | undefined,
  targetSizeMb: number,
  quality: SizeLimitQuality,
  videoStream: Pick<FFprobeStream, 'index'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number) => void,
}) {
  await assertFileExists(filePath);
  await ensureOutputDir(outPath);

  const plannedDuration = (segment.end - segment.start) / outputPlaybackRate;
  const { targetBytes } = planSizeLimitedEncode({
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
    quality,
  });

  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    return {
      path: outPath,
      size: existingSize,
      targetBytes,
      attemptCount: 0,
      metTarget: existingSize <= targetBytes,
      created: false,
    } satisfies SizeLimitedExecutionResult;
  }

  const result = await executeWithRetries({
    duration: plannedDuration,
    targetSizeMb,
    hasAudio: audioStream != null,
    quality,
    buildAttempt: async (attempt) => {
      const attemptOutPath = makeAttemptPath(outPath, attempt.attemptNumber);
      const inputArgs = getSegmentInputArgs({ filePath, segment, outputPlaybackRate });
      const ffmpegArgs = [
        '-hide_banner',
        ...inputArgs,
        ...getEncodeArgs({
          quality,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: `0:${videoStream.index}`,
          audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
          ffmpegExperimental,
          rotation,
          faststart: true,
          outPath: attemptOutPath,
        }),
      ];

      if (quality !== 'high_quality') {
        appendFfmpegCommandLog(ffmpegArgs);
        return { ffmpegArgs, outPath: attemptOutPath };
      }

      const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
      const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
      const pass1Args = [
        '-hide_banner',
        ...inputArgs,
        ...getPass1Args({
          quality,
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
        ...getEncodeArgs({
          quality,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: `0:${videoStream.index}`,
          audioInputLabel: audioStream != null ? `0:${audioStream.index}` : undefined,
          ffmpegExperimental,
          rotation,
          pass: 2,
          passlogFile,
          faststart: true,
          outPath: attemptOutPath,
        }),
      ];

      appendFfmpegCommandLog(pass1Args);
      appendFfmpegCommandLog(pass2Args);
      return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
    },
    onProgress,
  });

  if (result.path !== outPath) {
    await deleteIfExists(outPath);
    const { rename } = window.require('fs/promises');
    await rename(result.path, outPath);
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

export async function exportSizeLimitedMerge({
  filePath,
  outPath,
  segments,
  targetSizeMb,
  quality,
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
}: {
  filePath: string,
  outPath: string,
  segments: SegmentToExport[],
  targetSizeMb: number,
  quality: SizeLimitQuality,
  videoStream: Pick<FFprobeStream, 'index'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  enableOverwriteOutput: boolean,
  ffmpegExperimental: boolean,
  treatInputFileModifiedTimeAsStart: boolean,
  treatOutputFileModifiedTimeAsStart: boolean | null | undefined,
  outputPlaybackRate: number,
  rotation: number | undefined,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number) => void,
}) {
  await assertFileExists(filePath);
  await ensureOutputDir(outPath);

  const totalSourceDuration = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const plannedDuration = totalSourceDuration / outputPlaybackRate;
  const { targetBytes } = planSizeLimitedEncode({
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
    quality,
  });
  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    return {
      path: outPath,
      size: existingSize,
      targetBytes,
      attemptCount: 0,
      metTarget: existingSize <= targetBytes,
      created: false,
    } satisfies SizeLimitedExecutionResult;
  }

  const result = await executeWithRetries({
    duration: plannedDuration,
    targetSizeMb,
    hasAudio: audioStream != null,
    quality,
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

      const ffmpegArgs = [
        '-hide_banner',
        ...commonArgs,
        ...getEncodeArgs({
          quality,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: '[v]',
          audioInputLabel: audioStream != null ? '[a]' : undefined,
          ffmpegExperimental,
          rotation,
          faststart: true,
          outPath: attemptOutPath,
        }),
      ];

      if (quality !== 'high_quality') {
        appendFfmpegCommandLog(ffmpegArgs);
        return { ffmpegArgs, outPath: attemptOutPath };
      }

      const passlogFile = makePasslogPath(outPath, attempt.attemptNumber);
      const pass1OutPath = makePass1Path(outPath, attempt.attemptNumber);
      const pass1Args = [
        '-hide_banner',
        ...commonArgs,
        ...getPass1Args({
          quality,
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
        ...getEncodeArgs({
          quality,
          videoBitrate: attempt.videoBitrate,
          audioBitrate: attempt.audioBitrate,
          videoInputLabel: '[v]',
          audioInputLabel: audioStream != null ? '[a]' : undefined,
          ffmpegExperimental,
          rotation,
          pass: 2,
          passlogFile,
          faststart: true,
          outPath: attemptOutPath,
        }),
      ];

      appendFfmpegCommandLog(pass1Args);
      appendFfmpegCommandLog(pass2Args);
      return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
    },
    onProgress,
  });

  if (result.path !== outPath) {
    await deleteIfExists(outPath);
    const { rename } = window.require('fs/promises');
    await rename(result.path, outPath);
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
