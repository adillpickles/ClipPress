import { describe, expect, it } from 'vitest';

import {
  buildSizeLimitedVideoFilter,
  buildSizeLimitedVideoTransformFilters,
  getSizeLimitedDisplayDimensions,
  getSizeLimitedSimpleFpsOptions,
  getSizeLimitedSimpleResolutionOptions,
  resolveEffectiveSizeLimitedSimpleSettings,
  resolveSizeLimitedOutputDimensions,
  resolveSizeLimitedVideoProfile,
} from './sizeLimitedResolution';

describe('getSizeLimitedSimpleResolutionOptions', () => {
  it('keeps 720p sources source-sized in simple mode', () => {
    expect(getSizeLimitedSimpleResolutionOptions({
      sourceWidth: 1280,
      sourceHeight: 720,
      rotation: undefined,
    })).toEqual(['auto', 'source']);
  });

  it('offers 720p as the lower fixed choice for 1080p sources', () => {
    expect(getSizeLimitedSimpleResolutionOptions({
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
    })).toEqual(['auto', 'source', '720p']);
  });

  it('offers 1080p and 720p for 1440p sources', () => {
    expect(getSizeLimitedSimpleResolutionOptions({
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
    })).toEqual(['auto', 'source', '1080p', '720p']);
  });

  it('caps higher-resolution fixed choices at 1440p', () => {
    expect(getSizeLimitedSimpleResolutionOptions({
      sourceWidth: 3840,
      sourceHeight: 2160,
      rotation: undefined,
    })).toEqual(['auto', 'source', '1440p', '1080p', '720p']);
  });
});

describe('getSizeLimitedSimpleFpsOptions', () => {
  it('hides the 30 fps option for 30 fps and lower sources', () => {
    expect(getSizeLimitedSimpleFpsOptions({ sourceFps: 30 })).toEqual(['auto', 'source']);
    expect(getSizeLimitedSimpleFpsOptions({ sourceFps: 29.97 })).toEqual(['auto', 'source']);
  });

  it('hides the 30 fps option when source fps is unknown', () => {
    expect(getSizeLimitedSimpleFpsOptions({ sourceFps: undefined })).toEqual(['auto', 'source']);
  });

  it('offers the 30 fps option for higher-fps sources', () => {
    expect(getSizeLimitedSimpleFpsOptions({ sourceFps: 60 })).toEqual(['auto', 'source', '30fps']);
  });
});

describe('resolveEffectiveSizeLimitedSimpleSettings', () => {
  it('defaults untouched max quality simple controls to keep source', () => {
    expect(resolveEffectiveSizeLimitedSimpleSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
    })).toEqual({
      simpleResolution: 'source',
      simpleFps: 'source',
    });
  });

  it('preserves explicit auto once the user has touched the max quality controls', () => {
    expect(resolveEffectiveSizeLimitedSimpleSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: true,
      simpleFps: 'auto',
      simpleFpsTouched: true,
    })).toEqual({
      simpleResolution: 'auto',
      simpleFps: 'auto',
    });
  });

  it('keeps existing explicit non-auto choices even before the new touched flags are set', () => {
    expect(resolveEffectiveSizeLimitedSimpleSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: '1080p',
      simpleResolutionTouched: false,
      simpleFps: '30fps',
      simpleFpsTouched: false,
    })).toEqual({
      simpleResolution: '1080p',
      simpleFps: '30fps',
    });
  });

  it('leaves quality and fast presets unchanged', () => {
    expect(resolveEffectiveSizeLimitedSimpleSettings({
      controlMode: 'simple',
      preset: 'quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
    })).toEqual({
      simpleResolution: 'auto',
      simpleFps: 'auto',
    });

    expect(resolveEffectiveSizeLimitedSimpleSettings({
      controlMode: 'simple',
      preset: 'fast',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
    })).toEqual({
      simpleResolution: 'auto',
      simpleFps: 'auto',
    });
  });
});

describe('resolveSizeLimitedOutputDimensions', () => {
  it('keeps source resolution in advanced mode', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'advanced',
      simpleResolution: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      plannedVideoBitrate: 3_000_000,
    })).toBeUndefined();
  });

  it('downscales 1080p auto below 4 Mbps', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: 'auto',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      plannedVideoBitrate: 3_999_999,
    })).toEqual({ width: 1280, height: 720, targetDisplayHeight: 720 });
  });

  it('keeps 1080p auto at or above 4 Mbps', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: 'auto',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      plannedVideoBitrate: 4_000_000,
    })).toBeUndefined();
  });

  it('uses 1080p for >1080p auto between 4 and 6 Mbps', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      plannedVideoBitrate: 5_000_000,
    })).toEqual({ width: 1920, height: 1080, targetDisplayHeight: 1080 });
  });

  it('keeps >1440p auto at a 1440p ceiling above 6 Mbps', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: 'auto',
      sourceWidth: 3840,
      sourceHeight: 2160,
      rotation: undefined,
      plannedVideoBitrate: 6_000_000,
    })).toEqual({ width: 2560, height: 1440, targetDisplayHeight: 1440 });
  });

  it('never upscales fixed choices', () => {
    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: '1440p',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      plannedVideoBitrate: 8_000_000,
    })).toBeUndefined();
  });

  it('respects rotation when computing display dimensions', () => {
    expect(getSizeLimitedDisplayDimensions({
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: 90,
    })).toEqual({ width: 1080, height: 1920 });

    expect(resolveSizeLimitedOutputDimensions({
      controlMode: 'simple',
      simpleResolution: 'auto',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: 90,
      plannedVideoBitrate: 5_000_000,
    })).toEqual({ width: 1080, height: 606, targetDisplayHeight: 1080 });
  });
});

describe('resolveSizeLimitedVideoProfile', () => {
  it('keeps source fps in advanced mode', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'advanced',
      simpleResolution: 'auto',
      simpleFps: '30fps',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 3_000_000,
    })).toEqual({
      outputWidth: undefined,
      outputHeight: undefined,
      outputFps: undefined,
      targetDisplayHeight: undefined,
      resolutionDecision: 'keep_source',
      fpsDecision: 'keep_source',
    });
  });

  it('recomputes auto resolution using the current attempt bitrate', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'auto',
      simpleFps: 'source',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 5_000_000,
    })).toMatchObject({
      outputWidth: 1920,
      outputHeight: 1080,
      resolutionDecision: 'scale_to_1080p',
      fpsDecision: 'keep_source',
    });

    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'auto',
      simpleFps: 'source',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 3_000_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      resolutionDecision: 'scale_to_720p',
      fpsDecision: 'keep_source',
    });
  });

  it('drops auto fps only after the resolution decision', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'auto',
      simpleFps: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 4_300_000,
    })).toMatchObject({
      outputWidth: 1920,
      outputHeight: 1080,
      outputFps: 30,
      resolutionDecision: 'scale_to_1080p',
      fpsDecision: 'drop_to_30',
    });
  });

  it('evaluates auto fps against a forced resolution choice', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'source',
      simpleFps: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 4_300_000,
    })).toMatchObject({
      outputWidth: undefined,
      outputHeight: undefined,
      outputFps: 30,
      resolutionDecision: 'keep_source',
      fpsDecision: 'drop_to_30',
    });
  });

  it('keeps source fps when explicitly requested', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: '720p',
      simpleFps: 'source',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 1_800_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      outputFps: undefined,
      fpsDecision: 'keep_source',
    });
  });

  it('forces 30 fps when explicitly requested on a high-fps source', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'source',
      simpleFps: '30fps',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 8_000_000,
    })).toMatchObject({
      outputFps: 30,
      fpsDecision: 'drop_to_30',
    });
  });

  it('never increases fps when the source is 30 fps or lower', () => {
    expect(resolveSizeLimitedVideoProfile({
      controlMode: 'simple',
      simpleResolution: 'source',
      simpleFps: '30fps',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      sourceFps: 30,
      plannedVideoBitrate: 8_000_000,
    })).toMatchObject({
      outputFps: undefined,
      fpsDecision: 'keep_source',
    });
  });
});

describe('size-limited transform filters', () => {
  it('uses lanczos+accurate_rnd in the shared transform filter', () => {
    expect(buildSizeLimitedVideoTransformFilters({
      videoProfile: {
        outputWidth: 1280,
        outputHeight: 720,
        outputFps: undefined,
      },
    })).toEqual(['scale=1280:720:flags=lanczos+accurate_rnd']);
  });

  it('builds a shared transform chain used by both segment and merge flows', () => {
    const videoProfile = {
      outputWidth: 1920,
      outputHeight: 1080,
      outputFps: 30,
    };

    expect(buildSizeLimitedVideoFilter({ videoProfile })).toBe('fps=30,scale=1920:1080:flags=lanczos+accurate_rnd');
  });
});
