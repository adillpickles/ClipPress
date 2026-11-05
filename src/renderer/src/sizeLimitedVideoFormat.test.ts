import i18n from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SizeLimitAdvancedEncoder, SizeLimitPreset, SizeLimitVideoFormat } from '../../common/types';
import { withoutGpuEncoders } from './gpuEncoders';
import { getPassArtifactPaths, getSizeLimitedTwoPassEncodeArgs } from './sizeLimitedFfmpegArgs';
import addSizeLimitedStrategyNotes from './sizeLimitedResultNotes';
import { getEncodersToRetest, isSavedEncoderCheck } from './savedEncoderCheck';
import { getGpuProbeVideoArgs, getResolvedVideoArgs } from './sizeLimitedEncoderArgs';
import { planSizeLimitedEncode } from './sizeLimitedPlanner';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { SizeLimitedEncoderCapabilities } from './sizeLimitedTypes';

const presets: SizeLimitPreset[] = ['max_quality', 'quality', 'fast'];

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: {}, keySeparator: false, nsSeparator: false });
});

// An RTX 40/50: every NVIDIA encoder, and the bundled FFmpeg's CPU encoders.
const rtx40: SizeLimitedEncoderCapabilities = { h264Nvenc: true, av1Nvenc: true, hevcNvenc: true, libx264: true, libx265: true, libsvtav1: true, cpuThreads: 16 };
// A GTX 750 (H.264 but no HEVC encoder).
const gtx750 = (cpuThreads: number): SizeLimitedEncoderCapabilities => ({ h264Nvenc: true, av1Nvenc: false, hevcNvenc: false, libx264: true, libx265: true, libsvtav1: true, cpuThreads });
const noGpu: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, libx264: true, libx265: true, libsvtav1: true, cpuThreads: 8 };

function resolve(preset: SizeLimitPreset, capabilities: SizeLimitedEncoderCapabilities, videoFormat: SizeLimitVideoFormat = 'hevc', advanced: { encoder: SizeLimitAdvancedEncoder, twoPass?: boolean } | undefined = undefined) {
  return resolveSizeLimitedStrategy({
    controlMode: advanced != null ? 'advanced' : 'simple',
    preset,
    videoFormat,
    advancedEncoder: advanced?.encoder ?? 'av1_nvenc',
    advancedTwoPass: advanced?.twoPass ?? false,
    advancedAv1CpuPreset: 6,
    advancedAv1NvencPreset: 'p6',
    advancedH264CpuPreset: 'slow',
    advancedH264NvencPreset: 'p4',
    advancedHevcCpuPreset: 'medium',
    advancedHevcNvencPreset: 'p5',
    capabilities,
  });
}

function getArgValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const videoProfile = { outputWidth: undefined, outputHeight: undefined, outputFps: undefined };

describe('Video format HEVC (the default)', () => {
  it('puts every preset on HEVC, the graphics card for Quality and Fast and x265 two-pass for Max quality', () => {
    expect(resolve('quality', rtx40)).toMatchObject({ id: 'quality_hevc_gpu', encoder: 'hevc_nvenc', effectiveCodec: 'hevc', encoderPreset: 'p6' });
    expect(resolve('quality', rtx40).fallbackReason).toBeUndefined();
    expect(resolve('fast', rtx40)).toMatchObject({ id: 'fast_hevc_gpu', encoder: 'hevc_nvenc', encoderPreset: 'p4' });
    expect(resolve('max_quality', rtx40)).toMatchObject({ id: 'max_quality_hevc_cpu', encoder: 'libx265', encoderPreset: 'slow', executionMode: 'ffmpeg_two_pass', usesGpu: false });
  });

  it("gives Quality NVIDIA's ultra high quality tuning at p5 where the card takes it, else hq at p6", () => {
    const uhqCard = { ...rtx40, hevcNvencUhq: true };
    const quality = resolve('quality', uhqCard);
    expect(quality).toMatchObject({ id: 'quality_hevc_gpu', encoder: 'hevc_nvenc', encoderPreset: 'p5', nvencUhq: true });
    const args = getResolvedVideoArgs({ strategy: quality, videoBitrate: 3_000_000, twoPass: false, videoProfile, sourceFps: 60, outputPlaybackRate: 1 });
    expect(getArgValue(args, '-tune')).toBe('uhq');
    expect(getArgValue(args, '-preset')).toBe('p5');
    expect(getArgValue(args, '-tag:v')).toBe('hvc1');
    // Without it (an unknown or older card), today's tuned settings.
    const hq = resolve('quality', rtx40);
    expect(hq.nvencUhq).toBeUndefined();
    expect(getArgValue(getResolvedVideoArgs({ strategy: hq, videoBitrate: 3_000_000, twoPass: false, videoProfile, sourceFps: 60, outputPlaybackRate: 1 }), '-tune')).toBe('hq');
    // Max quality on the card (an FFmpeg without x265) too, at p7 with the full-resolution first pass.
    expect(resolve('max_quality', { ...uhqCard, libx265: false })).toMatchObject({ id: 'max_quality_hevc_gpu', encoderPreset: 'p7', encoderMultipass: true, nvencUhq: true });
    // Also when Video format AV1 falls back to HEVC on a card without AV1.
    expect(resolve('quality', { ...uhqCard, av1Nvenc: false }, 'av1')).toMatchObject({ id: 'quality_hevc_gpu', encoderPreset: 'p5', nvencUhq: true });
    // Never for Fast, for basic settings, or on another maker's card.
    expect(resolve('fast', uhqCard).nvencUhq).toBeUndefined();
    expect(resolve('quality', { ...uhqCard, basicSettingsOnly: ['hevcNvenc'] })).toMatchObject({ encoderPreset: 'p6', basicEncoderSettings: true });
    expect(resolve('quality', { ...uhqCard, basicSettingsOnly: ['hevcNvenc'] }).nvencUhq).toBeUndefined();
    const amd: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcAmf: true, libx264: true, libx265: true, libsvtav1: true, hevcNvencUhq: true };
    expect(resolve('quality', amd)).toMatchObject({ encoder: 'hevc_amf', encoderPreset: 'p6' });
    expect(resolve('quality', amd).nvencUhq).toBeUndefined();
  });

  it('asks the card about the UHQ tuning apart from the tuned settings, so a card without it keeps them', () => {
    expect(getArgValue(getGpuProbeVideoArgs('hevc_nvenc'), '-tune')).toBe('hq');
    const uhq = getGpuProbeVideoArgs('hevc_nvenc', { nvencUhq: true });
    expect(getArgValue(uhq, '-tune')).toBe('uhq');
    // The rest as the tuned check: the most demanding settings an export uses.
    expect(getArgValue(uhq, '-multipass')).toBe('fullres');
    expect(getArgValue(uhq, '-preset')).toBe('p7');
  });

  it('keeps AMD and Intel on p3 for Fast: they read the preset on their own scales', () => {
    const intel: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcQsv: true, libx264: true, libx265: true, libsvtav1: true };
    expect(resolve('fast', intel)).toMatchObject({ encoder: 'hevc_qsv', encoderPreset: 'p3' });
    const amd: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcAmf: true, libx264: true, libx265: true, libsvtav1: true };
    expect(resolve('fast', amd)).toMatchObject({ encoder: 'hevc_amf', encoderPreset: 'p3' });
  });

  it('never makes AV1, whatever the PC has', () => {
    const cases: SizeLimitedEncoderCapabilities[] = [
      rtx40,
      gtx750(4),
      gtx750(16),
      noGpu,
      { ...noGpu, libx265: false },
      { ...noGpu, libx265: false, libx264: false },
      { h264Nvenc: false, av1Nvenc: false, av1Amf: true, hevcAmf: true, h264Amf: true, libx264: true, libx265: true, libsvtav1: true },
      { h264Nvenc: false, av1Nvenc: true, libx264: false, libsvtav1: true },
    ];
    for (const capabilities of cases) {
      for (const preset of presets) {
        const strategy = resolve(preset, capabilities);
        expect(strategy.effectiveCodec, `${preset} on ${JSON.stringify(capabilities)}`).not.toBe('av1');
        expect(['libsvtav1', 'av1_nvenc', 'av1_amf', 'av1_qsv']).not.toContain(strategy.encoder);
      }
    }
  });

  it("uses x265 for Quality when the graphics card can't make HEVC and the CPU keeps up, else the card's H.264", () => {
    expect(resolve('quality', gtx750(16))).toMatchObject({ id: 'quality_hevc_cpu', encoder: 'libx265', encoderPreset: 'fast', fallbackReason: 'gpu_hevc_unavailable' });
    expect(resolve('quality', gtx750(6))).toMatchObject({ id: 'quality_hevc_cpu', encoder: 'libx265' });
    expect(resolve('quality', gtx750(5))).toMatchObject({ id: 'quality_h264_gpu', encoder: 'h264_nvenc' });
    expect(resolve('quality', gtx750(4))).toMatchObject({ id: 'quality_h264_gpu', encoder: 'h264_nvenc', fallbackReason: 'gpu_hevc_unavailable' });
    // Without any GPU encoder, the CPU's HEVC however few threads: nothing quicker would be phone-safe and as sharp.
    expect(resolve('quality', { ...noGpu, cpuThreads: 2 })).toMatchObject({ id: 'quality_hevc_cpu', encoder: 'libx265' });
    expect(resolve('quality', { ...noGpu, cpuThreads: 2 }, 'av1')).toMatchObject({ id: 'quality_av1_cpu', encoder: 'libsvtav1' });
    // Fast is about speed: the card's H.264 first.
    expect(resolve('fast', gtx750(16))).toMatchObject({ id: 'fast_h264_gpu', encoder: 'h264_nvenc' });
  });

  it('stays on the CPU with HEVC when there is no graphics card encoder, or Use the GPU is off', () => {
    for (const capabilities of [noGpu, withoutGpuEncoders(rtx40)]) {
      expect(resolve('quality', capabilities)).toMatchObject({ id: 'quality_hevc_cpu', encoder: 'libx265', encoderPreset: 'fast' });
      expect(resolve('fast', capabilities)).toMatchObject({ id: 'fast_hevc_cpu', encoder: 'libx265', encoderPreset: 'veryfast' });
      expect(resolve('max_quality', capabilities)).toMatchObject({ id: 'max_quality_hevc_cpu', encoder: 'libx265' });
    }
  });

  it('steps down to phone-safe encoders when this FFmpeg has no x265', () => {
    const noX265 = { ...rtx40, libx265: false };
    expect(resolve('max_quality', noX265)).toMatchObject({ id: 'max_quality_hevc_gpu', encoder: 'hevc_nvenc', encoderPreset: 'p7', encoderMultipass: true, fallbackReason: 'x265_unavailable' });
    expect(resolve('max_quality', { ...noGpu, libx265: false })).toMatchObject({ id: 'max_quality_h264_cpu_two_pass', encoder: 'libx264', fallbackReason: 'hevc_unavailable' });
    expect(resolve('quality', { ...gtx750(16), libx265: false })).toMatchObject({ id: 'quality_h264_gpu', encoder: 'h264_nvenc' });
    expect(resolve('quality', { ...noGpu, libx265: false })).toMatchObject({ id: 'quality_h264_cpu', encoder: 'libx264', fallbackReason: 'hevc_unavailable' });
    expect(resolve('fast', { ...noGpu, libx265: false })).toMatchObject({ id: 'fast_h264_cpu', encoder: 'libx264' });
  });

  it("makes one pass where this FFmpeg can't run x265's two-pass", () => {
    expect(resolve('max_quality', { ...rtx40, x265TwoPass: false })).toMatchObject({ encoder: 'libx265', executionMode: 'single_pass' });
  });

  it('uses AMD and Intel HEVC the same way', () => {
    const amd: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcAmf: true, h264Amf: true, libx264: true, libx265: true, libsvtav1: true };
    expect(resolve('quality', amd)).toMatchObject({ id: 'quality_hevc_gpu', encoder: 'hevc_amf', hardware: 'amd' });
    const intel: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcQsv: true, h264Qsv: true, libx264: true, libx265: true, libsvtav1: true };
    expect(resolve('fast', intel)).toMatchObject({ id: 'fast_hevc_gpu', encoder: 'hevc_qsv', hardware: 'intel' });
  });
});

describe('Video format H.264', () => {
  it('never makes HEVC or AV1: the graphics card for Quality and Fast, x264 two-pass for Max quality', () => {
    for (const capabilities of [rtx40, gtx750(16), noGpu]) {
      for (const preset of presets) expect(resolve(preset, capabilities, 'h264').effectiveCodec).toBe('h264');
    }
    expect(resolve('quality', rtx40, 'h264')).toMatchObject({ id: 'quality_h264_gpu', encoder: 'h264_nvenc', encoderPreset: 'p6' });
    expect(resolve('quality', rtx40, 'h264').fallbackReason).toBeUndefined();
    expect(resolve('fast', rtx40, 'h264')).toMatchObject({ id: 'fast_h264_gpu', encoder: 'h264_nvenc', encoderPreset: 'p3' });
    expect(resolve('max_quality', rtx40, 'h264')).toMatchObject({ id: 'max_quality_h264_cpu_two_pass', encoder: 'libx264', executionMode: 'ffmpeg_two_pass' });
    expect(resolve('quality', noGpu, 'h264')).toMatchObject({ id: 'quality_h264_cpu', encoderPreset: 'slow' });
    expect(resolve('fast', noGpu, 'h264')).toMatchObject({ id: 'fast_h264_cpu', encoderPreset: 'veryfast' });
  });
});

describe('Video format AV1', () => {
  it('works as before HEVC became the default', () => {
    expect(resolve('quality', rtx40, 'av1')).toMatchObject({ id: 'quality_av1_nvenc', encoder: 'av1_nvenc' });
    expect(resolve('max_quality', rtx40, 'av1')).toMatchObject({ id: 'max_quality_av1_cpu', encoder: 'libsvtav1' });
    expect(resolve('quality', { ...rtx40, av1Nvenc: false }, 'av1')).toMatchObject({ id: 'quality_hevc_gpu', fallbackReason: 'gpu_av1_unavailable' });
  });
});

describe('Custom settings HEVC', () => {
  it('runs x265 at the chosen speed, in two passes when asked', () => {
    expect(resolve('quality', rtx40, 'av1', { encoder: 'hevc_cpu' })).toMatchObject({ id: 'advanced_hevc_cpu_single_pass', encoder: 'libx265', encoderPreset: 'medium', executionMode: 'single_pass', tuningProfile: 'advanced' });
    expect(resolve('quality', rtx40, 'av1', { encoder: 'hevc_cpu', twoPass: true })).toMatchObject({ id: 'advanced_hevc_cpu_two_pass', executionMode: 'ffmpeg_two_pass' });
    expect(resolve('quality', { ...rtx40, x265TwoPass: false }, 'av1', { encoder: 'hevc_cpu', twoPass: true })).toMatchObject({ executionMode: 'single_pass' });
  });

  it("runs the graphics card's HEVC, NVIDIA's or another maker's", () => {
    expect(resolve('quality', rtx40, 'hevc', { encoder: 'hevc_nvenc', twoPass: true })).toMatchObject({ id: 'advanced_hevc_nvenc_two_pass', encoder: 'hevc_nvenc', encoderPreset: 'p5', encoderMultipass: true });
    const amd: SizeLimitedEncoderCapabilities = { h264Nvenc: false, av1Nvenc: false, hevcAmf: true, libx264: true, libsvtav1: true };
    expect(resolve('quality', amd, 'hevc', { encoder: 'hevc_nvenc' })).toMatchObject({ id: 'advanced_hevc_gpu', encoder: 'hevc_amf', fallbackReason: 'nvidia_unavailable' });
  });
});

describe('x265 arguments', () => {
  it('gives Quality the measured settings: fast with RDOQ, SAO off, Main profile, hvc1 and the tight window', () => {
    const args = getResolvedVideoArgs({ strategy: resolve('quality', noGpu), videoBitrate: 4_000_000, twoPass: false, videoProfile, sourceFps: 60, outputPlaybackRate: 1 });
    expect(getArgValue(args, '-c:v')).toBe('libx265');
    expect(getArgValue(args, '-preset')).toBe('fast');
    expect(getArgValue(args, '-profile:v')).toBe('main');
    expect(getArgValue(args, '-pix_fmt')).toBe('yuv420p');
    expect(getArgValue(args, '-tag:v')).toBe('hvc1');
    expect(getArgValue(args, '-x265-params')).toBe('keyint=600:no-sao=1:rdoq-level=2:psy-rdoq=1.0:log-level=error');
    expect(getArgValue(args, '-b:v')).toBe('4000k');
    expect(getArgValue(args, '-maxrate')).toBe('4200k');
    expect(getArgValue(args, '-bufsize')).toBe('6000k');
  });

  it('keeps Fast plain veryfast', () => {
    const args = getResolvedVideoArgs({ strategy: resolve('fast', noGpu), videoBitrate: 4_000_000, twoPass: false, videoProfile, sourceFps: 30, outputPlaybackRate: 1 });
    expect(getArgValue(args, '-preset')).toBe('veryfast');
    expect(getArgValue(args, '-x265-params')).toBe('keyint=300:log-level=error');
  });

  it("gives Max quality's first pass x265's quicker settings and passes the stats file as its own option", () => {
    const strategy = resolve('max_quality', rtx40);
    const shared = {
      strategy,
      videoBitrate: 4_000_000,
      audioBitrate: 64_000,
      videoInputLabel: '0:0',
      audioInputLabel: '0:1',
      videoProfile,
      experimentalArgs: [],
      passlogFile: String.raw`C:\Users\me\AppData\Local\Temp\ClipPress\export.passlog.1`,
      sourceFps: 60,
      outputPlaybackRate: 1,
    };
    const pass1 = getSizeLimitedTwoPassEncodeArgs({ ...shared, outPath: 'pass1.mp4', passNumber: 1 });
    const pass2 = getSizeLimitedTwoPassEncodeArgs({ ...shared, outPath: 'out.mp4', passNumber: 2 });
    expect(getArgValue(pass1, '-x265-params')).toBe('keyint=600:no-sao=1:no-slow-firstpass=1:log-level=error');
    expect(getArgValue(pass2, '-x265-params')).toBe('keyint=600:no-sao=1:log-level=error');
    for (const args of [pass1, pass2]) {
      expect(getArgValue(args, '-x265-stats')).toBe(shared.passlogFile);
      expect(args).not.toContain('-passlogfile');
    }
    expect(getArgValue(pass1, '-pass')).toBe('1');
    expect(getArgValue(pass2, '-pass')).toBe('2');
  });

  it("keeps SVT-AV1's own pass log", () => {
    const args = getSizeLimitedTwoPassEncodeArgs({
      strategy: resolve('max_quality', rtx40, 'av1'),
      videoBitrate: 4_000_000,
      audioBitrate: 64_000,
      videoInputLabel: '0:0',
      audioInputLabel: undefined,
      videoProfile,
      experimentalArgs: [],
      passlogFile: 'log',
      outPath: 'out.mp4',
      passNumber: 2,
      sourceFps: 60,
      outputPlaybackRate: 1,
    });
    expect(getArgValue(args, '-passlogfile')).toBe('log');
    expect(args).not.toContain('-x265-stats');
  });
});

describe('x265 size planning', () => {
  it('aims two-pass close to the size, as it lands just under it, and one pass with the usual margin', () => {
    const twoPass = planSizeLimitedEncode({ targetSizeMb: 20, duration: 20, hasAudio: true, strategy: resolve('max_quality', rtx40) });
    expect(twoPass.firstAttemptTargetBytes / twoPass.hardTargetBytes).toBeCloseTo(0.97, 3);
    const onePass = planSizeLimitedEncode({ targetSizeMb: 20, duration: 20, hasAudio: true, strategy: resolve('quality', noGpu) });
    expect(onePass.firstAttemptTargetBytes / onePass.hardTargetBytes).toBeCloseTo(0.93, 3);
    // Not H.264's retry path: AV1's, which follows how far the last try went over.
    expect(onePass.strategyId).toBe('quality_hevc_cpu');
  });
});

describe('the saved encoder check', () => {
  const complete = {
    capabilities: {
      h264Nvenc: true,
      av1Nvenc: true,
      libx264: true,
      libx265: true,
      libsvtav1: true,
      svtTwoPass: true,
      x265TwoPass: true,
      h264Amf: false,
      av1Amf: false,
      hevcAmf: false,
      h264Qsv: false,
      av1Qsv: false,
      hevcQsv: false,
      hevcNvenc: true,
      hevcNvencUhq: true,
    },
    retest: [],
  };

  it('is trusted when it has every answer', () => {
    expect(isSavedEncoderCheck(complete)).toBe(true);
  });

  it("is tested again when saved before the UHQ question (it asks the card, which a check from before didn't)", () => {
    const { hevcNvencUhq, ...withoutUhq } = complete.capabilities;
    expect(hevcNvencUhq).toBe(true);
    expect(isSavedEncoderCheck({ ...complete, capabilities: withoutUhq })).toBe(false);
  });

  it('is tested again when saved before x265 (no answer for it, or for its two-pass)', () => {
    const { libx265, ...withoutX265 } = complete.capabilities;
    expect(libx265).toBe(true);
    expect(isSavedEncoderCheck({ ...complete, capabilities: withoutX265 })).toBe(false);
    const { x265TwoPass, ...withoutTwoPass } = complete.capabilities;
    expect(x265TwoPass).toBe(true);
    expect(isSavedEncoderCheck({ ...complete, capabilities: withoutTwoPass })).toBe(false);
  });
});

describe("a two-pass encode's leftovers", () => {
  it("include x265's stats, its .cutree and the .temp files a Cancel leaves", () => {
    const paths = getPassArtifactPaths(String.raw`C:\Temp\export.passlog.1`);
    for (const suffix of ['', '.temp', '.cutree', '.cutree.temp', '-0.log', '-0.log.mbtree', '-0.log.mbtree.temp']) {
      expect(paths).toContain(`C:\\Temp\\export.passlog.1${suffix}`);
    }
  });
});

describe('result notes', () => {
  const notesFor = (strategy: ReturnType<typeof resolve>, gpuSwitchedOff = false) => {
    const notices = new Set<string>();
    const warnings = new Set<string>();
    addSizeLimitedStrategyNotes({ strategy, notices, warnings, gpuSwitchedOff });
    return { notices: [...notices], warnings: [...warnings] };
  };
  const pcs: SizeLimitedEncoderCapabilities[] = [rtx40, gtx750(4), gtx750(16), noGpu, { ...noGpu, libx265: false }, { ...rtx40, libx265: false }, { ...noGpu, libx265: false, libx264: false, h264Nvenc: true }];

  it('never warn in the simple editor about a step down for HEVC or H.264 (the simple editor shows warnings)', () => {
    for (const videoFormat of ['hevc', 'h264'] as const) {
      for (const capabilities of pcs) {
        for (const preset of presets) {
          for (const gpuSwitchedOff of [false, true]) {
            const strategy = resolve(preset, gpuSwitchedOff ? withoutGpuEncoders(capabilities) : capabilities, videoFormat);
            const { notices, warnings } = notesFor(strategy, gpuSwitchedOff);
            expect(warnings, `${videoFormat} ${preset} ${JSON.stringify(capabilities)} GPU off: ${gpuSwitchedOff}`).toEqual([]);
            expect(notices.length).toBe(1);
            // Never blames a missing AV1 encoder for an HEVC or H.264 export.
            expect(notices[0]).not.toContain('AV1');
          }
        }
      }
    }
  });

  it('say what happened in plain words for the common step-downs', () => {
    expect(notesFor(resolve('quality', gtx750(16))).notices).toEqual(['This GPU has no HEVC encoder, so Quality used CPU HEVC (x265), which takes longer.']);
    expect(notesFor(resolve('quality', gtx750(4))).notices).toEqual(['This GPU has no HEVC encoder, so Quality used NVIDIA H.264.']);
    expect(notesFor(resolve('quality', withoutGpuEncoders(rtx40)), true).notices).toEqual(['Use the GPU is off, so CPU HEVC (x265) was used.']);
    // AV1 keeps its own wording from before HEVC became the default.
    expect(notesFor(resolve('quality', { ...gtx750(2), libx265: false }, 'av1')).notices).toEqual(['This GPU has no AV1 encoder, so Quality used NVIDIA H.264 to keep the export quick.']);
  });

  it("keep AV1's warning when it had to make H.264, as before", () => {
    expect(notesFor(resolve('quality', { ...noGpu, libsvtav1: false }, 'av1')).warnings).toEqual(['AV1 encoders were unavailable, so Quality fell back to H.264 CPU.']);
  });
});

describe('which encoders are tested again at the next start', () => {
  const base = { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true };
  const listed = () => true;

  const rtx30 = { ...base, h264Nvenc: true, hevcNvenc: true, av1Nvenc: false };
  const none = new Set<never>();

  it("tests a codec a working card lacks (an RTX 30's AV1) once more, then leaves it", () => {
    expect(getEncodersToRetest({ capabilities: rtx30, listed, unsure: none, failedBefore: none, adapters: ['nvidia'] })).toEqual(['av1Nvenc']);
    expect(getEncodersToRetest({ capabilities: rtx30, listed, unsure: none, failedBefore: new Set(['av1Nvenc'] as const), adapters: ['nvidia'] })).toEqual([]);
  });

  it('keeps testing it with two cards of that maker (FFmpeg may open the other one next time)', () => {
    const capabilities = { ...base, h264Amf: true, hevcAmf: true, av1Amf: false };
    expect(getEncodersToRetest({ capabilities, listed, unsure: none, failedBefore: new Set(['av1Amf'] as const), adapters: ['amd', 'amd'] })).toEqual(['av1Amf']);
  });

  it("tests again a card's encoders when none of them opened (it may only have been busy), or one timed out", () => {
    const failedBefore = new Set(['av1Nvenc', 'h264Nvenc', 'hevcNvenc'] as const);
    expect(getEncodersToRetest({ capabilities: base, listed, unsure: none, failedBefore, adapters: ['nvidia'] })).toEqual(['av1Nvenc', 'h264Nvenc', 'hevcNvenc']);
    expect(getEncodersToRetest({ capabilities: rtx30, listed, unsure: new Set(['av1Nvenc'] as const), failedBefore, adapters: ['nvidia'] })).toEqual(['av1Nvenc']);
  });

  it("never tests a maker's encoders when it has no card here", () => {
    expect(getEncodersToRetest({ capabilities: { ...base, h264Nvenc: true }, listed, unsure: none, failedBefore: none, adapters: ['nvidia'] })).not.toContain('h264Amf');
  });
});
