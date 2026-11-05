import pMap from 'p-map';
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
  SizeLimitVideoFormat,
} from '../../common/types.js';
import { decodeText, getDuration, getExperimentalArgs, getFfmpegPath, logStdoutStderr, readPackets, runFfmpeg, runFfmpegWithProgress } from './ffmpeg';
import { canCopyLosslessly, estimateLosslessCopy, getLosslessCopyArgs, maxLosslessLeadIn } from './losslessFit';
import { hasSegmentCrop, getSegmentCropFilter } from './segmentCrop';
import mainApi from './mainApi';
import runSizeLimitedAttempts from './sizeLimitedAttempts';
import {
  getPassArtifactPaths,
  getSizeLimitedCommonEncodeArgs,
  getSizeLimitedRotationArgs,
  getSizeLimitedSwsFlagsArgs,
  getSizeLimitedTwoPassEncodeArgs,
} from './sizeLimitedFfmpegArgs';
import { buildSizeLimitedVideoFilter, fitVideoProfileToEncoder, getSizeLimitedDisplayDimensions, resolveSizeLimitedVideoProfile, targetLowFps } from './sizeLimitedResolution';
import { planSizeLimitedEncode, relaxQualityCapForGenerousBudget } from './sizeLimitedPlanner';
import { getGpuProbeVideoArgs, hasQualityCap } from './sizeLimitedEncoderArgs';
import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import { buildAudioMixFilter, buildConcatSegmentInputArgs, buildMergedOverlayFilters, buildOverlayImageInputArgs, buildSegmentConcatFilters, getRelativeSegmentOverlapWindow } from './exportSegmentMath';
import type { MixedAudioTrack } from './exportSegmentMath';
import { getAudioTempoFilter, getSegmentOutputDuration, getSegmentPlaybackRate, getVideoTimingFilter } from './segmentSpeed';
import type { OverlayClip, SegmentToExport, SizeLimitedEncoderCapabilities, SizeLimitedExecutionResult, SizeLimitedProgressMetadata, SizeLimitedResolvedStrategy, SizeLimitedRetryStep } from './types';
import type { SizeLimitedVideoTransformProfile } from './sizeLimitedResolution';
import { isMutedAudioGain, isNeutralAudioGain } from './util/streams';
import { assertFileExists, isAbortedError, isExecaError, isOutOfSpaceError, readFileSize, moveExportWithRetry, transferTimestamps, unlinkWithRetry } from './util';
import { UserFacingError } from '../errors';
import { assertOutPathsNotSource } from './util/sourceProtection';
import { getOverlayFontSize, getRotatedVideoDimensions, renderTextOverlayPng } from './textOverlays';
import createAsyncCache from './util/asyncCache';
import { getEncoderSizeRules, getGpuEncoderInfo, getGpuFramesDownloadFormat, getGpuFramesFilter, getHardwareDecodeArgs, gpuEncoderLabels, gpuEncoders, isGpuEncoderAvailable, runWithGpuFallbacksCore, shouldKeepFramesOnGpu, shouldUseHardwareDecode, withoutGpuEncoders } from './gpuEncoders';
import type { GpuEncoderName } from './gpuEncoders';
import { getTempWorkDir } from './util/tempFiles';
import { getEncodersToRetest, isSavedEncoderCheck } from './savedEncoderCheck';
import type { GpuCapability, SavedEncoderCheck } from './savedEncoderCheck';

const { access, constants: { W_OK }, mkdir, mkdtemp, rmdir, stat, writeFile } = window.require('fs/promises');
const { basename, dirname, join } = window.require('path');
const remote = window.require('@electron/remote');

const retryTempSuffix = 'clippress-size-limit';
// 1280x720 satisfies every vendor's alignment rules (AMD AV1 pads to 64x16 blocks).
const gpuProbeSource = 'color=c=black:s=1280x720:r=30:d=0.2';
const gpuProbeFrames = '3';
// Opening an encoder takes well under a second; a cold driver can take a few.
const gpuProbeTimeoutMs = 15_000;

function decodeProcessOutput({ stdout, stderr }: { stdout: Uint8Array, stderr: Uint8Array }) {
  return `${decodeText(stdout)}\n${decodeText(stderr)}`;
}

/**
 * Listing an encoder only means FFmpeg was built with it; opening one proves the GPU and driver support it. A test that
 * timed out isn't a sure answer.
 */
async function probeGpuEncoder(encoder: GpuEncoderName, videoArgs = ['-pix_fmt', 'nv12', '-c:v', encoder]) {
  const ffmpegArgs = [
    '-hide_banner',
    '-f', 'lavfi',
    '-i', gpuProbeSource,
    '-frames:v', gpuProbeFrames,
    '-an',
    ...videoArgs,
    '-f', 'null',
    '-',
  ];

  try {
    // A driver that hangs while opening the encoder must not hold up every export: it counts as unusable.
    await runFfmpeg(ffmpegArgs, { timeout: gpuProbeTimeoutMs }, { logCli: false });
    return { usable: true, sure: true };
  } catch (error) {
    // Abort stops the export that's waiting for this, rather than ruling the GPU out.
    if (isAbortedError(error) && !(isExecaError(error) && error.timedOut)) throw error;
    console.info(`${encoder} is not usable on this system`, error);
    return { usable: false, sure: !(isExecaError(error) && error.timedOut) };
  }
}

/**
 * Whether this FFmpeg runs SVT-AV1's real two-pass (8.1 and newer hand pass 2 the first pass's stats). An older one
 * writes an empty pass log, and its "two-pass" would be one pass done twice. A test that timed out isn't a sure answer.
 */
async function probeSvtTwoPass(): Promise<{ supported: boolean, sure: boolean }> {
  const logBase = join(getTempWorkDir(), `svt-two-pass-check-${Date.now()}`);
  const logPath = `${logBase}-0.log`;
  try {
    await runFfmpeg(['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.2', '-frames:v', '3', '-an', '-c:v', 'libsvtav1', '-preset', '12', '-b:v', '200k', '-pass', '1', '-passlogfile', logBase, '-f', 'null', '-'], { timeout: gpuProbeTimeoutMs }, { logCli: false });
    return { supported: (await stat(logPath)).size > 0, sure: true };
  } catch (error) {
    if (isAbortedError(error) && !(isExecaError(error) && error.timedOut)) throw error;
    console.info('SVT-AV1 two-pass is not available in this FFmpeg', error);
    return { supported: false, sure: !(isExecaError(error) && error.timedOut) };
  } finally {
    await unlinkWithRetry(logPath).catch(() => undefined);
  }
}

/**
 * Whether this FFmpeg runs x265's two-pass: `-x265-stats` names the stats file the passes share (the bundled 9.0 has it;
 * 8.0 and older releases don't). A test that timed out isn't a sure answer.
 */
async function probeX265TwoPass(): Promise<{ supported: boolean, sure: boolean }> {
  const statsPath = join(getTempWorkDir(), `x265-two-pass-check-${Date.now()}.log`);
  try {
    await runFfmpeg(['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.2', '-frames:v', '3', '-an', '-c:v', 'libx265', '-preset', 'ultrafast', '-b:v', '200k', '-x265-params', 'log-level=error', '-pass', '1', '-x265-stats', statsPath, '-f', 'null', '-'], { timeout: gpuProbeTimeoutMs }, { logCli: false });
    return { supported: (await stat(statsPath)).size > 0, sure: true };
  } catch (error) {
    if (isAbortedError(error) && !(isExecaError(error) && error.timedOut)) throw error;
    console.info('x265 two-pass is not available in this FFmpeg', error);
    return { supported: false, sure: !(isExecaError(error) && error.timedOut) };
  } finally {
    await Promise.all(getPassArtifactPaths(statsPath).map((path) => unlinkWithRetry(path).catch(() => undefined)));
  }
}

/**
 * Saves the answer for the next runs. "Usable" holds (an export that fails on it has the next run test again,
 * markGpuEncoderFailed); "unusable" holds for a maker with no card in this PC, and for a codec the card surely lacks
 * (getEncodersToRetest). The rest is tested again at the next run.
 */
async function saveEncoderCheck({ key, capabilities, listed, unsure, failedBefore }: {
  key: string,
  capabilities: SavedEncoderCheck['capabilities'],
  listed: (encoder: GpuEncoderName) => boolean,
  unsure: ReadonlySet<GpuCapability>,
  failedBefore: ReadonlySet<GpuCapability>,
}) {
  const adapters = await mainApi.getGpuAdapterVendors().catch(() => undefined);
  if (adapters == null) return;
  const retest = getEncodersToRetest({ capabilities, listed, unsure, failedBefore, adapters });
  const check: SavedEncoderCheck = { capabilities, retest };
  await mainApi.saveEncoderCheck(key, check).catch((error: unknown) => console.warn('Could not save the encoder check', error));
}

/**
 * Two FFmpeg runs at a time: a new FFmpeg's first runs are slow (on Windows its libraries are read for the first time),
 * and the twenty or so of the check all at once held up the clip being opened for minutes.
 */
async function runAFewAtATime(tasks: (() => Promise<void>)[]) {
  await pMap(tasks, (task) => task(), { concurrency: 2 });
}

// The test runs once per graphics card, driver, FFmpeg and ClipPress version, then is read back from disk (main
// process, encoderCheck.ts): nothing waits for it on later starts but the few encoders still to test again. Kept for
// the whole run; an export that fails on a GPU falls back to the next encoder.
const readEncoderCapabilities = createAsyncCache(async (key): Promise<SizeLimitedEncoderCapabilities> => {
  const cpuThreads = navigator.hardwareConcurrency || undefined;
  const saved = await mainApi.readSavedEncoderCheck(key).catch(() => undefined);
  const unsure = new Set<GpuCapability>();
  const basicOnly = new Set<GpuCapability>(isSavedEncoderCheck(saved) ? saved.capabilities.basicSettingsOnly : []);
  let hevcNvencUhq: boolean | undefined;
  // Whether the encoder opens at all, then whether it takes the tuned settings an export uses or only the basic ones,
  // then, for NVIDIA's HEVC, whether it takes the "ultra high quality" tuning too.
  const probe = async (encoder: GpuEncoderName, capability: GpuCapability) => {
    basicOnly.delete(capability);
    if (capability === 'hevcNvenc') hevcNvencUhq = false;
    const result = await probeGpuEncoder(encoder);
    if (!result.sure) unsure.add(capability);
    if (!result.usable) return false;
    if (!(await probeGpuEncoder(encoder, getGpuProbeVideoArgs(encoder))).usable) {
      basicOnly.add(capability);
    } else if (capability === 'hevcNvenc') {
      const uhq = await probeGpuEncoder(encoder, getGpuProbeVideoArgs(encoder, { nvencUhq: true }));
      hevcNvencUhq = uhq.usable;
      // A test that timed out has the next run test this encoder again.
      if (!uhq.sure) unsure.add(capability);
    }
    return true;
  };
  const withBasicOnly = (capabilities: SavedEncoderCheck['capabilities']) => ({ ...capabilities, basicSettingsOnly: gpuEncoders.flatMap(({ capability }) => (basicOnly.has(capability) ? [capability] : [])) });

  if (isSavedEncoderCheck(saved)) {
    if (saved.retest.length === 0) return { ...saved.capabilities, cpuThreads };
    const capabilities = { ...saved.capabilities };
    const retest = gpuEncoders.filter(({ capability }) => saved.retest.includes(capability));
    await runAFewAtATime(retest.map(({ encoder, capability }) => async () => { capabilities[capability] = await probe(encoder, capability); }));
    if (hevcNvencUhq != null) capabilities.hevcNvencUhq = hevcNvencUhq;
    saveEncoderCheck({ key, capabilities: withBasicOnly(capabilities), listed: (encoder) => retest.some((info) => info.encoder === encoder), unsure, failedBefore: new Set(saved.retest) }).catch(() => undefined);
    return { ...withBasicOnly(capabilities), cpuThreads };
  }

  const result = await runFfmpeg(['-hide_banner', '-encoders'], undefined, { logCli: false });
  const encoders = parseFfmpegEncoderNames(decodeProcessOutput(result));
  const capabilities: SavedEncoderCheck['capabilities'] = {
    h264Nvenc: false,
    av1Nvenc: false,
    libx264: encoders.has('libx264'),
    libx265: encoders.has('libx265'),
    libsvtav1: encoders.has('libsvtav1'),
  };
  let svtTwoPassSure = true;
  let x265TwoPassSure = true;
  // Only the encoders of the graphics card makers in this PC (all of them when that's unknown): the others can't open.
  const adapters = await mainApi.getGpuAdapterVendors().catch(() => undefined);
  const isPresent = (vendor: (typeof gpuEncoders)[number]['vendor']) => adapters == null || adapters.length === 0 || adapters.includes(vendor);
  await runAFewAtATime([
    ...gpuEncoders.map(({ encoder, vendor, capability }) => async () => {
      capabilities[capability] = encoders.has(encoder) && isPresent(vendor) && await probe(encoder, capability);
    }),
    async () => {
      const svt = capabilities.libsvtav1 ? await probeSvtTwoPass() : { supported: false, sure: true };
      capabilities.svtTwoPass = svt.supported;
      svtTwoPassSure = svt.sure;
    },
    async () => {
      const x265 = capabilities.libx265 ? await probeX265TwoPass() : { supported: false, sure: true };
      capabilities.x265TwoPass = x265.supported;
      x265TwoPassSure = x265.sure;
    },
  ]);
  capabilities.hevcNvencUhq = hevcNvencUhq ?? false;
  // Saved in the background: the answer is used now. A two-pass test that timed out (a busy PC) holds for this run
  // only: the next one tests everything again.
  if (svtTwoPassSure && x265TwoPassSure) saveEncoderCheck({ key, capabilities: withBasicOnly(capabilities), listed: (encoder) => encoders.has(encoder), unsure, failedBefore: new Set() }).catch(() => undefined);
  return { ...withBasicOnly(capabilities), cpuThreads };
});

/**
 * GPU paths that failed during a real export this session. A probe can pass while a driver
 * still rejects the export's settings, so a failed encoder is skipped from then on.
 */
const failedGpuEncoders = new Set<GpuEncoderName>();
/** GPU encoders whose tuned settings failed in a real export this session: they keep to their basic ones. */
const basicSettingsGpuEncoders = new Set<GpuEncoderName>();
/**
 * What the export now running found failing, used for its next tries but kept only if it then works another way:
 * when nothing works (a full disk, a gone source), the GPU wasn't at fault.
 */
const pendingFailedGpuEncoders = new Set<GpuEncoderName>();
const pendingBasicSettingsGpuEncoders = new Set<GpuEncoderName>();
/** NVIDIA HEVC's "ultra high quality" tuning failed in a real export: the tuned "hq" settings from then on. */
let nvencUhqFailed = false;
let pendingNvencUhqFailed = false;
let hardwareDecodeFailed = false;

export async function getSizeLimitedEncoderCapabilities(): Promise<SizeLimitedEncoderCapabilities> {
  const path = getFfmpegPath();
  const { size, mtimeMs } = await stat(path);
  // External FFmpeg can be selected or replaced while the application is running.
  const capabilities = await readEncoderCapabilities(`${path}:${size}:${mtimeMs}`);
  const failed = new Set([...failedGpuEncoders, ...pendingFailedGpuEncoders]);
  const basic = new Set([...basicSettingsGpuEncoders, ...pendingBasicSettingsGpuEncoders]);
  const noUhq = nvencUhqFailed || pendingNvencUhqFailed;
  if (failed.size === 0 && basic.size === 0 && !noUhq) return capabilities;
  const usable = { ...capabilities, ...(noUhq ? { hevcNvencUhq: false } : {}) };
  for (const encoder of failed) {
    const info = getGpuEncoderInfo(encoder);
    if (info != null) usable[info.capability] = false;
  }
  const basicOnly = gpuEncoders.filter(({ encoder, capability }) => basic.has(encoder) || capabilities.basicSettingsOnly?.includes(capability));
  usable.basicSettingsOnly = basicOnly.map(({ capability }) => capability);
  return usable;
}

/**
 * FFmpeg and ffprobe once each, a version check and a one-frame encode and decode: a new FFmpeg's first runs are slow
 * on Windows (its libraries are read for the first time: the first filmstrip took 1.4 s instead of 0.33 s, and an HEVC
 * recording's never finished), so they happen here, before a clip needs them.
 */
async function warmUpFfmpeg() {
  const path = join(getTempWorkDir(), `warm-up-${Date.now()}.mkv`);
  try {
    await runFfmpeg(['-hide_banner', '-version'], { timeout: 60_000 }, { logCli: false });
    await runFfmpeg(['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=128x72:r=30:d=0.1', '-frames:v', '1', '-c:v', 'mpeg4', '-y', path], { timeout: 60_000 }, { logCli: false });
    await getDuration(path);
    await runFfmpeg(['-hide_banner', '-v', 'error', '-i', path, '-f', 'null', '-'], { timeout: 60_000 }, { logCli: false });
  } finally {
    await unlinkWithRetry(path).catch(() => undefined);
  }
}

/**
 * At the first start with a new FFmpeg, ClipPress or graphics driver (no encoder check saved for them): FFmpeg is
 * warmed up, then the encoders are checked, in the background while the start screen shows, so the first clip opened
 * and the first export don't wait for either. Each step waits while a clip is opening (`whenIdle`): its own first runs
 * warm FFmpeg up too. Later starts read the saved check and do nothing here.
 */
export async function prepareNewFfmpeg(whenIdle: () => Promise<void>) {
  const path = getFfmpegPath();
  const { size, mtimeMs } = await stat(path);
  if (isSavedEncoderCheck(await mainApi.readSavedEncoderCheck(`${path}:${size}:${mtimeMs}`).catch(() => undefined))) return;
  await whenIdle();
  // A warm-up that failed (an FFmpeg folder without ffprobe, a clip's load aborted) still leaves the check to do.
  await warmUpFfmpeg().catch((error: unknown) => console.warn('Could not warm up FFmpeg', error));
  await whenIdle();
  // For the FFmpeg chosen now: a custom folder may have been picked meanwhile.
  await getSizeLimitedEncoderCapabilities();
}

/**
 * Finds the usable encoders in the background (read back from disk, or the first time a handful of short test
 * encodes, ~2 s), so an export doesn't wait for it.
 */
export function prefetchEncoderCapabilities() {
  getSizeLimitedEncoderCapabilities().catch((error: unknown) => console.warn('Could not check the encoders', error));
}

export function canUseHardwareDecode({ enabled, inputCount, width, height }: {
  enabled: boolean,
  inputCount: number,
  width: number | undefined,
  height: number | undefined,
}) {
  return shouldUseHardwareDecode({ platform: process.platform, enabled: enabled && !hardwareDecodeFailed, inputCount, width, height });
}

/** FFmpeg exited with an error that was not a user cancel or a full disk: worth one more try another way. */
function isRetryableEncodeFailure(error: unknown) {
  return isExecaError(error) && !isAbortedError(error) && !isOutOfSpaceError(error);
}

/** The export worked another way, so what failed on the way was at fault: kept for the session. */
function keepPendingGpuDemotions() {
  if (pendingNvencUhqFailed) nvencUhqFailed = true;
  pendingBasicSettingsGpuEncoders.forEach((encoder) => basicSettingsGpuEncoders.add(encoder));
  if (pendingFailedGpuEncoders.size === 0) return;
  pendingFailedGpuEncoders.forEach((encoder) => failedGpuEncoders.add(encoder));
  // The next run tests the encoders again.
  mainApi.forgetEncoderCheck().catch((error: unknown) => console.warn('Could not forget the encoder check', error));
}

/** See {@link runWithGpuFallbacksCore}; failures that were not user cancels are retried. */
export async function runWithGpuFallbacks<T>(args: Omit<Parameters<typeof runWithGpuFallbacksCore<T>>[0], 'isRetryableFailure' | 'onHardwareDecodeFailed'>) {
  try {
    const result = await runWithGpuFallbacksCore({
      ...args,
      isRetryableFailure: isRetryableEncodeFailure,
      onHardwareDecodeFailed: () => { hardwareDecodeFailed = true; },
    });
    keepPendingGpuDemotions();
    return result;
  } finally {
    pendingFailedGpuEncoders.clear();
    pendingBasicSettingsGpuEncoders.clear();
    pendingNvencUhqFailed = false;
  }
}

/** Sources whose frames couldn't stay on the GPU (a codec it doesn't decode, which FFmpeg then decodes on the CPU). */
const gpuFramesFailed = new Set<string>();

/**
 * The format a sped-up export's frames are copied off the GPU in, when they can stay there until `fps` has dropped
 * the unkept ones (`getGpuFramesFilter`); undefined when they're copied off as they're decoded.
 */
function getGpuFramesFormat({ videoStream, clips, rotation, sourceFps }: {
  videoStream: Pick<FFprobeStream, 'codec_name' | 'pix_fmt'>,
  clips: { rate: number, duration: number }[],
  rotation: number | undefined,
  sourceFps: number | undefined,
}) {
  // The export's frame rate is the source's, or lowered to 30 for some sizes.
  const lowestFps = sourceFps != null ? Math.min(sourceFps, targetLowFps) : undefined;
  if (!shouldKeepFramesOnGpu({ clips, rotation, lowestFps })) return undefined;
  if (gpuFramesFailed.has(`${videoStream.codec_name}/${videoStream.pix_fmt}`)) return undefined;
  return getGpuFramesDownloadFormat(videoStream.pix_fmt);
}

/** Runs with the frames on the GPU when they can be, and if FFmpeg fails that way, once more with them copied off. */
async function runKeepingFramesOnGpu<T>({ videoStream, gpuFramesFormat, run }: {
  videoStream: Pick<FFprobeStream, 'codec_name' | 'pix_fmt'>,
  gpuFramesFormat: string | undefined,
  run: (format: string | undefined) => Promise<T>,
}) {
  if (gpuFramesFormat == null) return run(undefined);
  try {
    return await run(gpuFramesFormat);
  } catch (error) {
    if (!isRetryableEncodeFailure(error)) throw error;
    console.warn('Export failed with its frames kept on the GPU; retrying with them copied off as they are decoded', error);
  }
  const result = await run(undefined);
  // Only now is it clear the frames on the GPU were the problem (not, say, the encoder).
  gpuFramesFailed.add(`${videoStream.codec_name}/${videoStream.pix_fmt}`);
  return result;
}

/** Within {@link runWithGpuFallbacks}: the next tries skip this encoder, and so does the session if one then works. */
export function markGpuEncoderFailed(encoder: GpuEncoderName) {
  pendingFailedGpuEncoders.add(encoder);
}

/** Within {@link runWithGpuFallbacks}: the next tries use this encoder's basic settings (the session too, if they work). */
export function markGpuEncoderBasicOnly(encoder: GpuEncoderName) {
  pendingBasicSettingsGpuEncoders.add(encoder);
}

function assertStrategySupported({ strategy, capabilities }: {
  strategy: SizeLimitedResolvedStrategy,
  capabilities: SizeLimitedEncoderCapabilities,
}) {
  if (strategy.encoder === 'libx264' && !capabilities.libx264) {
    throw new UserFacingError('Size-limited export could not find a usable H.264 encoder.');
  }
  if (strategy.encoder === 'libx265' && capabilities.libx265 !== true) {
    throw new UserFacingError('Size-limited export could not find a usable HEVC encoder.');
  }
  if (strategy.encoder === 'libsvtav1' && !capabilities.libsvtav1) {
    throw new UserFacingError('Size-limited export could not find a usable AV1 encoder.');
  }
  const gpu = getGpuEncoderInfo(strategy.encoder);
  if (gpu != null && !isGpuEncoderAvailable(capabilities, gpu.encoder)) {
    throw new UserFacingError(`Size-limited export could not use the ${gpuEncoderLabels[gpu.encoder]} encoder on this system.`);
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

/**
 * Every export reads from exactly one file, and nothing in this module may delete or
 * replace it. The naming layers upstream already refuse to produce such a destination;
 * this is the innermost check, sitting directly on top of the calls that unlink and
 * rename, so a future caller cannot reintroduce the failure mode by constructing an
 * `outPath` some other way.
 */
async function assertOutPathIsNotSource({ outPath, filePath }: { outPath: string, filePath: string }) {
  await assertOutPathsNotSource({ outPaths: [outPath], protectedPaths: [filePath], message: 'ClipPress will not export onto the file it is reading from. Choose a different output name or folder.' });
}

/**
 * A finished export that couldn't take its name is made in ClipPress's temporary folder, which is emptied once this
 * run has ended: moved beside its destination under a temporary name, else into ClipPress's own folder, so it
 * survives. Where it stays if both fail.
 */
async function keepFinishedExport(path: string, outPath: string) {
  const stamp = `${process.pid}-${Date.now()}`;
  // Shortened, so the added words don't push a long name past Windows' 255 characters.
  const name = basename(outPath, '.mp4').slice(0, 180);
  const candidates = [
    join(dirname(outPath), `${name} (kept ${stamp}).mp4`),
    join(remote.app.getPath('userData'), 'Kept exports', `${name} (${stamp}).mp4`),
  ];
  for (const candidate of candidates) {
    try {
      // One after the other: the second only if the first can't be used.
      // eslint-disable-next-line no-await-in-loop
      await mkdir(dirname(candidate), { recursive: true });
      // eslint-disable-next-line no-await-in-loop
      await moveExportWithRetry(path, candidate, false);
      // eslint-disable-next-line no-await-in-loop
      await rmdir(dirname(path)).catch(() => undefined);
      return candidate;
    } catch (err) {
      console.warn('Could not keep the finished export at', candidate, err);
    }
  }
  return path;
}

/**
 * Moves the finished encode into place.
 *
 * The encode itself is complete and usable by this point, so a failure here is a
 * post-processing problem, not an export failure: we keep the encoded file where it is
 * and report the problem, rather than throwing away a good file and telling the user the
 * export failed.
 */
async function finalizeEncodedOutput({ result, outPath, filePath, enableOverwriteOutput }: {
  result: SizeLimitedExecutionResult,
  outPath: string,
  filePath: string,
  enableOverwriteOutput: boolean,
}): Promise<{ result: SizeLimitedExecutionResult, postProcessingWarning?: string | undefined }> {
  if (result.path === outPath) return { result };

  try {
    await assertOutPathIsNotSource({ outPath, filePath });
    await moveExportWithRetry(result.path, outPath, enableOverwriteOutput);
    await rmdir(dirname(result.path)).catch(() => undefined);
    return { result: { ...result, path: outPath } };
  } catch (err) {
    console.warn('Failed to move the finished export into place', result.path, outPath, err);
    const keptPath = await keepFinishedExport(result.path, outPath);
    return {
      result: { ...result, path: keptPath },
      postProcessingWarning: 'The export finished, but ClipPress could not give it the final file name. The file was kept under a temporary name.',
    };
  }
}

/** A Cancel that came as the last run finished: the finished file doesn't take its place, nor stay in the temporary folder. */
async function discardIfCancelled({ result, outPath, signal }: { result: SizeLimitedExecutionResult, outPath: string, signal: AbortSignal | undefined }) {
  if (signal?.aborted !== true) return;
  if (result.path !== outPath) {
    await deleteIfExists(result.path);
    await rmdir(dirname(result.path)).catch(() => undefined);
  }
  signal.throwIfAborted();
}

async function deletePassArtifacts(basePath: string | undefined) {
  if (basePath == null) return;
  await Promise.all(getPassArtifactPaths(basePath).map((artifact) => deleteIfExists(artifact)));
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
  videoWidth,
  videoHeight,
  rotation,
}: {
  overlayClips: OverlayClip[],
  videoWidth: number,
  videoHeight: number,
  rotation: number | undefined,
}) {
  const rotatedVideoDimensions = getRotatedVideoDimensions({ width: videoWidth, height: videoHeight, rotation });
  const assets: PreparedTextOverlayAsset[] = [];

  try {
    for (const [index, overlayClip] of overlayClips.entries()) {
      const width = Math.max(8, Math.round(rotatedVideoDimensions.width * overlayClip.box.width));
      const imageData = await renderTextOverlayPng({ text: overlayClip.text, width, fontSize: getOverlayFontSize(overlayClip) * rotatedVideoDimensions.height });
      // In ClipPress's temporary folder, so nothing appears next to the export while it runs.
      const imagePath = join(getTempWorkDir(), `size-limit-text-overlay-${Date.now()}-${index}.png`);
      try {
        await writeFile(imagePath, imageData, { flag: 'wx' });
      } catch (err) {
        // A partly written image is ours to remove, but not a file that was already there.
        if (!(err instanceof Error && 'code' in err && err.code === 'EEXIST')) await deleteIfExists(imagePath);
        throw err;
      }
      assets.push({
        imagePath,
        x: Math.max(0, Math.round(rotatedVideoDimensions.width * overlayClip.box.x)),
        y: Math.max(0, Math.round(rotatedVideoDimensions.height * overlayClip.box.y)),
        start: overlayClip.start,
        end: overlayClip.end,
      });
    }
  } catch (err) {
    // The export, which removes these images when it finishes, never starts.
    await Promise.all(assets.map(({ imagePath }) => deleteIfExists(imagePath)));
    throw err;
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
  cropFilter,
  gpuFramesFilter,
}: {
  videoStreamIndex: number,
  overlayAssets: PreparedTextOverlayAsset[],
  segmentStart: number,
  segmentEnd: number,
  imageInputStartIndex: number,
  outputPlaybackRate: number,
  videoFilter: string | undefined,
  cropFilter: string | undefined,
  gpuFramesFilter: string | undefined,
}) {
  if (overlayAssets.length === 0) return undefined;

  const graph: string[] = [];
  let currentLabel = '[v0]';
  graph.push(`[0:${videoStreamIndex}]${[getVideoTimingFilter(outputPlaybackRate), gpuFramesFilter, cropFilter].filter(Boolean).join(',')}${currentLabel}`);

  overlayAssets.forEach((overlayAsset, index) => {
    const overlapWindow = getRelativeSegmentOverlapWindow({
      overlayStart: overlayAsset.start,
      overlayEnd: overlayAsset.end,
      segmentStart,
      segmentEnd,
      outputPlaybackRate,
    });
    if (overlapWindow == null) return;
    const nextLabel = index === overlayAssets.length - 1 && videoFilter == null ? '[v]' : `[v${index + 1}]`;
    graph.push(`${currentLabel}[${imageInputStartIndex + index}:v]overlay=${overlayAsset.x}:${overlayAsset.y}:enable='between(t,${overlapWindow.start.toFixed(5)},${overlapWindow.end.toFixed(5)})'${nextLabel}`);
    currentLabel = nextLabel;
  });

  if (videoFilter != null) graph.push(`${currentLabel}${videoFilter}[v]`);

  return { filterComplex: graph.join(';'), videoInputLabel: '[v]' };
}

function getSegmentInputArgs({ filePath, segment, rotation, hardwareDecode, keepFramesOnGpu }: {
  filePath: string,
  segment: SegmentToExport,
  rotation: number | undefined,
  hardwareDecode: boolean,
  keepFramesOnGpu: boolean,
}) {
  return [
    ...getHardwareDecodeArgs(hardwareDecode, keepFramesOnGpu),
    '-ss', segment.start.toFixed(5),
    '-t', (segment.end - segment.start).toFixed(5),
    ...getSizeLimitedRotationArgs(rotation),
    '-i', filePath,
  ];
}

function getMergeInputArgs({ filePath, segments, rotation, hardwareDecode, keepFramesOnGpu }: {
  filePath: string,
  segments: SegmentToExport[],
  rotation: number | undefined,
  hardwareDecode: boolean,
  keepFramesOnGpu: boolean,
}) {
  return buildConcatSegmentInputArgs({ filePath, segments, rotation, decodeArgs: getHardwareDecodeArgs(hardwareDecode, keepFramesOnGpu) });
}

interface ResolvedSizeLimitedPlan { strategy: SizeLimitedResolvedStrategy, plan: ReturnType<typeof planSizeLimitedEncode> }

/**
 * After a Simple preset's GPU encoder fails mid-export, plans the same export on the next
 * encoder in line (another GPU, then the CPU). Undefined when there is nothing to fall back to.
 */
/** An attempt's video profile, fitted to what its encoder takes (AMD AV1's block alignment, GPU H.264's 4096). */
function resolveAttemptVideoProfile(args: Parameters<typeof resolveSizeLimitedVideoProfile>[0], encoder: SizeLimitedResolvedStrategy['encoder']) {
  return fitVideoProfileToEncoder({
    videoProfile: resolveSizeLimitedVideoProfile(args),
    displayDimensions: getSizeLimitedDisplayDimensions(args),
    rules: getEncoderSizeRules(encoder),
  });
}

async function resolveNextEncoder(strategy: SizeLimitedResolvedStrategy, resolve: () => Promise<ResolvedSizeLimitedPlan>) {
  const gpu = getGpuEncoderInfo(strategy.encoder);
  if (gpu == null) return undefined;
  if (strategy.nvencUhq) {
    // The "ultra high quality" tuning first: the same encoder with "hq" keeps the rest of the tuned settings.
    pendingNvencUhqFailed = true;
  } else if (!strategy.basicEncoderSettings) {
    // An older card or driver may turn down only the tuned settings: the same encoder again with its basic ones, which
    // is far quicker than moving to the CPU (and keeps the encoder chosen in advanced mode).
    markGpuEncoderBasicOnly(gpu.encoder);
  } else {
    if (strategy.controlMode !== 'simple') return undefined;
    markGpuEncoderFailed(gpu.encoder);
  }
  try {
    const next = await resolve();
    console.warn(`${gpu.encoder} failed during export; continuing with ${next.strategy.encoder}${next.strategy.basicEncoderSettings ? ' (basic settings)' : ''}`);
    return next;
  } catch (error) {
    console.warn('No other encoder is available', error);
    return undefined;
  }
}

function getConcatFilter({ segments, videoStreamIndex, audioStreamIndex, videoProfile, overlayAssets, outputPlaybackRate, audioGainDb, videoWidth, videoHeight, gpuFramesFormat, mixedAudioTracks }: {
  segments: SegmentToExport[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  videoProfile: SizeLimitedVideoTransformProfile,
  overlayAssets?: PreparedTextOverlayAsset[] | undefined,
  outputPlaybackRate: number,
  audioGainDb?: number | undefined,
  videoWidth: number,
  videoHeight: number,
  gpuFramesFormat: string | undefined,
  /** Two or more audio tracks mixed into one, each at its own track volume (instead of `audioGainDb`). */
  mixedAudioTracks: readonly MixedAudioTrack[] | undefined,
}) {
  const videoFilter = buildSizeLimitedVideoFilter({ videoProfile });
  const mergedOverlayFilters = buildMergedOverlayFilters({
    overlayAssets: overlayAssets ?? [],
    segments,
    outputPlaybackRate,
    imageInputStartIndex: segments.length,
    videoInputLabel: '[vconcat]',
    videoOutputLabel: videoFilter != null ? '[voverlay]' : '[v]',
  });
  const gpuFrames = gpuFramesFormat != null ? { downloadFormat: gpuFramesFormat, outputFps: videoProfile.outputFps } : undefined;
  const { graph, labels } = buildSegmentConcatFilters({ segments, videoStreamIndex, audioStreamIndex, outputPlaybackRate, videoWidth, videoHeight, gpuFrames, mixedAudioTracks });
  const needsVideoPostProcessing = mergedOverlayFilters.graph.length > 0 || videoFilter != null;
  const concatVideoLabel = needsVideoPostProcessing ? '[vconcat]' : '[v]';
  // Mixed tracks had their volumes applied one by one, before the mix.
  const needsAudioPostProcessing = audioStreamIndex != null && mixedAudioTracks == null && !isNeutralAudioGain(audioGainDb);
  const concatAudioLabel = needsAudioPostProcessing ? '[aconcat]' : '[a]';

  if (audioStreamIndex == null) {
    graph.push(`${labels}concat=n=${segments.length}:v=1:a=0${concatVideoLabel}`);
  } else {
    graph.push(`${labels}concat=n=${segments.length}:v=1:a=1${concatVideoLabel}${concatAudioLabel}`);
  }

  graph.push(...mergedOverlayFilters.graph);
  if (videoFilter != null) graph.push(`${mergedOverlayFilters.videoOutputLabel}${videoFilter}[v]`);
  if (needsAudioPostProcessing) {
    const resolvedAudioGainDb = audioGainDb ?? 0;
    graph.push(`${concatAudioLabel}${isMutedAudioGain(resolvedAudioGainDb) ? 'volume=0' : `volume=${resolvedAudioGainDb.toFixed(2)}dB`}[a]`);
  }

  return graph.join(';');
}

function makeProgressMetadata({
  attemptNumber,
  maxAttempts,
  phaseNumber,
  phaseCount,
  retryReason,
}: SizeLimitedProgressMetadata) {
  return { attemptNumber, maxAttempts, phaseNumber, phaseCount, retryReason } satisfies SizeLimitedProgressMetadata;
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

/**
 * How much of a two-pass encode's time the first pass takes: ~28% for SVT-AV1, ~30% for x264 and ~23% for x265 with
 * its quicker first pass (measured).
 */
function getFirstPassShare(encoder: SizeLimitedResolvedStrategy['encoder']) {
  return encoder === 'libx265' ? 0.23 : 0.3;
}

async function runTwoPassEncode({
  firstPassShare,
  pass1Args,
  pass2Args,
  duration,
  onProgress,
  pass1ProgressMetadata,
  pass2ProgressMetadata,
  signal,
}: {
  firstPassShare: number,
  pass1Args: string[],
  pass2Args: string[],
  duration: number,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  pass1ProgressMetadata: SizeLimitedProgressMetadata,
  pass2ProgressMetadata: SizeLimitedProgressMetadata,
  signal?: AbortSignal | undefined,
}) {
  const pass1Result = await runFfmpegWithProgress({
    ffmpegArgs: pass1Args,
    duration,
    onProgress: (progress) => onProgress(progress * firstPassShare, pass1ProgressMetadata),
  });
  logStdoutStderr(pass1Result);

  // A Cancel that came as the first pass ended.
  signal?.throwIfAborted();
  const pass2Result = await runFfmpegWithProgress({
    ffmpegArgs: pass2Args,
    duration,
    onProgress: (progress) => onProgress(firstPassShare + (progress * (1 - firstPassShare)), pass2ProgressMetadata),
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

async function executeAttempts({
  plan,
  strategy,
  buildAttempt,
  onProgress,
  signal,
}: {
  plan: ReturnType<typeof planSizeLimitedEncode>,
  strategy: SizeLimitedResolvedStrategy,
  buildAttempt: (attempt: SizeLimitedRetryStep, tempPath?: string) => Promise<AttemptFiles>,
  onProgress: (progress: number, metadata?: SizeLimitedProgressMetadata) => void,
  /** Cancel: FFmpeg is stopped while it runs; this catches a Cancel between its runs. */
  signal?: AbortSignal | undefined,
}) {
  return runSizeLimitedAttempts({
    plan,
    strategy,
    buildAttempt: (attempt) => buildAttempt(attempt),
    runAttempt: async (attemptFiles, attempt, retryReason) => {
      signal?.throwIfAborted();
      if (strategy.executionMode === 'ffmpeg_two_pass') {
        const { pass1Args } = attemptFiles;
        if (pass1Args == null) throw new UserFacingError('2-pass encoding was not configured correctly');
        await runTwoPassEncode({
          firstPassShare: getFirstPassShare(strategy.encoder),
          signal,
          pass1Args,
          pass2Args: attemptFiles.ffmpegArgs,
          duration: plan.duration,
          onProgress,
          pass1ProgressMetadata: makeProgressMetadata({
            attemptNumber: attempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 1,
            phaseCount: 2,
            retryReason,
          }),
          pass2ProgressMetadata: makeProgressMetadata({
            attemptNumber: attempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 2,
            phaseCount: 2,
            retryReason,
          }),
        });
      } else {
        await runSinglePassEncode({
          ffmpegArgs: attemptFiles.ffmpegArgs,
          duration: plan.duration,
          onProgress,
          progressMetadata: makeProgressMetadata({
            attemptNumber: attempt.attemptNumber,
            maxAttempts: plan.maxAttempts,
            phaseNumber: 1,
            phaseCount: 1,
            retryReason,
          }),
        });
      }
    },
    cleanUpAttempt: async (attemptFiles) => {
      await deleteIfExists(attemptFiles.pass1OutPath);
      await deletePassArtifacts(attemptFiles.passlogFile);
    },
    readFileSize,
    deleteIfExists,
    isCancellation: isAbortedError,
  });
}

async function executeWithRetries(args: Parameters<typeof executeAttempts>[0] & { outPath: string }) {
  // In ClipPress's temporary folder, not next to the export: nothing shows in the export's folder until it's finished.
  const tempDir = await mkdtemp(join(getTempWorkDir(), 'encode-'));
  try {
    return await executeAttempts({ ...args, buildAttempt: (attempt) => args.buildAttempt(attempt, join(tempDir, 'export')) });
  } finally {
    // Never recursively remove this directory: it may hold the only successful encode.
    await rmdir(tempDir).catch(() => undefined);
  }
}

/**
 * Lossless when it fits: copies [start, end) as it is, from the keyframe before start, when its bytes already fit the
 * target. Undefined, with nothing left behind, when they don't (the export then encodes as usual).
 */
async function copyLosslesslyIfItFits({ filePath, sourceDuration, start, end, videoStream, audioStream, targetBytes, strategy, appendFfmpegCommandLog, onProgress }: {
  filePath: string,
  sourceDuration: number | undefined,
  start: number,
  end: number,
  videoStream: Pick<FFprobeStream, 'index' | 'codec_name'>,
  audioStream: Pick<FFprobeStream, 'index'> | undefined,
  targetBytes: number,
  strategy: SizeLimitedResolvedStrategy,
  appendFfmpegCommandLog: (args: string[]) => void,
  onProgress: (progress: number) => void,
}): Promise<SizeLimitedExecutionResult | undefined> {
  // Far too big at the recording's average rate: not worth reading its packets.
  if (sourceDuration != null && sourceDuration > 0) {
    const averageBytes = ((await stat(filePath)).size / sourceDuration) * (end - start);
    if (averageBytes > targetBytes * 2) return undefined;
  }
  let estimate: ReturnType<typeof estimateLosslessCopy>;
  try {
    // Read from a little before the earliest keyframe the copy may start on, so it's among the packets.
    const packets = await readPackets({ filePath, from: Math.max(0, start - maxLosslessLeadIn - 1), to: end });
    estimate = estimateLosslessCopy({ packets, videoStreamIndex: videoStream.index, audioStreamIndex: audioStream?.index, start, end });
  } catch (err) {
    // Only a shortcut: if the recording can't be read this way (or not in time), it's encoded as usual.
    console.warn('Could not read the clip to see if a copy fits, encoding instead', err);
    return undefined;
  }
  if (estimate == null || estimate.bytes > targetBytes) return undefined;

  // In ClipPress's temporary folder, like an encode's attempts, so nothing shows next to the export until it's done.
  const tempDir = await mkdtemp(join(getTempWorkDir(), 'copy-'));
  const copyPath = join(tempDir, 'export.mp4');
  const ffmpegArgs = getLosslessCopyArgs({ filePath, start, end, videoStream, audioStream, outPath: copyPath });
  appendFfmpegCommandLog(ffmpegArgs);
  try {
    const result = await runFfmpegWithProgress({ ffmpegArgs, duration: end - estimate.copyStart, onProgress });
    logStdoutStderr(result);
    const size = await readFileSize(copyPath);
    // The file itself decides: the estimate leaves room for MP4's index, and FFmpeg may have started on an earlier
    // keyframe than the one read (e.g. an MKV with B-frames, whose seek steps back a little), making it too long.
    const copiedDuration = await getDuration(copyPath).catch(() => undefined);
    if (size > targetBytes || copiedDuration == null || copiedDuration > end - start + maxLosslessLeadIn + 0.05) {
      await deleteIfExists(copyPath);
      await rmdir(tempDir).catch(() => undefined);
      return undefined;
    }
    return { path: copyPath, size, targetBytes, attemptCount: 1, metTarget: true, created: true, strategy, copied: true };
  } catch (err) {
    await deleteIfExists(copyPath);
    await rmdir(tempDir).catch(() => undefined);
    // A cancel stops the export; anything else falls back to encoding, which reads the recording its own way.
    if (isAbortedError(err)) throw err;
    console.warn('Lossless copy failed, encoding instead', err);
    return undefined;
  }
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
  gpuAcceleration,
  controlMode,
  preset,
  videoFormat,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  advancedHevcCpuPreset,
  advancedHevcNvencPreset,
  targetSizeMb,
  duration,
  hasAudio,
  getOutputPixelRate,
}: {
  /** "Use the GPU": off keeps the presets on the CPU (advanced mode's own encoder choice still wins). */
  gpuAcceleration: boolean,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  videoFormat: SizeLimitVideoFormat,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
  targetSizeMb: number,
  duration: number,
  hasAudio: boolean,
  /** The pixels the encode makes each second at a video bitrate (the size may follow it), when known. */
  getOutputPixelRate: (plannedVideoBitrate: number) => number | undefined,
}) {
  const found = await getSizeLimitedEncoderCapabilities();
  const capabilities = !gpuAcceleration && controlMode === 'simple' ? withoutGpuEncoders(found) : found;
  const strategy = resolveSizeLimitedStrategy({
    controlMode,
    preset,
    videoFormat,
    advancedEncoder,
    advancedTwoPass,
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
    advancedHevcCpuPreset,
    advancedHevcNvencPreset,
    capabilities,
  });
  assertStrategySupported({ strategy, capabilities });
  const plan = planSizeLimitedEncode({ targetSizeMb, duration, hasAudio, strategy });
  // Elsewhere the relaxation would change nothing but skip the top-up. Checked again after a GPU encoder fallback.
  if (!hasQualityCap(strategy.encoder)) return { capabilities, strategy, plan };
  return { capabilities, strategy, plan: relaxQualityCapForGenerousBudget(plan, getOutputPixelRate(plan.initialAttempt.videoBitrate)) };
}

/** The pixels an encode makes each second (its size and frame rate, else the source's), for judging a budget. */
function makeOutputPixelRate({ resolution, fps, videoStream, rotation, sourceFps }: {
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  videoStream: Pick<FFprobeStream, 'width' | 'height'>,
  rotation: number | undefined,
  sourceFps: number | undefined,
}) {
  return (plannedVideoBitrate: number) => {
    const profile = resolveSizeLimitedVideoProfile({ resolution, fps, sourceWidth: videoStream.width, sourceHeight: videoStream.height, rotation, sourceFps, plannedVideoBitrate });
    const pixelRate = (profile.outputWidth ?? videoStream.width ?? 0) * (profile.outputHeight ?? videoStream.height ?? 0) * (profile.outputFps ?? sourceFps ?? 0);
    return Number.isFinite(pixelRate) && pixelRate > 0 ? pixelRate : undefined;
  };
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
  videoFormat,
  resolution,
  fps,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  advancedHevcCpuPreset,
  advancedHevcNvencPreset,
  videoStream,
  audioStream,
  mixedAudioTracks,
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
  gpuAcceleration = true,
  signal,
}: {
  filePath: string,
  outPath: string,
  segment: SegmentToExport,
  sourceDuration: number | undefined,
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  videoFormat: SizeLimitVideoFormat,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
  videoStream: Pick<FFprobeStream, 'index' | 'width' | 'height' | 'codec_name' | 'pix_fmt'>,
  audioStream: Pick<FFprobeStream, 'index' | 'codec_name'> | undefined,
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
  /** Decode on the GPU when it is safe to; falls back to the CPU on failure. */
  gpuAcceleration?: boolean | undefined,
  /** The recording's audio tracks when it has two or more: mixed into the export's one track (exportSegmentMath.ts). */
  mixedAudioTracks?: readonly MixedAudioTrack[] | undefined,
  /** The export's Cancel. */
  signal?: AbortSignal | undefined,
}) {
  await assertFileExists(filePath);
  await assertOutPathIsNotSource({ outPath, filePath });
  await ensureOutputDir(outPath);

  const segmentRate = getSegmentPlaybackRate(segment, outputPlaybackRate);
  const plannedDuration = getSegmentOutputDuration(segment, outputPlaybackRate);
  const resolvePlan = () => resolveSizeLimitedPlan({
    gpuAcceleration,
    controlMode,
    preset,
    videoFormat,
    advancedEncoder,
    advancedTwoPass,
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
    advancedHevcCpuPreset,
    advancedHevcNvencPreset,
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
    getOutputPixelRate: makeOutputPixelRate({ resolution, fps, videoStream, rotation: sourceRotation ?? rotation, sourceFps }),
  });
  let { strategy, plan } = await resolvePlan();

  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    onProgress(1);
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

  // Only the texts this clip shows are drawn (each clip of an export gets them all).
  const segmentOverlayClips = overlayClips?.filter((overlayClip) => overlayClip.start < segment.end && overlayClip.end > segment.start);

  // Lossless when it fits: a clip with nothing to re-encode whose own bytes already fit is copied as it is.
  // Two or more audio tracks are mixed into one (encoded), so a straight copy won't do.
  const mixing = audioStream != null && mixedAudioTracks != null && mixedAudioTracks.length > 1;
  const copyable = !mixing && canCopyLosslessly({
    playbackRate: segmentRate,
    cropped: hasSegmentCrop(segment),
    hasText: segmentOverlayClips != null && segmentOverlayClips.length > 0,
    audioGainDb,
    hasAudio: audioStream != null,
    rotation,
    controlMode,
    resolution,
    fps,
    videoFormat,
    videoCodec: videoStream.codec_name,
    videoPixFmt: videoStream.pix_fmt,
    audioCodec: audioStream?.codec_name,
  });
  const copied = copyable ? await copyLosslesslyIfItFits({
    filePath,
    sourceDuration,
    start: segment.start,
    end: segment.end,
    videoStream,
    audioStream,
    targetBytes: plan.hardTargetBytes,
    strategy,
    appendFfmpegCommandLog,
    onProgress: (progress) => onProgress(progress),
  }) : undefined;

  const preparedOverlayAssets = copied == null
    && segmentOverlayClips != null
    && segmentOverlayClips.length > 0
    && overlayVideoWidth != null
    && overlayVideoHeight != null
    ? await prepareTextOverlayAssets({
      overlayClips: segmentOverlayClips,
      videoWidth: overlayVideoWidth,
      videoHeight: overlayVideoHeight,
      rotation: sourceRotation ?? rotation,
    })
    : [];

  // The tracks mixed into one, then the clip's speed (each track's volume already has the clip's in it).
  const audioMixGraph = mixing ? buildAudioMixFilter({ inputIndex: 0, tracks: mixedAudioTracks!, after: [getAudioTempoFilter(segmentRate)], outputLabel: '[amixed]' }).join(';') : undefined;
  const audioInputLabel = audioStream == null ? undefined : (mixing ? '[amixed]' : `0:${audioStream.index}`);

  let result: SizeLimitedExecutionResult;
  try {
    result = copied ?? await runWithGpuFallbacks({
      hardwareDecode: canUseHardwareDecode({ enabled: gpuAcceleration, inputCount: 1, width: videoStream.width, height: videoStream.height }),
      onGpuEncoderFailed: async () => {
        const next = await resolveNextEncoder(strategy, resolvePlan);
        if (next == null) return false;
        ({ strategy, plan } = next);
        return true;
      },
      run: (hardwareDecode) => runKeepingFramesOnGpu({
        videoStream,
        gpuFramesFormat: hardwareDecode ? getGpuFramesFormat({ videoStream, clips: [{ rate: segmentRate, duration: plannedDuration }], rotation: sourceRotation ?? rotation, sourceFps }) : undefined,
        run: (gpuFramesFormat) => executeWithRetries({
          signal,
          outPath,
          plan,
          strategy,
          buildAttempt: async (attempt, tempPath = outPath) => {
            const attemptOutPath = makeAttemptPath(tempPath, attempt.attemptNumber);
            const inputArgs = getSegmentInputArgs({ filePath, segment, rotation, hardwareDecode, keepFramesOnGpu: gpuFramesFormat != null });
            const outputTrimArgs = ['-t', plannedDuration.toFixed(5)];
            const videoProfile = resolveAttemptVideoProfile({
              resolution,
              fps,
              sourceWidth: videoStream.width,
              sourceHeight: videoStream.height,
              rotation: sourceRotation ?? rotation,
              sourceFps,
              plannedVideoBitrate: attempt.videoBitrate,
            }, strategy.encoder);
            const baseVideoFilter = buildSizeLimitedVideoFilter({ videoProfile });
            const dimensions = getRotatedVideoDimensions({ width: videoStream.width!, height: videoStream.height!, rotation: sourceRotation ?? rotation });
            const cropFilter = getSegmentCropFilter(segment, dimensions.width, dimensions.height);
            const gpuFramesFilter = gpuFramesFormat != null ? getGpuFramesFilter({ rate: segmentRate, downloadFormat: gpuFramesFormat, outputFps: videoProfile.outputFps }) : undefined;
            const videoFilter = [getVideoTimingFilter(segmentRate), gpuFramesFilter, cropFilter, baseVideoFilter].filter(Boolean).join(',');
            const segmentOverlayAssets = preparedOverlayAssets.filter((overlayAsset) => overlayAsset.start < segment.end && overlayAsset.end > segment.start);
            const overlayInputArgs = buildOverlayImageInputArgs(segmentOverlayAssets.map(({ imagePath }) => imagePath));
            const overlayFilter = buildSegmentTextOverlayFilter({
              videoStreamIndex: videoStream.index,
              overlayAssets: segmentOverlayAssets,
              segmentStart: segment.start,
              segmentEnd: segment.end,
              imageInputStartIndex: 1,
              outputPlaybackRate: segmentRate,
              videoFilter: baseVideoFilter,
              cropFilter,
              gpuFramesFilter,
            });
            // The audio mix is a graph of its own, beside the text's (or the video's simple -vf); a first pass writes no
            // audio, so it sinks the mix there.
            const getCommonArgs = ({ sinkAudio }: { sinkAudio: boolean }) => {
              const graph = [overlayFilter?.filterComplex, audioMixGraph, ...(sinkAudio && audioMixGraph != null ? ['[amixed]anullsink'] : [])].filter(Boolean).join(';');
              return [
                ...inputArgs,
                ...overlayInputArgs,
                ...(graph !== '' ? ['-filter_complex', graph] : []),
                ...(overlayFilter == null ? ['-vf', videoFilter] : []),
              ];
            };
            const commonArgs = getCommonArgs({ sinkAudio: false });
            const effectiveVideoProfile = { outputWidth: undefined, outputHeight: undefined, outputFps: undefined };
            const videoInputLabel = overlayFilter?.videoInputLabel ?? `0:${videoStream.index}`;

            if (strategy.executionMode === 'ffmpeg_two_pass') {
              const passlogFile = makePasslogPath(tempPath, attempt.attemptNumber);
              const pass1OutPath = makePass1Path(tempPath, attempt.attemptNumber);
              const pass1Args = [
                '-hide_banner',
                ...getSizeLimitedSwsFlagsArgs(),
                ...getCommonArgs({ sinkAudio: true }),
                ...outputTrimArgs,
                ...getSizeLimitedTwoPassEncodeArgs({
                  strategy,
                  videoBitrate: attempt.videoBitrate,
                  audioBitrate: attempt.audioBitrate,
                  videoInputLabel,
                  audioInputLabel,
                  videoProfile: effectiveVideoProfile,
                  experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                  passlogFile,
                  outPath: pass1OutPath,
                  passNumber: 1,
                  sourceFps,
                  outputPlaybackRate,
                  audioGainDb: mixing ? undefined : audioGainDb,
                  audioPlaybackRate: mixing ? 1 : segmentRate,
                  qualityCapOffset: attempt.qualityCapOffset,
                }),
              ];

              const pass2Args = [
                '-hide_banner',
                ...getSizeLimitedSwsFlagsArgs(),
                ...commonArgs,
                ...outputTrimArgs,
                ...getSizeLimitedTwoPassEncodeArgs({
                  strategy,
                  videoBitrate: attempt.videoBitrate,
                  audioBitrate: attempt.audioBitrate,
                  videoInputLabel,
                  audioInputLabel,
                  videoProfile: effectiveVideoProfile,
                  experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                  passlogFile,
                  outPath: attemptOutPath,
                  passNumber: 2,
                  sourceFps,
                  outputPlaybackRate,
                  audioGainDb: mixing ? undefined : audioGainDb,
                  audioPlaybackRate: mixing ? 1 : segmentRate,
                  qualityCapOffset: attempt.qualityCapOffset,
                }),
              ];

              appendFfmpegCommandLog(pass1Args);
              appendFfmpegCommandLog(pass2Args);
              return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
            }

            const ffmpegArgs = [
              '-hide_banner',
              ...getSizeLimitedSwsFlagsArgs(),
              ...commonArgs,
              ...outputTrimArgs,
              ...getSizeLimitedCommonEncodeArgs({
                strategy,
                videoBitrate: attempt.videoBitrate,
                audioBitrate: attempt.audioBitrate,
                videoInputLabel,
                audioInputLabel,
                videoProfile: effectiveVideoProfile,
                experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                outPath: attemptOutPath,
                sourceFps,
                outputPlaybackRate,
                audioGainDb: mixing ? undefined : audioGainDb,
                audioPlaybackRate: mixing ? 1 : segmentRate,
                qualityCapOffset: attempt.qualityCapOffset,
              }),
            ];

            appendFfmpegCommandLog(ffmpegArgs);
            return { ffmpegArgs, outPath: attemptOutPath };
          },
          onProgress: (progress, metadata) => {
            onStageChange?.(metadata);
            onProgress(progress, metadata);
          },
        }),
      }),
    });
  } finally {
    await Promise.all(preparedOverlayAssets.map((asset) => deleteIfExists(asset.imagePath)));
  }

  await discardIfCancelled({ result, outPath, signal });
  const { result: finalResult, postProcessingWarning } = await finalizeEncodedOutput({ result, outPath, filePath, enableOverwriteOutput });

  await transferTimestamps({
    inPath: filePath,
    outPath: finalResult.path,
    cutFrom: segment.start,
    cutTo: segment.end,
    duration: sourceDuration,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
  });

  onProgress(1);
  return { ...finalResult, postProcessingWarning };
}

export async function exportSizeLimitedMerge({
  filePath,
  outPath,
  segments,
  targetSizeMb,
  controlMode,
  preset,
  videoFormat,
  resolution,
  fps,
  advancedEncoder,
  advancedTwoPass,
  advancedAv1CpuPreset,
  advancedAv1NvencPreset,
  advancedH264CpuPreset,
  advancedH264NvencPreset,
  advancedHevcCpuPreset,
  advancedHevcNvencPreset,
  videoStream,
  audioStream,
  mixedAudioTracks,
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
  gpuAcceleration = true,
  signal,
}: {
  filePath: string,
  outPath: string,
  segments: SegmentToExport[],
  targetSizeMb: number,
  controlMode: SizeLimitControlMode,
  preset: SizeLimitPreset,
  videoFormat: SizeLimitVideoFormat,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  advancedEncoder: SizeLimitAdvancedEncoder,
  advancedTwoPass: boolean,
  advancedAv1CpuPreset: SizeLimitAdvancedAv1CpuPreset,
  advancedAv1NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedH264CpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedH264NvencPreset: SizeLimitAdvancedNvencPreset,
  advancedHevcCpuPreset: SizeLimitAdvancedH264CpuPreset,
  advancedHevcNvencPreset: SizeLimitAdvancedNvencPreset,
  videoStream: Pick<FFprobeStream, 'index' | 'width' | 'height' | 'codec_name' | 'pix_fmt'>,
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
  /** Decode on the GPU when it is safe to; falls back to the CPU on failure. */
  gpuAcceleration?: boolean | undefined,
  /** The recording's audio tracks when it has two or more: mixed into the export's one track (exportSegmentMath.ts). */
  mixedAudioTracks?: readonly MixedAudioTrack[] | undefined,
  /** The export's Cancel. */
  signal?: AbortSignal | undefined,
}) {
  await assertFileExists(filePath);
  await assertOutPathIsNotSource({ outPath, filePath });
  await ensureOutputDir(outPath);

  const mixing = audioStream != null && mixedAudioTracks != null && mixedAudioTracks.length > 1;
  const plannedDuration = segments.reduce((sum, segment) => sum + getSegmentOutputDuration(segment, outputPlaybackRate), 0);
  const resolvePlan = () => resolveSizeLimitedPlan({
    gpuAcceleration,
    controlMode,
    preset,
    videoFormat,
    advancedEncoder,
    advancedTwoPass,
    advancedAv1CpuPreset,
    advancedAv1NvencPreset,
    advancedH264CpuPreset,
    advancedH264NvencPreset,
    advancedHevcCpuPreset,
    advancedHevcNvencPreset,
    targetSizeMb,
    duration: plannedDuration,
    hasAudio: audioStream != null,
    getOutputPixelRate: makeOutputPixelRate({ resolution, fps, videoStream, rotation: sourceRotation ?? rotation, sourceFps }),
  });
  let { strategy, plan } = await resolvePlan();

  const shouldSkip = await ensureWritableOutput(outPath, enableOverwriteOutput);
  if (shouldSkip) {
    const existingSize = await readFileSize(outPath);
    onProgress(1);
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
      videoWidth: overlayVideoWidth,
      videoHeight: overlayVideoHeight,
      rotation: sourceRotation ?? rotation,
    })
    : [];

  let result: SizeLimitedExecutionResult;
  try {
    result = await runWithGpuFallbacks({
      hardwareDecode: canUseHardwareDecode({ enabled: gpuAcceleration, inputCount: segments.length, width: videoStream.width, height: videoStream.height }),
      onGpuEncoderFailed: async () => {
        const next = await resolveNextEncoder(strategy, resolvePlan);
        if (next == null) return false;
        ({ strategy, plan } = next);
        return true;
      },
      run: (hardwareDecode) => runKeepingFramesOnGpu({
        videoStream,
        gpuFramesFormat: hardwareDecode ? getGpuFramesFormat({
          videoStream,
          clips: segments.map((segment) => ({ rate: getSegmentPlaybackRate(segment, outputPlaybackRate), duration: getSegmentOutputDuration(segment, outputPlaybackRate) })),
          rotation: sourceRotation ?? rotation,
          sourceFps,
        }) : undefined,
        run: (gpuFramesFormat) => executeWithRetries({
          signal,
          outPath,
          plan,
          strategy,
          buildAttempt: async (attempt, tempPath = outPath) => {
            const attemptOutPath = makeAttemptPath(tempPath, attempt.attemptNumber);
            const inputArgs = getMergeInputArgs({ filePath, segments, rotation, hardwareDecode, keepFramesOnGpu: gpuFramesFormat != null });
            const overlayInputArgs = buildOverlayImageInputArgs(preparedOverlayAssets.map(({ imagePath }) => imagePath));
            const outputTrimArgs = ['-t', plannedDuration.toFixed(5)];
            const videoProfile = resolveAttemptVideoProfile({
              resolution,
              fps,
              sourceWidth: videoStream.width,
              sourceHeight: videoStream.height,
              rotation: sourceRotation ?? rotation,
              sourceFps,
              plannedVideoBitrate: attempt.videoBitrate,
            }, strategy.encoder);
            const dimensions = getRotatedVideoDimensions({ width: videoStream.width!, height: videoStream.height!, rotation: sourceRotation ?? rotation });
            const filterComplex = getConcatFilter({
              segments,
              videoStreamIndex: videoStream.index,
              audioStreamIndex: audioStream?.index,
              videoProfile,
              overlayAssets: preparedOverlayAssets,
              outputPlaybackRate,
              audioGainDb,
              videoWidth: dimensions.width,
              videoHeight: dimensions.height,
              gpuFramesFormat,
              mixedAudioTracks: mixing ? mixedAudioTracks : undefined,
            });
            const applyAudioGainInFilterGraph = audioStream != null && (mixing || !isNeutralAudioGain(audioGainDb));

            const commonArgs = [
              ...inputArgs,
              ...overlayInputArgs,
            ];

            if (strategy.executionMode === 'ffmpeg_two_pass') {
              const passlogFile = makePasslogPath(tempPath, attempt.attemptNumber);
              const pass1OutPath = makePass1Path(tempPath, attempt.attemptNumber);
              const pass1Args = [
                '-hide_banner',
                ...getSizeLimitedSwsFlagsArgs(),
                ...commonArgs,
                // Pass one writes video only, but every complex-filter output must
                // be consumed. Keep the concat timing identical and sink its audio.
                '-filter_complex', audioStream != null ? `${filterComplex};[a]anullsink` : filterComplex,
                ...outputTrimArgs,
                ...getSizeLimitedTwoPassEncodeArgs({
                  strategy,
                  videoBitrate: attempt.videoBitrate,
                  audioBitrate: attempt.audioBitrate,
                  videoInputLabel: '[v]',
                  audioInputLabel: audioStream != null ? '[a]' : undefined,
                  videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
                  experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                  passlogFile,
                  outPath: pass1OutPath,
                  passNumber: 1,
                  sourceFps,
                  outputPlaybackRate,
                  audioGainDb: applyAudioGainInFilterGraph ? undefined : audioGainDb,
                  qualityCapOffset: attempt.qualityCapOffset,
                }),
              ];

              const pass2Args = [
                '-hide_banner',
                ...getSizeLimitedSwsFlagsArgs(),
                ...commonArgs,
                '-filter_complex', filterComplex,
                ...outputTrimArgs,
                ...getSizeLimitedTwoPassEncodeArgs({
                  strategy,
                  videoBitrate: attempt.videoBitrate,
                  audioBitrate: attempt.audioBitrate,
                  videoInputLabel: '[v]',
                  audioInputLabel: audioStream != null ? '[a]' : undefined,
                  videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
                  experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                  passlogFile,
                  outPath: attemptOutPath,
                  passNumber: 2,
                  sourceFps,
                  outputPlaybackRate,
                  audioGainDb: applyAudioGainInFilterGraph ? undefined : audioGainDb,
                  qualityCapOffset: attempt.qualityCapOffset,
                }),
              ];

              appendFfmpegCommandLog(pass1Args);
              appendFfmpegCommandLog(pass2Args);
              return { ffmpegArgs: pass2Args, outPath: attemptOutPath, passlogFile, pass1Args, pass1OutPath };
            }

            const ffmpegArgs = [
              '-hide_banner',
              ...getSizeLimitedSwsFlagsArgs(),
              ...commonArgs,
              '-filter_complex', filterComplex,
              ...outputTrimArgs,
              ...getSizeLimitedCommonEncodeArgs({
                strategy,
                videoBitrate: attempt.videoBitrate,
                audioBitrate: attempt.audioBitrate,
                videoInputLabel: '[v]',
                audioInputLabel: audioStream != null ? '[a]' : undefined,
                videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
                experimentalArgs: getExperimentalArgs(ffmpegExperimental),
                outPath: attemptOutPath,
                sourceFps,
                outputPlaybackRate,
                audioGainDb: applyAudioGainInFilterGraph ? undefined : audioGainDb,
                qualityCapOffset: attempt.qualityCapOffset,
              }),
            ];

            appendFfmpegCommandLog(ffmpegArgs);
            return { ffmpegArgs, outPath: attemptOutPath };
          },
          onProgress: (progress, metadata) => {
            onStageChange?.(metadata);
            onProgress(progress, metadata);
          },
        }),
      }),
    });
  } finally {
    await Promise.all(preparedOverlayAssets.map((asset) => deleteIfExists(asset.imagePath)));
  }

  await discardIfCancelled({ result, outPath, signal });
  const { result: finalResult, postProcessingWarning } = await finalizeEncodedOutput({ result, outPath, filePath, enableOverwriteOutput });

  const mergedDuration = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  await transferTimestamps({
    inPath: filePath,
    outPath: finalResult.path,
    duration: mergedDuration,
    treatInputFileModifiedTimeAsStart,
    treatOutputFileModifiedTimeAsStart,
  });

  onProgress(1);
  return { ...finalResult, postProcessingWarning };
}
