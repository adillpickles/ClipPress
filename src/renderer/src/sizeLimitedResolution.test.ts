import { describe, expect, it } from 'vitest';

import {
  buildSizeLimitedVideoFilter,
  buildSizeLimitedVideoTransformFilters,
  getSizeLimitedDisplayDimensions,
  getSizeLimitedSimpleFpsOptions,
  getSizeLimitedSimpleResolutionOptions,
  resolveEffectiveSizeLimitedTransformSettings,
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

describe('resolveEffectiveSizeLimitedTransformSettings', () => {
  it('defaults untouched max quality simple controls to keep source', () => {
    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
      advancedResolution: '720p',
      advancedFps: '30fps',
    })).toEqual({
      resolution: 'source',
      fps: 'source',
    });
  });

  it('preserves explicit auto once the user has touched the max quality controls', () => {
    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: true,
      simpleFps: 'auto',
      simpleFpsTouched: true,
      advancedResolution: '720p',
      advancedFps: '30fps',
    })).toEqual({
      resolution: 'auto',
      fps: 'auto',
    });
  });

  it('keeps existing explicit non-auto choices even before the touched flags are set', () => {
    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: 'max_quality',
      simpleResolution: '1080p',
      simpleResolutionTouched: false,
      simpleFps: '30fps',
      simpleFpsTouched: false,
      advancedResolution: 'source',
      advancedFps: 'source',
    })).toEqual({
      resolution: '1080p',
      fps: '30fps',
    });
  });

  it('leaves quality and fast presets unchanged', () => {
    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: 'quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
      advancedResolution: 'source',
      advancedFps: 'source',
    })).toEqual({
      resolution: 'auto',
      fps: 'auto',
    });

    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'simple',
      preset: 'fast',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
      advancedResolution: 'source',
      advancedFps: 'source',
    })).toEqual({
      resolution: 'auto',
      fps: 'auto',
    });
  });

  it('uses advanced transform controls directly in advanced mode', () => {
    expect(resolveEffectiveSizeLimitedTransformSettings({
      controlMode: 'advanced',
      preset: 'quality',
      simpleResolution: 'auto',
      simpleResolutionTouched: false,
      simpleFps: 'auto',
      simpleFpsTouched: false,
      advancedResolution: '1080p',
      advancedFps: '30fps',
    })).toEqual({
      resolution: '1080p',
      fps: '30fps',
    });
  });
});

describe('resolveSizeLimitedOutputDimensions', () => {
  it('keeps source resolution when auto has no fps context', () => {
    expect(resolveSizeLimitedOutputDimensions({
      resolution: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      plannedVideoBitrate: 3_000_000,
    })).toBeUndefined();
  });

  it('resolves fixed downscale choices without upscaling', () => {
    expect(resolveSizeLimitedOutputDimensions({
      resolution: '720p',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: undefined,
      plannedVideoBitrate: 8_000_000,
    })).toEqual({ width: 1280, height: 720, targetDisplayHeight: 720 });

    expect(resolveSizeLimitedOutputDimensions({
      resolution: '1440p',
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
      resolution: '1080p',
      sourceWidth: 1920,
      sourceHeight: 1080,
      rotation: 90,
      plannedVideoBitrate: 5_000_000,
    })).toEqual({ width: 1080, height: 606, targetDisplayHeight: 1080 });
  });
});

describe('resolveSizeLimitedVideoProfile', () => {
  it('recomputes auto resolution using the current attempt bitrate', () => {
    expect(resolveSizeLimitedVideoProfile({
      resolution: 'auto',
      fps: 'source',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 5_000_000,
    })).toMatchObject({
      outputWidth: 1920,
      outputHeight: 1080,
      outputFps: undefined,
      resolutionDecision: 'scale_to_1080p',
      fpsDecision: 'keep_source',
    });

    expect(resolveSizeLimitedVideoProfile({
      resolution: 'auto',
      fps: 'source',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 3_000_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      outputFps: undefined,
      resolutionDecision: 'scale_to_720p',
      fpsDecision: 'keep_source',
    });
  });

  it('drops auto resolution before it drops fps for gaming clips', () => {
    expect(resolveSizeLimitedVideoProfile({
      resolution: 'auto',
      fps: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 4_300_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      outputFps: undefined,
      resolutionDecision: 'scale_to_720p',
      fpsDecision: 'keep_source',
    });
  });

  it('treats 30 fps as the last lever after all source-fps rungs are exhausted', () => {
    expect(resolveSizeLimitedVideoProfile({
      resolution: 'auto',
      fps: 'auto',
      sourceWidth: 2560,
      sourceHeight: 1440,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 1_800_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      outputFps: 30,
      resolutionDecision: 'scale_to_720p',
      fpsDecision: 'drop_to_30',
    });
  });

  it('never uses 1440p30 in auto for high-resolution sources', () => {
    expect(resolveSizeLimitedVideoProfile({
      resolution: 'auto',
      fps: 'auto',
      sourceWidth: 3840,
      sourceHeight: 2160,
      rotation: undefined,
      sourceFps: 60,
      plannedVideoBitrate: 4_000_000,
    })).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
      outputFps: undefined,
      resolutionDecision: 'scale_to_720p',
      fpsDecision: 'keep_source',
    });
  });

  it('evaluates auto fps against an explicit resolution choice', () => {
    expect(resolveSizeLimitedVideoProfile({
      resolution: 'source',
      fps: 'auto',
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
      resolution: '720p',
      fps: 'source',
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
      resolution: 'source',
      fps: '30fps',
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
      resolution: 'source',
      fps: '30fps',
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
