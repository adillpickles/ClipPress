import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { execa } from 'execa';

const bytesPerMb = 1024 * 1024;

class HelpRequestedError extends Error {
  constructor() {
    super('Help requested');
    this.name = 'HelpRequestedError';
  }
}

function toKbitrateArg(bitrate: number) {
  return `${Math.max(1, Math.floor(bitrate / 1000))}k`;
}

function printUsage() {
  console.log('Usage: node script/benchmarkSizeLimited.ts --input clip.mp4 --target-mb 8 --target-mb 10 [--output-dir benchmark-output]');
}

type BenchmarkProfileId =
  | 'simple_max_quality'
  | 'simple_quality'
  | 'simple_fast'
  | 'advanced_av1_nvenc_two_pass'
  | 'advanced_h264_cpu_two_pass'
  | 'advanced_h264_nvenc_two_pass';

type CapabilityName = 'h264_nvenc' | 'av1_nvenc' | 'libx264' | 'libsvtav1';

interface BenchmarkProfile {
  id: BenchmarkProfileId,
  description: string,
  encoder: CapabilityName,
  mode: 'single_pass' | 'two_pass',
  firstAttemptTargetFactor: number,
  overheadRatio: number,
  preferredAudioBitrate: number,
  minAudioBitrate: number,
  maxAudioShare: number,
  tinyTargetAudioShare: number,
  tinyTargetThreshold: number,
  minVideoBitrate: number,
  buildVideoArgs: (videoBitrate: number) => string[],
}

interface BenchmarkPlan {
  hardTargetBytes: number,
  targetZoneMinBytes: number,
  targetZoneMaxBytes: number,
  firstAttemptTargetBytes: number,
  totalBitrate: number,
  videoBitrate: number,
  audioBitrate: number,
  duration: number,
}

interface BenchmarkResult {
  input: string,
  targetMb: number,
  profile: BenchmarkProfileId,
  output: string,
  elapsedMs: number,
  outputBytes: number,
  plannedFinalBytes: number,
  metTarget: boolean,
  duration: number,
  videoBitrate: number,
  audioBitrate: number,
  ssimAll?: number | undefined,
}

const profiles: BenchmarkProfile[] = [
  {
    id: 'simple_max_quality',
    description: 'Simple Max Quality: SVT-AV1 preset 6, 2-pass',
    encoder: 'libsvtav1',
    mode: 'two_pass',
    firstAttemptTargetFactor: 0.95,
    overheadRatio: 0.017,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.15,
    tinyTargetAudioShare: 0.08,
    tinyTargetThreshold: 650_000,
    minVideoBitrate: 80_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'libsvtav1',
      '-preset', '6',
      '-pix_fmt', 'yuv420p',
      '-b:v', toKbitrateArg(videoBitrate),
    ],
  },
  {
    id: 'simple_quality',
    description: 'Simple Quality: AV1 NVENC p6 single-pass',
    encoder: 'av1_nvenc',
    mode: 'single_pass',
    firstAttemptTargetFactor: 0.93,
    overheadRatio: 0.018,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetThreshold: 700_000,
    minVideoBitrate: 90_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'av1_nvenc',
      '-preset', 'p6',
      '-tune', 'hq',
      '-rc', 'vbr',
      '-multipass', 'qres',
      '-cq', '28',
      '-rc-lookahead', '20',
      '-spatial-aq', '1',
      '-temporal-aq', '1',
      '-aq-strength', '8',
      '-b_ref_mode', 'middle',
      '-pix_fmt', 'yuv420p',
      '-b:v', toKbitrateArg(videoBitrate),
      '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.05))),
      '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.5))),
    ],
  },
  {
    id: 'simple_fast',
    description: 'Simple Fast: AV1 NVENC p4 single-pass',
    encoder: 'av1_nvenc',
    mode: 'single_pass',
    firstAttemptTargetFactor: 0.9,
    overheadRatio: 0.018,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetThreshold: 700_000,
    minVideoBitrate: 90_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'av1_nvenc',
      '-preset', 'p4',
      '-tune', 'hq',
      '-rc', 'vbr',
      '-cq', '30',
      '-rc-lookahead', '12',
      '-spatial-aq', '1',
      '-temporal-aq', '1',
      '-aq-strength', '6',
      '-b_ref_mode', 'middle',
      '-pix_fmt', 'yuv420p',
      '-b:v', toKbitrateArg(videoBitrate),
      '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.05))),
      '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.5))),
    ],
  },
  {
    id: 'advanced_av1_nvenc_two_pass',
    description: 'Advanced AV1 NVENC 2-pass',
    encoder: 'av1_nvenc',
    mode: 'two_pass',
    firstAttemptTargetFactor: 0.95,
    overheadRatio: 0.018,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.08,
    tinyTargetThreshold: 700_000,
    minVideoBitrate: 90_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'av1_nvenc',
      '-preset', 'p6',
      '-tune', 'hq',
      '-rc', 'vbr',
      '-cq', '28',
      '-rc-lookahead', '20',
      '-spatial-aq', '1',
      '-temporal-aq', '1',
      '-aq-strength', '8',
      '-b_ref_mode', 'middle',
      '-pix_fmt', 'yuv420p',
      '-b:v', toKbitrateArg(videoBitrate),
      '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.1))),
      '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 2))),
    ],
  },
  {
    id: 'advanced_h264_cpu_two_pass',
    description: 'Advanced H.264 CPU 2-pass',
    encoder: 'libx264',
    mode: 'two_pass',
    firstAttemptTargetFactor: 0.93,
    overheadRatio: 0.022,
    preferredAudioBitrate: 64_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.16,
    tinyTargetAudioShare: 0.09,
    tinyTargetThreshold: 780_000,
    minVideoBitrate: 105_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-pix_fmt', 'yuv420p',
      '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:rc-lookahead=40:me=umh:subme=8:ref=4',
      '-b:v', toKbitrateArg(videoBitrate),
      '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.05))),
      '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 2.2))),
    ],
  },
  {
    id: 'advanced_h264_nvenc_two_pass',
    description: 'Advanced H.264 NVENC 2-pass',
    encoder: 'h264_nvenc',
    mode: 'two_pass',
    firstAttemptTargetFactor: 0.93,
    overheadRatio: 0.022,
    preferredAudioBitrate: 72_000,
    minAudioBitrate: 24_000,
    maxAudioShare: 0.18,
    tinyTargetAudioShare: 0.1,
    tinyTargetThreshold: 900_000,
    minVideoBitrate: 140_000,
    buildVideoArgs: (videoBitrate) => [
      '-c:v', 'h264_nvenc',
      '-preset', 'p4',
      '-tune', 'hq',
      '-profile:v', 'high',
      '-rc', 'vbr',
      '-cq', '23',
      '-rc-lookahead', '20',
      '-spatial-aq', '1',
      '-temporal-aq', '1',
      '-aq-strength', '8',
      '-b_ref_mode', 'middle',
      '-pix_fmt', 'yuv420p',
      '-b:v', toKbitrateArg(videoBitrate),
      '-maxrate', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 1.1))),
      '-bufsize', toKbitrateArg(Math.max(videoBitrate, Math.floor(videoBitrate * 2))),
    ],
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const inputs: string[] = [];
  const targetMb: number[] = [];
  let outputDir = 'benchmark-output';

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

  return { inputs, targetMb, outputDir };
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

async function getAvailableEncoders(ffmpegPath: string) {
  const { all } = await runProcess(ffmpegPath, ['-hide_banner', '-encoders']);
  const lines = (all ?? '').split(/\r?\n/u);
  return new Set(lines
    .map((line) => line.match(/^[\sA-Z.]+\s+([a-z0-9_]+)\s+/iu)?.[1]?.toLowerCase())
    .filter((value): value is string => value != null));
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

async function getCapabilities(ffmpegPath: string) {
  const encoders = await getAvailableEncoders(ffmpegPath);
  return {
    libx264: encoders.has('libx264'),
    libsvtav1: encoders.has('libsvtav1'),
    h264_nvenc: encoders.has('h264_nvenc') ? await probeEncoder(ffmpegPath, 'h264_nvenc') : false,
    av1_nvenc: encoders.has('av1_nvenc') ? await probeEncoder(ffmpegPath, 'av1_nvenc') : false,
  };
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
    streams?: { codec_type?: string | undefined }[] | undefined,
  };

  const duration = Number(parsed.format?.duration ?? 0);
  return {
    duration,
    hasAudio: (parsed.streams ?? []).some((stream) => stream.codec_type === 'audio'),
  };
}

function planProfile({ targetMb, duration, hasAudio, profile }: {
  targetMb: number,
  duration: number,
  hasAudio: boolean,
  profile: BenchmarkProfile,
}): BenchmarkPlan {
  const hardTargetBytes = Math.max(1, Math.floor(targetMb * bytesPerMb));
  const overheadBytes = Math.max(24 * 1024, Math.floor(hardTargetBytes * profile.overheadRatio));
  const safeDuration = Math.max(duration, 0.5);
  const targetZoneMinBytes = Math.floor(hardTargetBytes * 0.95);
  const targetZoneMaxBytes = Math.floor(hardTargetBytes * 0.98);
  const firstAttemptTargetBytes = Math.max(Math.floor(hardTargetBytes * profile.firstAttemptTargetFactor), 24 * 1024);
  const availableBytes = Math.max(firstAttemptTargetBytes - overheadBytes, 24 * 1024);
  const totalBitrate = Math.max(Math.floor((availableBytes * 8) / safeDuration), profile.minVideoBitrate + (hasAudio ? profile.minAudioBitrate : 0));

  if (!hasAudio) {
    return {
      hardTargetBytes,
      targetZoneMinBytes,
      targetZoneMaxBytes,
      firstAttemptTargetBytes,
      totalBitrate,
      videoBitrate: totalBitrate,
      audioBitrate: 0,
      duration: safeDuration,
    };
  }

  const audioShare = totalBitrate <= profile.tinyTargetThreshold ? profile.tinyTargetAudioShare : profile.maxAudioShare;
  let audioBitrate = Math.min(profile.preferredAudioBitrate, Math.max(profile.minAudioBitrate, Math.floor(totalBitrate * audioShare)));
  if (totalBitrate - audioBitrate < profile.minVideoBitrate) {
    audioBitrate = Math.max(profile.minAudioBitrate, totalBitrate - profile.minVideoBitrate);
  }

  return {
    hardTargetBytes,
    targetZoneMinBytes,
    targetZoneMaxBytes,
    firstAttemptTargetBytes,
    totalBitrate,
    videoBitrate: Math.max(totalBitrate - audioBitrate, profile.minVideoBitrate),
    audioBitrate,
    duration: safeDuration,
  };
}

function getAudioArgs(hasAudio: boolean, audioBitrate: number) {
  if (!hasAudio) return ['-an'];
  return ['-c:a', 'aac', '-b:a', toKbitrateArg(audioBitrate), '-ac', '2'];
}

function buildSinglePassArgs({ input, output, hasAudio, plan, profile }: {
  input: string,
  output: string,
  hasAudio: boolean,
  plan: BenchmarkPlan,
  profile: BenchmarkProfile,
}) {
  return [
    '-hide_banner',
    '-i', input,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    ...profile.buildVideoArgs(plan.videoBitrate),
    ...getAudioArgs(hasAudio, plan.audioBitrate),
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y', output,
  ];
}

function buildTwoPassArgs({ input, output, passlogFile, pass1Output, hasAudio, plan, profile }: {
  input: string,
  output: string,
  passlogFile: string,
  pass1Output: string,
  hasAudio: boolean,
  plan: BenchmarkPlan,
  profile: BenchmarkProfile,
}) {
  const sharedVideoArgs = profile.buildVideoArgs(plan.videoBitrate);
  const pass1Args = [
    '-hide_banner',
    '-i', input,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', '0:v:0',
    ...sharedVideoArgs,
    '-pass', '1',
    '-passlogfile', passlogFile,
    '-an',
    '-f', 'mp4',
    '-y', pass1Output,
  ];

  const pass2Args = [
    '-hide_banner',
    '-i', input,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-ignore_unknown',
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    ...sharedVideoArgs,
    '-pass', '2',
    '-passlogfile', passlogFile,
    ...getAudioArgs(hasAudio, plan.audioBitrate),
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y', output,
  ];

  return { pass1Args, pass2Args };
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

async function runProfile({
  ffmpegPath,
  input,
  outputDir,
  targetMb,
  probe,
  profile,
}: {
  ffmpegPath: string,
  input: string,
  outputDir: string,
  targetMb: number,
  probe: Awaited<ReturnType<typeof readProbe>>,
  profile: BenchmarkProfile,
}) {
  const stem = parse(input).name;
  const output = join(outputDir, `${stem}.${profile.id}.${targetMb}mb.mp4`);
  const plan = planProfile({ targetMb, duration: probe.duration, hasAudio: probe.hasAudio, profile });
  const startedAt = Date.now();

  if (profile.mode === 'single_pass') {
    await runProcess(ffmpegPath, buildSinglePassArgs({
      input,
      output,
      hasAudio: probe.hasAudio,
      plan,
      profile,
    }));
  } else {
    const tempDir = await mkdtemp(join(tmpdir(), 'clippress-bench-'));
    const passlogFile = join(tempDir, `${profile.id}.passlog`);
    const pass1Output = join(tempDir, `${profile.id}.pass1.mp4`);

    try {
      const { pass1Args, pass2Args } = buildTwoPassArgs({
        input,
        output,
        passlogFile,
        pass1Output,
        hasAudio: probe.hasAudio,
        plan,
        profile,
      });
      await runProcess(ffmpegPath, pass1Args);
      await runProcess(ffmpegPath, pass2Args);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const outputBytes = (await stat(output)).size;
  const ssimAll = await runSsim(ffmpegPath, input, output);

  return {
    input,
    targetMb,
    profile: profile.id,
    output,
    elapsedMs,
    outputBytes,
    plannedFinalBytes: plan.firstAttemptTargetBytes,
    metTarget: outputBytes <= plan.hardTargetBytes,
    duration: probe.duration,
    videoBitrate: plan.videoBitrate,
    audioBitrate: plan.audioBitrate,
    ssimAll,
  } satisfies BenchmarkResult;
}

async function main() {
  const { inputs, targetMb, outputDir } = parseArgs();
  const ffmpegPath = getBundledFfPath('ffmpeg');
  const ffprobePath = getBundledFfPath('ffprobe');
  await mkdir(outputDir, { recursive: true });

  const capabilities = await getCapabilities(ffmpegPath);
  console.log('Detected capabilities:', capabilities);

  const results: BenchmarkResult[] = [];

  for (const input of inputs) {
    const probe = await readProbe(ffprobePath, input);
    console.log(`\nInput: ${basename(input)} (${probe.duration.toFixed(2)}s, audio=${probe.hasAudio})`);

    for (const target of targetMb) {
      for (const profile of profiles) {
        if (!capabilities[profile.encoder]) {
          console.log(`Skipping ${profile.id} for ${basename(input)} at ${target} MB because ${profile.encoder} is unavailable.`);
        } else {
          console.log(`Running ${profile.id} for ${basename(input)} at ${target} MB`);
          const result = await runProfile({
            ffmpegPath,
            input,
            outputDir,
            targetMb: target,
            probe,
            profile,
          });
          results.push(result);
        }
      }
    }
  }

  const summaryPath = join(outputDir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(results, null, 2));

  console.table(results.map((result) => ({
    input: basename(result.input),
    targetMb: result.targetMb,
    profile: result.profile,
    plannedMb: Number((result.plannedFinalBytes / bytesPerMb).toFixed(2)),
    sizeMb: Number((result.outputBytes / bytesPerMb).toFixed(2)),
    metTarget: result.metTarget,
    elapsedSeconds: Number((result.elapsedMs / 1000).toFixed(2)),
    ssimAll: result.ssimAll != null ? Number(result.ssimAll.toFixed(4)) : 'n/a',
  })));

  const markdownPath = join(outputDir, 'summary.md');
  const lines = [
    '# ClipPress Size-Limited Benchmark',
    '',
    '| Input | Target MB | Planned MB | Profile | Output MB | Met Target | Elapsed s | SSIM All |',
    '| --- | ---: | ---: | --- | ---: | :---: | ---: | ---: |',
    ...results.map((result) => `| ${basename(result.input)} | ${result.targetMb} | ${(result.plannedFinalBytes / bytesPerMb).toFixed(2)} | ${result.profile} | ${(result.outputBytes / bytesPerMb).toFixed(2)} | ${result.metTarget ? 'yes' : 'no'} | ${(result.elapsedMs / 1000).toFixed(2)} | ${result.ssimAll != null ? result.ssimAll.toFixed(4) : 'n/a'} |`),
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
