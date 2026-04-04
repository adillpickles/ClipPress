import { describe, expect, it } from 'vitest';

import { getSizeLimitedDisplayDimensions, getSizeLimitedSimpleResolutionOptions, resolveSizeLimitedOutputDimensions } from './sizeLimitedResolution';

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
