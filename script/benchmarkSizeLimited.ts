import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { execa } from 'execa';

import {
  getSizeLimitedCommonEncodeArgs,
  getSizeLimitedSwsFlagsArgs,
  getSizeLimitedTwoPassEncodeArgs,
} from '../src/renderer/src/sizeLimitedFfmpegArgs.ts';
import {
  bytesPerMb,
  getNextSizeLimitedRetryStep,
  getNextSizeLimitedUndershootStep,
  planSizeLimitedEncode,
} from '../src/renderer/src/sizeLimitedPlanner.ts';
import { resolveSizeLimitedVideoProfile } from '../src/renderer/src/sizeLimitedResolution.ts';
import { parseFfmpegEncoderNames, resolveSizeLimitedStrategy } from '../src/renderer/src/sizeLimitedStrategy.ts';
import type {
  SizeLimitedEncoderCapabilities,
  SizeLimitedResolvedStrategy,
  SizeLimitedRetryStep,
} from '../src/renderer/src/sizeLimitedTypes.ts';
import type {
  SizeLimitSimpleFps,
  SizeLimitSimpleResolution,
} from '../src/common/types.ts';

/**
 * Measures what the shipped size-limited export actually produces.
 *
 * Everything that decides a number here — which encoder is chosen, the byte budget, the
 * bitrate split, the ffmpeg arguments, the retry and the undershoot top-up — comes from
 * the same modules the app runs. This script only supplies the inputs (ffprobe, the
 * requested cap) and reports the outcome. Anything it reimplemented would be a result
 * about code we do not ship.
 */

class HelpRequestedError extends Error {
  constructor() {
    super('Help requested');
    this.name = 'HelpRequestedError';
  }
}

function printUsage() {
  console.log('Usage: node script/benchmarkSizeLimited.ts --input clip.mp4 --target-mb 8 --target-mb 10 [--output-dir benchmark-output] [--transform-matrix] [--scale-height 720] [--fps 30]');
}

/**
 * The configurations to measure, named the way the app names them.
 *
 * Only the user-facing choice is stored: which encoder ends up running, and with what
 * settings, is `resolveSizeLimitedStrategy`'s job — the same call the export makes.
 */
type BenchmarkCaseId =
  | 'simple_max_quality'
  | 'simple_quality'
  | 'simple_fast'
  | 'advanced_av1_nvenc_two_pass'
  | 'advanced_h264_cpu_two_pass'
  | 'advanced_h264_nvenc_two_pass';

interface BenchmarkCase {
  id: BenchmarkCaseId,
  description: string,
  request: Parameters<typeof resolveSizeLimitedStrategy>[0] extends infer T
    ? Omit<Extract<T, object>, 'capabilities'>
    : never,
}

/**
 * The advanced-mode knobs, which the resolver always takes but only reads in advanced
 * mode. The simple cases below still pass them because that is the same shape the app's
 * settings hand over; they have no effect on a simple preset.
 */
const defaultAdvancedPresets = {
  advancedEncoder: 'av1_cpu',
  advancedAv1CpuPreset: 5,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
} as const;

const benchmarkCases: BenchmarkCase[] = [
  {
    id: 'simple_max_quality',
    description: 'Simple / Max Quality',
    request: {
      controlMode: 'simple',
      preset: 'max_quality',
      advancedTwoPass: true,
      ...defaultAdvancedPresets,
    },
  },
  {
    id: 'simple_quality',
    description: 'Simple / Quality',
    request: {
      controlMode: 'simple',
      preset: 'quality',
      advancedTwoPass: false,
      ...defaultAdvancedPresets,
    },
  },
  {
    id: 'simple_fast',
    description: 'Simple / Fast',
    request: {
      controlMode: 'simple',
      preset: 'fast',
      advancedTwoPass: false,
      ...defaultAdvancedPresets,
    },
  },
  {
    id: 'advanced_av1_nvenc_two_pass',
    description: 'Advanced / AV1 NVENC 2-pass',
    request: {
      controlMode: 'advanced',
      preset: 'quality',
      advancedTwoPass: true,
      ...defaultAdvancedPresets,
      advancedEncoder: 'av1_nvenc',
    },
  },
  {
    id: 'advanced_h264_cpu_two_pass',
    description: 'Advanced / H.264 CPU 2-pass',
    request: {
      controlMode: 'advanced',
      preset: 'quality',
      advancedTwoPass: true,
      ...defaultAdvancedPresets,
      advancedEncoder: 'h264_cpu',
    },
  },
  {
    id: 'advanced_h264_nvenc_two_pass',
    description: 'Advanced / H.264 NVENC 2-pass',
    request: {
      controlMode: 'advanced',
      preset: 'quality',
      advancedTwoPass: true,
      ...defaultAdvancedPresets,
      advancedEncoder: 'h264_nvenc',
    },
  },
];

interface TransformVariant {
  id: 'source_source' | 'scale_only' | 'fps_only' | 'scale_and_fps',
  description: string,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
}

interface AttemptRecord {
  attemptNumber: number,
  reason: 'initial' | 'over_target_retry' | 'undershoot_topup',
  videoBitrate: number,
  audioBitrate: number,
  qualityCapOffset: number | undefined,
  outputBytes: number,
  elapsedMs: number,
}

interface BenchmarkResult {
  input: string,
  targetMb: number,
  case: BenchmarkCaseId,
  strategyId: SizeLimitedResolvedStrategy['id'],
  encoder: SizeLimitedResolvedStrategy['encoder'],
  transform: TransformVariant['id'],
  output: string,
  elapsedMs: number,
  outputBytes: number,
  hardTargetBytes: number,
  firstAttemptTargetBytes: number,
  targetUtilization: number,
  metTarget: boolean,
  attempts: AttemptRecord[],
  duration: number,
  videoBitrate: number,
  audioBitrate: number,
  outputWidth: number | undefined,
  outputHeight: number | undefined,
  outputFps: number | undefined,
  ssimAll?: number | undefined,
}

function parseArgs() {
  const args = process.argv.slice(2);
  const inputs: string[] = [];
  const targetMb: number[] = [];
  let outputDir = 'benchmark-output';
  let transformMatrix = false;
  let scaleHeight = 720;
  let fps = 30;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--input': {
        const value = args[index + 1];
        if (value == null) throw new Error('Missing value for --input');
        inputs.push(resolve(value));
        index += 1;
        break;
      }
      case '--target-mb': {
        const value = Number(args[index + 1]);
        if (Number.isNaN(value) || value <= 0) throw new Error('Invalid value for --target-mb');
        targetMb.push(value);
        index += 1;
        break;
      }
      case '--output-dir': {
        const value = args[index + 1];
        if (value == null) throw new Error('Missing value for --output-dir');
        outputDir = resolve(value);
        index += 1;
        break;
      }
      case '--transform-matrix': {
        transformMatrix = true;
        break;
      }
      case '--scale-height': {
        const value = Number(args[index + 1]);
        if (Number.isNaN(value) || value <= 0) throw new Error('Invalid value for --scale-height');
        scaleHeight = Math.floor(value);
        index += 1;
        break;
      }
      case '--fps': {
        const value = Number(args[index + 1]);
        if (Number.isNaN(value) || value <= 0) throw new Error('Invalid value for --fps');
        fps = Math.floor(value);
        index += 1;
        break;
      }
      case '--help': {
        throw new HelpRequestedError();
      }
      default: {
        break;
      }
    }
  }

  if (inputs.length === 0 || targetMb.length === 0) {
    printUsage();
    throw new Error('Please provide at least one --input and one --target-mb value.');
  }

  return { inputs, targetMb, outputDir, transformMatrix, scaleHeight, fps };
}

/**
 * Maps the CLI's scale/fps knobs onto the app's own resolution and fps settings, so the
 * transform matrix exercises `resolveSizeLimitedVideoProfile` rather than hand-written
 * filter strings.
 */
function toSimpleResolution(scaleHeight: number): SizeLimitSimpleResolution {
  if (scaleHeight >= 1440) return '1440p';
  if (scaleHeight >= 1080) return '1080p';
  return '720p';
}

function buildTransformVariants({ transformMatrix, scaleHeight, fps }: {
  transformMatrix: boolean,
  scaleHeight: number,
  fps: number,
}): TransformVariant[] {
  const scaled = toSimpleResolution(scaleHeight);
  const lowFps: SizeLimitSimpleFps = '30fps';

  const sourceOnly: TransformVariant = {
    id: 'source_source',
    description: 'Source resolution / source fps',
    resolution: 'source',
    fps: 'source',
  };

  if (!transformMatrix) return [sourceOnly];

  if (fps !== 30) console.log(`Note: the app's simple fps control only offers "source" or 30 fps, so --fps ${fps} is measured as 30.`);

  return [
    sourceOnly,
    { id: 'scale_only', description: `Scale only (${scaled})`, resolution: scaled, fps: 'source' },
    { id: 'fps_only', description: 'FPS only (30 fps)', resolution: 'source', fps: lowFps },
    { id: 'scale_and_fps', description: `Scale + FPS (${scaled} / 30 fps)`, resolution: scaled, fps: lowFps },
  ];
}

function getBundledFfPath(binary: 'ffmpeg' | 'ffprobe') {
  const baseDir = dirname(dirname(import.meta.filename));

  if (process.platform === 'win32') {
    const archDir = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
    return join(baseDir, 'ffmpeg', archDir, 'lib', `${binary}.exe`);
  }

  if (process.platform === 'darwin') {
    const archDir = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    return join(baseDir, 'ffmpeg', archDir, binary);
  }

  const archDir = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  return join(baseDir, 'ffmpeg', archDir, 'lib', binary);
}

async function runProcess(binaryPath: string, args: string[]) {
  return execa(binaryPath, args, { all: true });
}

async function probeEncoder(ffmpegPath: string, encoder: 'h264_nvenc' | 'av1_nvenc') {
  try {
    await runProcess(ffmpegPath, [
      '-hide_banner',
      '-f', 'lavfi',
      '-i', 'color=c=black:s=640x360:r=30:d=0.2',
      '-frames:v', '3',
      '-an',
      '-c:v', encoder,
      '-f', 'null',
      '-',
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Capability detection mirrors the app: parse `-encoders`, then actually initialize NVENC. */
async function getCapabilities(ffmpegPath: string): Promise<SizeLimitedEncoderCapabilities> {
  const { all } = await runProcess(ffmpegPath, ['-hide_banner', '-encoders']);
  const encoders = parseFfmpegEncoderNames(all ?? '');
  return {
    libx264: encoders.has('libx264'),
    libsvtav1: encoders.has('libsvtav1'),
    h264Nvenc: encoders.has('h264_nvenc') ? await probeEncoder(ffmpegPath, 'h264_nvenc') : false,
    av1Nvenc: encoders.has('av1_nvenc') ? await probeEncoder(ffmpegPath, 'av1_nvenc') : false,
  };
}

const capabilityByEncoder = {
  libx264: 'libx264',
  libsvtav1: 'libsvtav1',
  h264_nvenc: 'h264Nvenc',
  av1_nvenc: 'av1Nvenc',
} as const satisfies Record<SizeLimitedResolvedStrategy['encoder'], keyof SizeLimitedEncoderCapabilities>;

function isCaseRunnable(strategy: SizeLimitedResolvedStrategy, capabilities: SizeLimitedEncoderCapabilities) {
  return capabilities[capabilityByEncoder[strategy.encoder]];
}

async function readProbe(ffprobePath: string, input: string) {
  const { stdout } = await execa(ffprobePath, [
    '-v', 'error',
    '-of', 'json',
    '-show_format',
    '-show_streams',
    input,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string | undefined },
    streams?: {
      codec_type?: string | undefined,
      width?: number | undefined,
      height?: number | undefined,
      avg_frame_rate?: string | undefined,
    }[] | undefined,
  };

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');

  const parseFps = (value: string | undefined) => {
    const [num, den] = (value ?? '').split('/').map(Number);
    if (num == null || !Number.isFinite(num) || num <= 0) return undefined;
    if (den == null || !Number.isFinite(den) || den <= 0) return undefined;
    return num / den;
  };

  return {
    duration: Number(parsed.format?.duration ?? 0),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    width: videoStream?.width,
    height: videoStream?.height,
    fps: parseFps(videoStream?.avg_frame_rate),
  };
}

type Probe = Awaited<ReturnType<typeof readProbe>>;

async function fileSize(path: string) {
  return (await stat(path)).size;
}

async function runSsim(ffmpegPath: string, source: string, encoded: string) {
  try {
    const { stderr } = await execa(ffmpegPath, [
      '-hide_banner',
      '-i', source,
      '-i', encoded,
      '-lavfi', 'ssim',
      '-f', 'null',
      '-',
    ], { stderr: 'pipe', stdout: 'pipe' });

    const match = stderr.match(/All:\s*([0-9.]+)/u);
    if (match?.[1] == null) return undefined;
    return Number(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Runs one attempt with exactly the arguments the app would use for it.
 *
 * The app encodes the selected segment; the benchmark encodes the whole input, so the
 * only difference from a real export is the absence of `-ss`/`-t` input trimming.
 */
async function runAttempt({ ffmpegPath, input, output, tempDir, attempt, strategy, probe, transform }: {
  ffmpegPath: string,
  input: string,
  output: string,
  tempDir: string,
  attempt: SizeLimitedRetryStep,
  strategy: SizeLimitedResolvedStrategy,
  probe: Probe,
  transform: TransformVariant,
}) {
  const videoProfile = resolveSizeLimitedVideoProfile({
    resolution: transform.resolution,
    fps: transform.fps,
    sourceWidth: probe.width,
    sourceHeight: probe.height,
    rotation: undefined,
    sourceFps: probe.fps,
    plannedVideoBitrate: attempt.videoBitrate,
  });

  const shared = {
    strategy,
    videoBitrate: attempt.videoBitrate,
    audioBitrate: attempt.audioBitrate,
    videoInputLabel: '0:v:0',
    audioInputLabel: probe.hasAudio ? '0:a:0' : undefined,
    videoProfile,
    // The benchmark never enables the app's experimental flag; it is an escape hatch for
    // awkward inputs, not part of what we are measuring.
    experimentalArgs: [],
    rotation: undefined,
    sourceFps: probe.fps,
    outputPlaybackRate: 1,
    ...(attempt.qualityCapOffset != null ? { qualityCapOffset: attempt.qualityCapOffset } : {}),
  };

  const inputArgs = ['-hide_banner', ...getSizeLimitedSwsFlagsArgs(), '-i', input];
  const startedAt = Date.now();

  if (strategy.executionMode === 'ffmpeg_two_pass') {
    const passlogFile = join(tempDir, `${strategy.id}-${attempt.attemptNumber}.passlog`);
    const pass1Output = join(tempDir, `${strategy.id}-${attempt.attemptNumber}.pass1.mp4`);

    await runProcess(ffmpegPath, [
      ...inputArgs,
      ...getSizeLimitedTwoPassEncodeArgs({ ...shared, passlogFile, outPath: pass1Output, passNumber: 1 }),
    ]);
    await runProcess(ffmpegPath, [
      ...inputArgs,
      ...getSizeLimitedTwoPassEncodeArgs({ ...shared, passlogFile, outPath: output, passNumber: 2 }),
    ]);
  } else {
    await runProcess(ffmpegPath, [
      ...inputArgs,
      ...getSizeLimitedCommonEncodeArgs({ ...shared, outPath: output }),
    ]);
  }

  return {
    elapsedMs: Date.now() - startedAt,
    outputBytes: await fileSize(output),
    videoProfile,
  };
}

async function runCase({ ffmpegPath, input, outputDir, targetMb, probe, benchmarkCase, strategy, transform }: {
  ffmpegPath: string,
  input: string,
  outputDir: string,
  targetMb: number,
  probe: Probe,
  benchmarkCase: BenchmarkCase,
  strategy: SizeLimitedResolvedStrategy,
  transform: TransformVariant,
}): Promise<BenchmarkResult> {
  const stem = parse(input).name;
  const output = join(outputDir, `${stem}.${benchmarkCase.id}.${transform.id}.${targetMb}mb.mp4`);

  const plan = planSizeLimitedEncode({
    targetSizeMb: targetMb,
    duration: probe.duration,
    hasAudio: probe.hasAudio,
    strategy,
  });

  const tempDir = await mkdtemp(join(tmpdir(), 'clippress-bench-'));
  const attempts: AttemptRecord[] = [];
  let attempt: SizeLimitedRetryStep | undefined = plan.initialAttempt;
  let reason: AttemptRecord['reason'] = 'initial';
  let lastVideoProfile: ReturnType<typeof resolveSizeLimitedVideoProfile> | undefined;

  try {
    while (attempt != null) {
      const { elapsedMs, outputBytes, videoProfile } = await runAttempt({
        ffmpegPath, input, output, tempDir, attempt, strategy, probe, transform,
      });
      lastVideoProfile = videoProfile;

      attempts.push({
        attemptNumber: attempt.attemptNumber,
        reason,
        videoBitrate: attempt.videoBitrate,
        audioBitrate: attempt.audioBitrate,
        qualityCapOffset: attempt.qualityCapOffset,
        outputBytes,
        elapsedMs,
      });

      // Same order the export uses: shrink first if the result broke the cap, otherwise
      // consider one top-up if it came in far under.
      const retryStep: SizeLimitedRetryStep | undefined = getNextSizeLimitedRetryStep({ plan, previousAttempt: attempt, previousOutputSize: outputBytes });
      const undershootStep: SizeLimitedRetryStep | undefined = retryStep == null
        ? getNextSizeLimitedUndershootStep({ plan, previousAttempt: attempt, previousOutputSize: outputBytes })
        : undefined;

      if (retryStep != null) reason = 'over_target_retry';
      else if (undershootStep != null) reason = 'undershoot_topup';

      attempt = retryStep ?? undershootStep;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  // The export keeps the largest result that stayed under the cap, so an undershoot
  // top-up that overshoots is discarded rather than shipped. Mirror that here.
  const underCap = attempts.filter((record) => record.outputBytes <= plan.hardTargetBytes);
  const best = [...(underCap.length > 0 ? underCap : attempts)].sort((a, b) => b.outputBytes - a.outputBytes)[0];
  if (best == null) throw new Error('No attempt was run');
  const bestStep = best.attemptNumber === plan.initialAttempt.attemptNumber ? plan.initialAttempt : undefined;

  const outputBytes = await fileSize(output);
  const ssimAll = await runSsim(ffmpegPath, input, output);

  return {
    input,
    targetMb,
    case: benchmarkCase.id,
    strategyId: strategy.id,
    encoder: strategy.encoder,
    transform: transform.id,
    output,
    elapsedMs: attempts.reduce((total, record) => total + record.elapsedMs, 0),
    outputBytes,
    hardTargetBytes: plan.hardTargetBytes,
    firstAttemptTargetBytes: plan.firstAttemptTargetBytes,
    targetUtilization: outputBytes / plan.hardTargetBytes,
    metTarget: outputBytes <= plan.hardTargetBytes,
    attempts,
    duration: plan.duration,
    videoBitrate: best.videoBitrate ?? bestStep?.videoBitrate ?? 0,
    audioBitrate: best.audioBitrate,
    outputWidth: lastVideoProfile?.outputWidth,
    outputHeight: lastVideoProfile?.outputHeight,
    outputFps: lastVideoProfile?.outputFps,
    ssimAll,
  };
}

async function main() {
  const { inputs, targetMb, outputDir, transformMatrix, scaleHeight, fps } = parseArgs();
  const ffmpegPath = getBundledFfPath('ffmpeg');
  const ffprobePath = getBundledFfPath('ffprobe');
  await mkdir(outputDir, { recursive: true });

  const capabilities = await getCapabilities(ffmpegPath);
  const transforms = buildTransformVariants({ transformMatrix, scaleHeight, fps });
  const casesToRun = transformMatrix
    ? benchmarkCases.filter((benchmarkCase) => ['simple_max_quality', 'simple_quality', 'simple_fast', 'advanced_h264_nvenc_two_pass'].includes(benchmarkCase.id))
    : benchmarkCases;

  console.log('Detected capabilities:', capabilities);
  if (transformMatrix) console.log('Transform matrix:', transforms.map((transform) => `${transform.id} (${transform.description})`).join(', '));

  const results: BenchmarkResult[] = [];

  for (const input of inputs) {
    const probe = await readProbe(ffprobePath, input);
    console.log(`\nInput: ${basename(input)} (${probe.duration.toFixed(2)}s, ${probe.width}x${probe.height}, audio=${probe.hasAudio})`);

    for (const target of targetMb) {
      for (const transform of transforms) {
        for (const benchmarkCase of casesToRun) {
          const strategy = resolveSizeLimitedStrategy({ ...benchmarkCase.request, capabilities });

          if (!isCaseRunnable(strategy, capabilities)) {
            console.log(`Skipping ${benchmarkCase.id} (${transform.id}) for ${basename(input)} at ${target} MB because ${strategy.encoder} is unavailable.`);
          } else {
            console.log(`Running ${benchmarkCase.id} -> ${strategy.id} (${transform.id}) for ${basename(input)} at ${target} MB`);
            results.push(await runCase({
              ffmpegPath,
              input,
              outputDir,
              targetMb: target,
              probe,
              benchmarkCase,
              strategy,
              transform,
            }));
          }
        }
      }
    }
  }

  const summaryPath = join(outputDir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify({ capabilities, results }, null, 2));

  console.table(results.map((result) => ({
    input: basename(result.input),
    targetMb: result.targetMb,
    case: result.case,
    strategy: result.strategyId,
    transform: result.transform,
    sizeMb: Number((result.outputBytes / bytesPerMb).toFixed(2)),
    ofTarget: `${(result.targetUtilization * 100).toFixed(1)}%`,
    metTarget: result.metTarget,
    attempts: result.attempts.length,
    elapsedSeconds: Number((result.elapsedMs / 1000).toFixed(2)),
    ssimAll: result.ssimAll != null ? Number(result.ssimAll.toFixed(4)) : 'n/a',
  })));

  const markdownPath = join(outputDir, 'summary.md');
  const lines = [
    '# ClipPress Size-Limited Benchmark',
    '',
    'Produced by `yarn benchmark-size-limited`, which drives the same planner, strategy',
    'resolution and ffmpeg arguments the app uses.',
    '',
    '| Input | Target MB | Case | Strategy | Transform | Output MB | % of target | Met target | Attempts | Elapsed s | SSIM All |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | :---: | ---: | ---: | ---: |',
    ...results.map((result) => [
      '',
      basename(result.input),
      String(result.targetMb),
      result.case,
      result.strategyId,
      result.transform,
      (result.outputBytes / bytesPerMb).toFixed(2),
      `${(result.targetUtilization * 100).toFixed(1)}%`,
      result.metTarget ? 'yes' : 'no',
      String(result.attempts.length),
      (result.elapsedMs / 1000).toFixed(2),
      result.ssimAll != null ? result.ssimAll.toFixed(4) : 'n/a',
      '',
    ].join(' | ')),
    '',
  ];
  await writeFile(markdownPath, lines.join('\n'));
  console.log(`\nWrote benchmark results to ${outputDir}`);
  console.log(`JSON summary: ${summaryPath}`);
  console.log(`Markdown summary: ${markdownPath}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof HelpRequestedError) {
    printUsage();
  } else {
    throw error;
  }
}
