import { describe, expect, it, vi } from 'vitest';

import {
  getAmfQualityPreset,
  getGpuFramesDownloadFormat,
  getFrameDropFilter,
  getGpuFramesFilter,
  getHardwareDecodeArgs,
  getQsvPreset,
  maxGpuFramesClips,
  getRegularExportVideoArgs,
  maxHardwareDecodePixels,
  pickGpuEncoder,
  runWithGpuFallbacksCore,
  shouldKeepFramesOnGpu,
  shouldUseHardwareDecode,
  withoutGpuEncoders,
} from './gpuEncoders';

const noGpu = { h264Nvenc: false, av1Nvenc: false, libx264: true, libsvtav1: true } as const;

describe('pickGpuEncoder', () => {
  it('prefers NVIDIA, then AMD, then Intel', () => {
    expect(pickGpuEncoder({ ...noGpu, av1Qsv: true, av1Amf: true }, 'av1')?.encoder).toBe('av1_amf');
    expect(pickGpuEncoder({ ...noGpu, h264Qsv: true, h264Nvenc: true }, 'h264')?.encoder).toBe('h264_nvenc');
    expect(pickGpuEncoder({ ...noGpu, h264Qsv: true }, 'av1')).toBeUndefined();
  });

  it('finds nothing on the graphics card once Use the GPU is off', () => {
    const cpuOnly = withoutGpuEncoders({ ...noGpu, av1Nvenc: true, h264Nvenc: true, av1Amf: true, h264Qsv: true, cpuThreads: 16 });
    expect(pickGpuEncoder(cpuOnly, 'av1')).toBeUndefined();
    expect(pickGpuEncoder(cpuOnly, 'h264')).toBeUndefined();
    expect(cpuOnly).toMatchObject({ libx264: true, libsvtav1: true, cpuThreads: 16 });
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
  const base = { platform: 'win32', enabled: true, inputCount: 1, width: 1920, height: 1080 };

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

  it('decodes merges on the GPU too', () => {
    expect(shouldUseHardwareDecode({ ...base, inputCount: 2 })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, inputCount: 3 })).toBe(true);
  });

  it('limits how many decoders a merged export opens at once', () => {
    const maxInputs = Math.floor(maxHardwareDecodePixels / (1920 * 1080));
    expect(shouldUseHardwareDecode({ ...base, inputCount: maxInputs })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, inputCount: maxInputs + 1 })).toBe(false);
    expect(shouldUseHardwareDecode({ ...base, width: 3840, height: 2160, inputCount: 2 })).toBe(true);
    expect(shouldUseHardwareDecode({ ...base, width: 3840, height: 2160, inputCount: 3 })).toBe(false);
  });
});

describe('frames kept on the GPU', () => {
  it('asks the decoder to keep them there', () => {
    expect(getHardwareDecodeArgs(true, true)).toEqual(['-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11']);
    expect(getHardwareDecodeArgs(false, true)).toEqual([]);
  });

  it('copies them off in the format D3D11 decodes 8-bit and 10-bit video to', () => {
    expect(getGpuFramesDownloadFormat('yuv420p')).toBe('nv12');
    expect(getGpuFramesDownloadFormat('yuvj420p')).toBe('nv12');
    expect(getGpuFramesDownloadFormat('yuv420p10le')).toBe('p010');
    expect(getGpuFramesDownloadFormat('yuv444p')).toBeUndefined();
    expect(getGpuFramesDownloadFormat(undefined)).toBeUndefined();
  });

  it('drops a sped-up clip to the export frame rate before copying', () => {
    expect(getGpuFramesFilter({ rate: 4, downloadFormat: 'nv12', outputFps: undefined })).toBe('fps=source_fps,hwdownload,format=nv12');
    expect(getGpuFramesFilter({ rate: 2, downloadFormat: 'p010', outputFps: 30 })).toBe('fps=30,hwdownload,format=p010');
    // Frames copied as they're decoded: a sped-up clip drops the unkept ones before its crop, text and scale.
    expect(getFrameDropFilter({ rate: 4, outputFps: undefined, duration: 10, keptFps: 60 })).toBe('fps=source_fps');
    expect(getFrameDropFilter({ rate: 2, outputFps: 30, duration: 10, keptFps: 30 })).toBe('fps=30');
    expect(getFrameDropFilter({ rate: 1, outputFps: 30, duration: 10, keptFps: 30 })).toBeUndefined();
    expect(getFrameDropFilter({ rate: 0.5, outputFps: undefined, duration: 10, keptFps: 60 })).toBeUndefined();
    // Under two frames at the kept rate (or that rate unknown), all go to the encoder, which keeps at least one.
    expect(getFrameDropFilter({ rate: 16, outputFps: undefined, duration: 0.0125, keptFps: 30 })).toBeUndefined();
    expect(getFrameDropFilter({ rate: 8, outputFps: undefined, duration: 0.125, keptFps: 2 })).toBeUndefined();
    expect(getFrameDropFilter({ rate: 4, outputFps: undefined, duration: 10, keptFps: undefined })).toBeUndefined();
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 16, duration: 0.0125 }], rotation: undefined, lowestFps: 30 })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 8, duration: 0.125 }], rotation: undefined, lowestFps: 2 })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 1, duration: 0.05 }], rotation: undefined, lowestFps: 30, mayLowerFps: true })).toBe(false);
  });

  it('is for sped-up exports of up to three clips, not turned', () => {
    const clip = (rate: number, duration = 5) => ({ rate, duration });
    const keep = (clips: { rate: number, duration: number }[], rotation?: number) => shouldKeepFramesOnGpu({ clips, rotation, lowestFps: 30 });
    expect(keep([clip(4)])).toBe(true);
    expect(keep([clip(4), clip(1), clip(0.5)], 0)).toBe(true);
    expect(keep([clip(1)])).toBe(false);
    expect(keep([clip(0.5), clip(1)])).toBe(false);
    expect(keep(Array.from({ length: maxGpuFramesClips + 1 }, () => clip(4)))).toBe(false);
    expect(keep([clip(4)], 90)).toBe(false);
    expect(keep([clip(4)], 360)).toBe(true);
  });

  it('leaves joins with a sped-up clip under two frames long to the old path', () => {
    const clips = [{ rate: 4, duration: 1 / 30 }, { rate: 1, duration: 5 }];
    expect(shouldKeepFramesOnGpu({ clips, rotation: undefined, lowestFps: 30 })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 4, duration: 2 / 30 }, { rate: 1, duration: 1 / 30 }], rotation: undefined, lowestFps: 30 })).toBe(true);
    // One clip has no join to move (but under two frames its frames all go to the encoder).
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 4, duration: 2 / 30 }], rotation: undefined, lowestFps: 30 })).toBe(true);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 4, duration: 1 / 30 }], rotation: undefined, lowestFps: 30 })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 4, duration: 5 }], rotation: undefined, lowestFps: undefined })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 4, duration: 5 }, { rate: 4, duration: 5 }], rotation: undefined, lowestFps: undefined })).toBe(false);
  });

  it('copies every frame of a clip at normal speed or slower', () => {
    expect(getGpuFramesFilter({ rate: 1, downloadFormat: 'nv12', outputFps: 30 })).toBe('hwdownload,format=nv12');
    // A single clip lowered to 30 fps drops the other half on the GPU too; at its own rate it only copies.
    expect(getGpuFramesFilter({ rate: 1, downloadFormat: 'nv12', outputFps: 30, dropToLoweredFps: true })).toBe('fps=30,hwdownload,format=nv12');
    expect(getGpuFramesFilter({ rate: 1, downloadFormat: 'nv12', outputFps: undefined, dropToLoweredFps: true })).toBe('hwdownload,format=nv12');
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 1, duration: 120 }], rotation: undefined, lowestFps: 30, mayLowerFps: true })).toBe(true);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 1, duration: 120 }], rotation: undefined, lowestFps: 30 })).toBe(false);
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 1, duration: 120 }], rotation: 90, lowestFps: 30, mayLowerFps: true })).toBe(false);
    // Joins at their own speed keep their exact path.
    expect(shouldKeepFramesOnGpu({ clips: [{ rate: 1, duration: 60 }, { rate: 1, duration: 60 }], rotation: undefined, lowestFps: 30, mayLowerFps: true })).toBe(false);
    expect(getGpuFramesFilter({ rate: 0.5, downloadFormat: 'nv12', outputFps: undefined })).toBe('hwdownload,format=nv12');
  });
});

describe('getRegularExportVideoArgs', () => {
  it('uses a quality mode on each GPU and x264 otherwise', () => {
    expect(getRegularExportVideoArgs('h264_nvenc')).toEqual(expect.arrayContaining(['h264_nvenc', '-cq', '19']));
    expect(getRegularExportVideoArgs('h264_amf')).toEqual(expect.arrayContaining(['h264_amf', '-rc', 'cqp']));
    expect(getRegularExportVideoArgs('h264_qsv')).toEqual(expect.arrayContaining(['h264_qsv', '-global_quality', '20']));
    expect(getRegularExportVideoArgs(undefined)).toEqual(['-c:v', 'libx264', '-preset', 'faster', '-crf', '18', '-pix_fmt', 'yuv420p']);
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
