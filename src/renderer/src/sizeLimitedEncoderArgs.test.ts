import { describe, expect, it } from 'vitest';

import { getEncodedFrameRate, getHevcLevel, getResolvedVideoArgs, parseFfprobeRate } from './sizeLimitedEncoderArgs';
import type { SizeLimitedEncodedFrame } from './sizeLimitedEncoderArgs';
import { resolveSizeLimitedStrategy } from './sizeLimitedStrategy';
import type { SizeLimitedEncoderCapabilities } from './sizeLimitedTypes';

const fullCapabilities = { h264Nvenc: true, av1Nvenc: true, libx264: true, libsvtav1: true } as const;
const defaultStrategyArgs = {
  advancedAv1CpuPreset: 6,
  advancedAv1NvencPreset: 'p6',
  advancedH264CpuPreset: 'slow',
  advancedH264NvencPreset: 'p4',
  advancedHevcCpuPreset: 'fast',
  advancedHevcNvencPreset: 'p6',
  // These cases check the AV1 order, as it was before HEVC became the default (that has its own tests).
  videoFormat: 'av1',
} as const;

function getArgValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

describe('getResolvedVideoArgs', () => {
  it('keeps max quality on svt-av1 with tune=0 and long keyint', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('libsvtav1');
    expect(getArgValue(args, '-preset')).toBe('5');
    expect(getArgValue(args, '-svtav1-params')).toBe('tune=0:keyint=600');
  });

  it('turns on quantisation matrices for quality and fast svt-av1 only', () => {
    const argsFor = (preset: 'quality' | 'fast', controlMode: 'simple' | 'advanced' = 'simple') => getResolvedVideoArgs({
      strategy: resolveSizeLimitedStrategy({
        controlMode,
        preset,
        advancedEncoder: 'av1_cpu',
        advancedTwoPass: false,
        ...defaultStrategyArgs,
        capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true },
      }),
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(argsFor('quality'), '-preset')).toBe('7');
    expect(getArgValue(argsFor('quality'), '-svtav1-params')).toBe('enable-qm=1');
    expect(getArgValue(argsFor('fast'), '-svtav1-params')).toBe('enable-qm=1');
    expect(argsFor('quality', 'advanced')).not.toContain('-svtav1-params');
  });

  it('runs max quality h264 cpu two-pass at slow with the quality params', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'max_quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: false },
    });
    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: true,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(strategy.executionMode).toBe('ffmpeg_two_pass');
    expect(getArgValue(args, '-preset')).toBe('slow');
    expect(getArgValue(args, '-x264-params')).toBe('aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3');
  });

  it('makes fast av1 nvenc clearly speed-first', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('av1_nvenc');
    expect(getArgValue(args, '-preset')).toBe('p1');
    expect(getArgValue(args, '-cq')).toBe('33');
    expect(getArgValue(args, '-rc-lookahead')).toBe('4');
    expect(getArgValue(args, '-temporal-aq')).toBe('0');
    expect(getArgValue(args, '-aq-strength')).toBe('4');
    expect(args.includes('-b_ref_mode')).toBe(false);
  });

  it('keeps libx264 on the tighter size-first bitrate window', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_cpu',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('libx264');
    expect(getArgValue(args, '-maxrate')).toBe('4200k');
    expect(getArgValue(args, '-bufsize')).toBe('6000k');
  });

  it('keeps non-fast h264 nvenc on size-first vbr with quarter-res multipass, without cq', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe('h264_nvenc');
    expect(getArgValue(args, '-rc')).toBe('vbr');
    expect(getArgValue(args, '-strict_gop')).toBe('1');
    expect(getArgValue(args, '-cq')).toBeUndefined();
    expect(getArgValue(args, '-multipass')).toBe('qres');
    expect(getArgValue(args, '-maxrate')).toBe('4200k');
    expect(getArgValue(args, '-bufsize')).toBe('6000k');
  });
});

describe('getResolvedVideoArgs with a relaxed quality cap', () => {
  const videoProfile = { outputFps: undefined, scale: undefined } as never;

  const av1NvencArgs = (qualityCapOffset: number | undefined, preset: 'quality' | 'max_quality' | 'fast' = 'quality') => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset,
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });
    return getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile,
      sourceFps: 60,
      outputPlaybackRate: 1,
      qualityCapOffset,
    });
  };

  it('lowers the NVENC AV1 quality cap so the encoder can spend the budget', () => {
    // -cq is a quality ceiling in VBR mode, so on easy content it, not the bitrate,
    // decides the file size. A top-up has to move it or nothing changes.
    const baseline = getArgValue(av1NvencArgs(undefined), '-cq');
    const relaxed = getArgValue(av1NvencArgs(14), '-cq');

    expect(Number(relaxed)).toBeLessThan(Number(baseline));
  });

  it('never drops the cap below a sane floor', () => {
    for (const preset of ['quality', 'max_quality', 'fast'] as const) {
      expect(Number(getArgValue(av1NvencArgs(14, preset), '-cq'))).toBeGreaterThanOrEqual(10);
    }
  });

  it('leaves everything except the cap alone', () => {
    const baseline = av1NvencArgs(undefined);
    const relaxed = av1NvencArgs(14);

    expect(relaxed).toHaveLength(baseline.length);
    const cqIndex = baseline.indexOf('-cq');
    expect(relaxed.filter((_, i) => i !== cqIndex + 1)).toEqual(baseline.filter((_, i) => i !== cqIndex + 1));
  });

  it('still bounds the peak bitrate, so the cap cannot be blown past', () => {
    const relaxed = av1NvencArgs(14);
    expect(getArgValue(relaxed, '-maxrate')).toBeDefined();
    expect(getArgValue(relaxed, '-bufsize')).toBeDefined();
  });

  it('is a no-op for encoders that are not quality-capped', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'quality',
      advancedEncoder: 'h264_cpu',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });
    const args = (qualityCapOffset: number | undefined) => getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile,
      sourceFps: 60,
      outputPlaybackRate: 1,
      qualityCapOffset,
    });

    expect(args(14)).toEqual(args(undefined));
  });

  it('runs a 2-pass NVENC request as one full-resolution multipass encode', () => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: 'fast',
      advancedEncoder: 'av1_nvenc',
      advancedTwoPass: true,
      ...defaultStrategyArgs,
      capabilities: fullCapabilities,
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-multipass')).toBe('fullres');
  });

  it.each([
    ['av1_amf', { av1Amf: true }, '-quality', 'quality'],
    ['av1_qsv', { av1Qsv: true }, '-preset', 'slower'],
  ] as const)('drives %s with a peak-limited bitrate window', (encoder, gpu, presetFlag, presetValue) => {
    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset: 'quality',
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true, ...gpu },
    });

    const args = getResolvedVideoArgs({
      strategy,
      videoBitrate: 4_000_000,
      twoPass: false,
      videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
      sourceFps: 60,
      outputPlaybackRate: 1,
    });

    expect(getArgValue(args, '-c:v')).toBe(encoder);
    expect(getArgValue(args, presetFlag)).toBe(presetValue);
    expect(getArgValue(args, '-pix_fmt')).toBe('nv12');
    expect(getArgValue(args, '-b:v')).toBe('4000k');
    expect(getArgValue(args, '-maxrate')).toBe('4320k');
    if (encoder === 'av1_amf') expect(getArgValue(args, '-rc')).toBe('vbr_peak');
  });
});

describe('GPU vendor settings', () => {
  const resolveVendorArgs = (gpu: Partial<SizeLimitedEncoderCapabilities>, preset: 'quality' | 'fast' = 'quality') => getResolvedVideoArgs({
    strategy: resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset,
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: false, cpuThreads: 4, ...gpu },
    }),
    videoBitrate: 4_000_000,
    twoPass: false,
    videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
    sourceFps: 60,
    outputPlaybackRate: 1,
  });

  it('gives AMD its quality tools, pre-analysis and B-frames, with a 10 s keyframe interval', () => {
    const av1 = resolveVendorArgs({ av1Amf: true });
    expect(getArgValue(av1, '-aq_mode')).toBe('caq');
    expect(getArgValue(av1, '-enforce_hrd')).toBe('1');
    expect(getArgValue(av1, '-preanalysis')).toBe('1');
    expect(Number(getArgValue(av1, '-pa_lookahead_buffer_depth'))).toBeLessThan(16);
    expect(getArgValue(av1, '-bf')).toBe('2');
    expect(getArgValue(av1, '-g')).toBe('600');

    const h264 = resolveVendorArgs({ h264Amf: true });
    expect(getArgValue(h264, '-c:v')).toBe('h264_amf');
    expect(getArgValue(h264, '-profile:v')).toBe('high');
    expect(getArgValue(h264, '-vbaq')).toBe('1');
    expect(getArgValue(h264, '-preencode')).toBe('1');
    expect(getArgValue(h264, '-g')).toBe('600');
  });

  it('keeps Fast quick on AMD and Intel (no pre-analysis or look-ahead)', () => {
    expect(getArgValue(resolveVendorArgs({ av1Amf: true }, 'fast'), '-preanalysis')).toBeUndefined();
    expect(getArgValue(resolveVendorArgs({ av1Qsv: true }, 'fast'), '-extbrc')).toBeUndefined();
  });

  it('gives Intel its look-ahead rate control, and H.264 no minimum bitrate', () => {
    const h264 = resolveVendorArgs({ h264Qsv: true });
    expect(getArgValue(h264, '-extbrc')).toBe('1');
    expect(getArgValue(h264, '-look_ahead_depth')).toBe('40');
    expect(getArgValue(h264, '-bitrate_limit')).toBe('0');
    expect(h264).not.toContain('-look_ahead');
  });

  it.each([
    [{ av1Amf: true, basicSettingsOnly: ['av1Amf'] }, ['-c:v', 'av1_amf', '-usage', 'transcoding', '-quality', 'quality', '-rc', 'vbr_peak', '-pix_fmt', 'nv12']],
    [{ h264Qsv: true, basicSettingsOnly: ['h264Qsv'] }, ['-c:v', 'h264_qsv', '-preset', 'slower', '-pix_fmt', 'nv12']],
  ] as const)('keeps a card that turned the tuned settings down on the plain ones', (gpu, plain) => {
    expect(resolveVendorArgs(gpu).slice(0, plain.length)).toEqual(plain);
  });

  it("drops the look-ahead, temporal AQ and B-frame references NVENC's basic settings can't count on", () => {
    const args = resolveVendorArgs({ h264Nvenc: true, basicSettingsOnly: ['h264Nvenc'] });
    expect(getArgValue(args, '-c:v')).toBe('h264_nvenc');
    expect(args).not.toContain('-b_ref_mode');
    expect(args).not.toContain('-temporal-aq');
    expect(args).not.toContain('-rc-lookahead');
  });

  it('makes HEVC in Main profile, tagged hvc1 for Apple players, in a tight bitrate window', () => {
    const nvenc = resolveVendorArgs({ hevcNvenc: true, h264Nvenc: true });
    expect(getArgValue(nvenc, '-c:v')).toBe('hevc_nvenc');
    expect(getArgValue(nvenc, '-profile:v')).toBe('main');
    expect(getArgValue(nvenc, '-tag:v')).toBe('hvc1');
    expect(getArgValue(nvenc, '-b_ref_mode')).toBe('middle');
    expect(getArgValue(nvenc, '-temporal-aq')).toBe('1');
    expect(getArgValue(nvenc, '-maxrate')).toBe('4200k');

    const nvencBasic = resolveVendorArgs({ hevcNvenc: true, basicSettingsOnly: ['hevcNvenc'] });
    expect(nvencBasic).not.toContain('-b_ref_mode');
    expect(nvencBasic).not.toContain('-temporal-aq');
    expect(getArgValue(nvencBasic, '-tag:v')).toBe('hvc1');

    const amf = resolveVendorArgs({ hevcAmf: true });
    expect(getArgValue(amf, '-c:v')).toBe('hevc_amf');
    expect(getArgValue(amf, '-profile:v')).toBe('main');
    expect(getArgValue(amf, '-preanalysis')).toBe('1');
    expect(amf).not.toContain('-bf');
    expect(getArgValue(amf, '-tag:v')).toBe('hvc1');

    const qsv = resolveVendorArgs({ hevcQsv: true });
    expect(getArgValue(qsv, '-c:v')).toBe('hevc_qsv');
    expect(getArgValue(qsv, '-profile:v')).toBe('main');
    expect(qsv).not.toContain('-bitrate_limit');
    expect(getArgValue(qsv, '-tag:v')).toBe('hvc1');
  });
});

describe('getHevcLevel', () => {
  // ClipPress's window: a peak of 1.05 and a buffer of 1.5 times the bitrate.
  const level = (width: number, height: number, fps: number, bitrate: number) => getHevcLevel({ width, height, fps, maxBitrate: bitrate * 1.05, bufferSize: bitrate * 1.5 });

  it('gives the smallest level the picture, its rate, its peak bitrate and its buffer fit', () => {
    expect(level(1920, 1080, 60, 8_000_000)).toBe(123);
    expect(level(1920, 1080, 30, 8_000_000)).toBe(120);
    expect(level(1440, 1080, 30, 8_000_000)).toBe(120);
    expect(level(1280, 720, 30, 4_000_000)).toBe(93);
    expect(level(2560, 1440, 60, 12_000_000)).toBe(150);
    expect(level(3840, 2160, 60, 20_000_000)).toBe(153);
    // A short clip at 20 MB has a bigger buffer than 4.1's 22 Mbit (1.1 x 20): 14.6 Mbps fits, 14.7 doesn't.
    expect(level(1920, 1080, 60, 14_600_000)).toBe(123);
    expect(level(1920, 1080, 60, 14_700_000)).toBe(150);
    expect(level(7680, 4320, 120, 900_000_000)).toBe(186);
  });
});

describe('AMD and Intel HEVC, from their own recipes', () => {
  const frame1080p60: SizeLimitedEncodedFrame = { width: 1920, height: 1080, fps: 60 };
  const args = (gpu: Partial<SizeLimitedEncoderCapabilities>, preset: 'quality' | 'fast' = 'quality', frame: SizeLimitedEncodedFrame | null = frame1080p60) => getResolvedVideoArgs({
    strategy: resolveSizeLimitedStrategy({
      controlMode: 'simple',
      preset,
      advancedEncoder: 'h264_nvenc',
      advancedTwoPass: false,
      ...defaultStrategyArgs,
      videoFormat: 'hevc',
      capabilities: { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: false, cpuThreads: 4, ...gpu },
    }),
    videoBitrate: 4_000_000,
    twoPass: false,
    videoProfile: { outputWidth: undefined, outputHeight: undefined, outputFps: undefined },
    sourceFps: 60,
    outputPlaybackRate: 1,
    frame: frame ?? undefined,
  });

  it("declares AMD HEVC's level in every tier, and leaves it to AMD when the picture isn't known", () => {
    expect(getArgValue(args({ hevcAmf: true }), '-level:v')).toBe('123');
    expect(getArgValue(args({ hevcAmf: true }, 'fast'), '-level:v')).toBe('123');
    expect(getArgValue(args({ hevcAmf: true, basicSettingsOnly: ['hevcAmf'] }), '-level:v')).toBe('123');
    expect(args({ hevcAmf: true }, 'quality', null)).not.toContain('-level:v');
    // H.264's own default is right, and AV1 isn't changed here.
    expect(args({ h264Amf: true })).not.toContain('-level:v');
  });

  it("gives AMD HEVC AMD's 40-frame look-ahead, the motion boost for Fast, and never B-frames", () => {
    const quality = args({ hevcAmf: true });
    expect(getArgValue(quality, '-pa_lookahead_buffer_depth')).toBe('40');
    expect(quality).not.toContain('-bf');
    const fast = args({ hevcAmf: true }, 'fast');
    expect(fast).not.toContain('-preanalysis');
    expect(getArgValue(fast, '-high_motion_quality_boost_enable')).toBe('1');
    // H.264 keeps its depth.
    expect(getArgValue(args({ h264Amf: true }), '-pa_lookahead_buffer_depth')).toBe('11');
  });

  it("keeps AMD HEVC's basic settings plain, with the GOP and bitrate limits every card has", () => {
    const basic = args({ hevcAmf: true, basicSettingsOnly: ['hevcAmf'] });
    expect(getArgValue(basic, '-enforce_hrd')).toBe('1');
    expect(getArgValue(basic, '-g')).toBe('600');
    for (const tuned of ['-preanalysis', '-vbaq', '-preencode', '-high_motion_quality_boost_enable']) expect(basic).not.toContain(tuned);
  });

  it('gives Intel HEVC 4 references, and its profile and GOP in the basic settings too', () => {
    expect(getArgValue(args({ hevcQsv: true }), '-refs')).toBe('4');
    expect(args({ hevcQsv: true }, 'fast')).not.toContain('-refs');
    const basic = args({ hevcQsv: true, basicSettingsOnly: ['hevcQsv'] });
    expect(getArgValue(basic, '-profile:v')).toBe('main');
    expect(getArgValue(basic, '-g')).toBe('600');
    expect(basic).not.toContain('-extbrc');
    // H.264's are unchanged.
    expect(args({ h264Qsv: true })).not.toContain('-refs');
  });
});

describe('getEncodedFrameRate', () => {
  it("is FFmpeg's guess: the nominal rate, unless it's a time base, and never under the average", () => {
    // A variable-rate recording that averages 30 but runs at 60 in places: FFmpeg encodes at 60.
    expect(getEncodedFrameRate({ nominal: parseFfprobeRate('60/1'), average: 30 })).toBe(60);
    expect(getEncodedFrameRate({ nominal: parseFfprobeRate('30000/1001'), average: 29.97 })).toBeCloseTo(29.97, 2);
    // A time base reported as the rate: FFmpeg takes the average.
    expect(getEncodedFrameRate({ nominal: parseFfprobeRate('1000/1'), average: 59.6 })).toBe(59.6);
    expect(getEncodedFrameRate({ nominal: 24, average: 30 })).toBe(30);
    expect(getEncodedFrameRate({ nominal: undefined, average: 30 })).toBe(30);
    expect(getEncodedFrameRate({ nominal: undefined, average: undefined })).toBeUndefined();
    expect(parseFfprobeRate('0/0')).toBeUndefined();
    expect(parseFfprobeRate(undefined)).toBeUndefined();
  });
});
