import { describe, expect, it, vi } from 'vitest';

import {
  getAmfQualityPreset,
  getHardwareDecodeArgs,
  getQsvPreset,
  getRegularExportVideoArgs,
  maxHardwareDecodePixels,
  pickGpuEncoder,
  runWithGpuFallbacksCore,
  shouldUseHardwareDecode,
} from './gpuEncoders';

const noGpu = { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true } as const;

describe('pickGpuEncoder', () => {
  it('prefers NVIDIA, then AMD, then Intel', () => {
    expect(pickGpuEncoder({ ...noGpu, av1Qsv: true, av1Amf: true }, 'av1')?.encoder).toBe('av1_amf');
    expect(pickGpuEncoder({ ...noGpu, h264Qsv: true, h264Nvenc: true }, 'h264')?.encoder).toBe('h264_nvenc');
    expect(pickGpuEncoder({ ...noGpu, h264Qsv: true }, 'av1')).toBeUndefined();
  });
});

describe('vendor presets', () => {
  it('maps NVENC preset levels onto AMD quality modes', () => {
    expect(getAmfQualityPreset('h264_amf', 'p1')).toBe('speed');
    expect(getAmfQualityPreset('h264_amf', 'p4')).toBe('balanced');
    expect(getAmfQualityPreset('h264_amf', 'p7')).toBe('quality');
    expect(getAmfQualityPreset('av1_amf', 'p6')).toBe('quality');
    expect(getAmfQualityPreset('av1_amf', 'p7')).toBe('high_quality');
  });

  it('maps NVENC preset levels onto Quick Sync presets', () => {
    expect(getQsvPreset('p1')).toBe('veryfast');
    expect(getQsvPreset('p4')).toBe('medium');
    expect(getQsvPreset('p7')).toBe('veryslow');
  });
});

describe('shouldUseHardwareDecode', () => {
  const base = { platform: 'win32', enabled: true, inputCount: 1, width: 1920, height: 1080, cpuThreads: 4 };

  it('decodes on the GPU on Windows when enabled', () => {
    expect(shouldUseHardwareDecode(base)).toBe(true);
    expect(getHardwareDecodeArgs(true)).toEqual(['-hwaccel', 'd3d11va']);
    expect(getHardwareDecodeArgs(false)).toEqual([]);
  });

  it('stays on the CPU when disabled, off Windows, or without dimensions', () => {
    expect(shouldUseHardwareDecode({ ...base, enabled: false })).toBe(false);
    expect(shouldUseHardwareDecode({ ...base, platform: 'linux' })).toBe(false);
    expect(shouldUseHardwareDecode({ ...base, width: undefined })).toBe(false);
  });

  it('keeps merges on the CPU when the CPU is large enough to be faster', () => {
    expect(shouldUseHardwareDecode({ ...base, inputCount: 3, cpuThreads: 16 })).toBe(false);
    expect(shouldUseHardwareDecode({ ...base, inputCount: 1, cpuThreads: 16 })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, inputCount: 3, cpuThreads: 4 })).toBe(true);
  });

  it('limits how many decoders a merged export opens at once', () => {
    const maxInputs = Math.floor(maxHardwareDecodePixels / (1920 * 1080));
    expect(shouldUseHardwareDecode({ ...base, inputCount: maxInputs })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, inputCount: maxInputs + 1 })).toBe(false);
    expect(shouldUseHardwareDecode({ ...base, width: 3840, height: 2160, inputCount: 2 })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, width: 3840, height: 2160, inputCount: 3 })).toBe(false);
  });
});

describe('getRegularExportVideoArgs', () => {
  it('uses a quality mode on each GPU and x264 otherwise', () => {
    expect(getRegularExportVideoArgs('h264_nvenc')).toEqual(expect.arrayContaining(['h264_nvenc', '-cq', '19']));
    expect(getRegularExportVideoArgs('h264_amf')).toEqual(expect.arrayContaining(['h264_amf', '-rc', 'cqp']));
    expect(getRegularExportVideoArgs('h264_qsv')).toEqual(expect.arrayContaining(['h264_qsv', '-global_quality', '20']));
    expect(getRegularExportVideoArgs(undefined)).toEqual(['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p']);
  });
});

describe('runWithGpuFallbacksCore', () => {
  const ffmpegError = new Error('ffmpeg failed');
  const isRetryableFailure = (error: unknown) => error === ffmpegError;

  it('retries without GPU decoding and remembers that the decoder failed', async () => {
    const run = vi.fn(async (hardwareDecode: boolean) => {
      if (hardwareDecode) throw ffmpegError;
      return 'done';
    });
    const onHardwareDecodeFailed = vi.fn();

    await expect(runWithGpuFallbacksCore({ hardwareDecode: true, run, isRetryableFailure, onHardwareDecodeFailed })).resolves.toBe('done');
    expect(run.mock.calls).toEqual([[true], [false]]);
    expect(onHardwareDecodeFailed).toHaveBeenCalledOnce();
  });

  it('moves to the next encoder, restoring GPU decoding, when the decoder was not at fault', async () => {
    let encoder = 'av1_amf';
    const run = vi.fn(async () => {
      if (encoder === 'av1_amf') throw ffmpegError;
      return encoder;
    });
    const onGpuEncoderFailed = vi.fn(async () => {
      encoder = 'libsvtav1';
      return true;
    });
    const onHardwareDecodeFailed = vi.fn();

    await expect(runWithGpuFallbacksCore({ hardwareDecode: true, run, onGpuEncoderFailed, isRetryableFailure, onHardwareDecodeFailed })).resolves.toBe('libsvtav1');
    expect(run.mock.calls).toEqual([[true], [false], [true]]);
    expect(onHardwareDecodeFailed).not.toHaveBeenCalled();
  });

  it('rethrows cancels and failures with nothing left to try', async () => {
    const cancel = new Error('cancelled');
    await expect(runWithGpuFallbacksCore({
      hardwareDecode: true,
      run: async () => { throw cancel; },
      isRetryableFailure,
      onHardwareDecodeFailed: () => undefined,
    })).rejects.toBe(cancel);

    await expect(runWithGpuFallbacksCore({
      hardwareDecode: false,
      run: async () => { throw ffmpegError; },
      onGpuEncoderFailed: async () => false,
      isRetryableFailure,
      onHardwareDecodeFailed: () => undefined,
    })).rejects.toBe(ffmpegError);
  });
});
