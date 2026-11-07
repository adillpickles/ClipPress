import { describe, expect, it } from 'vitest';

import { buildAddedAudioInputArgs, buildAudioMixFilter, buildConcatSegmentInputArgs, buildMergedOverlayFilters, buildOverlayImageInputArgs, buildSegmentConcatFilters, getRelativeSegmentOverlapWindow, isAudioMix } from './exportSegmentMath';

describe('buildConcatSegmentInputArgs', () => {
  it('applies rotation before each input so the filter graph crops the displayed frame', () => {
    expect(buildConcatSegmentInputArgs({
      filePath: 'clip.mp4', segments: [{ start: 0, end: 2 }, { start: 2, end: 4 }], rotation: 90,
    })).toEqual([
      '-ss', '0.00000', '-t', '2.00000', '-display_rotation:v:0', '270', '-i', 'clip.mp4',
      '-ss', '2.00000', '-t', '2.00000', '-display_rotation:v:0', '270', '-i', 'clip.mp4',
    ]);
  });

  it('builds each merged segment as its own trimmed input window', () => {
    expect(buildConcatSegmentInputArgs({
      filePath: 'clip.mp4',
      segments: [
        { start: 0, end: 3 },
        { start: 10, end: 14.5 },
      ],
    })).toEqual([
      '-ss', '0.00000',
      '-t', '3.00000',
      '-i', 'clip.mp4',
      '-ss', '10.00000',
      '-t', '4.50000',
      '-i', 'clip.mp4',
    ]);
  });

  it('keeps retimed segments trimmed in source coordinates', () => {
    expect(buildConcatSegmentInputArgs({
      filePath: 'clip.mp4',
      segments: [
        { start: 5, end: 9, speed: 2 },
        { start: 20, end: 24, speed: 0.5 },
      ],
    })).toEqual([
      '-ss', '5.00000',
      '-t', '4.00000',
      '-i', 'clip.mp4',
      '-ss', '20.00000',
      '-t', '4.00000',
      '-i', 'clip.mp4',
    ]);
  });
});

describe('buildMergedOverlayFilters', () => {
  it('splits one image input across retimed repeats without referencing nonexistent inputs', () => {
    const { graph, videoOutputLabel } = buildMergedOverlayFilters({
      overlayAssets: [{ start: 0.5, end: 1.5, x: 32, y: 18 }],
      segments: [{ start: 0, end: 2, speed: 2 }, { start: 0, end: 2, speed: 0.5 }],
      outputPlaybackRate: 1,
      imageInputStartIndex: 2,
      videoInputLabel: '[vconcat]',
      videoOutputLabel: '[v]',
    });
    expect(graph).toEqual([
      '[2:v]split=2[overlayImage0][overlayImage1]',
      "[vconcat][overlayImage0]overlay=32:18:enable='between(t,0.25000,0.75000)'[overlayVideo0]",
      "[overlayVideo0][overlayImage1]overlay=32:18:enable='between(t,2.00000,4.00000)'[v]",
    ]);
    expect(videoOutputLabel).toBe('[v]');
  });

  it('keeps the original image input index when other captions are outside the selected ranges', () => {
    const { graph } = buildMergedOverlayFilters({
      overlayAssets: [{ start: 10, end: 12, x: 0, y: 0 }, { start: 0, end: 1, x: 10, y: 20 }],
      segments: [{ start: 0, end: 2 }],
      outputPlaybackRate: 1,
      imageInputStartIndex: 1,
      videoInputLabel: '[vconcat]',
      videoOutputLabel: '[v]',
    });
    expect(graph).toEqual(["[vconcat][2:v]overlay=10:20:enable='between(t,0.00000,1.00000)'[v]"]);
  });
});

describe('buildSegmentConcatFilters', () => {
  it('drops sped-up frames on the GPU, then copies them off before the crop', () => {
    const { graph } = buildSegmentConcatFilters({
      segments: [
        { start: 0, end: 2, speed: 4, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
        { start: 2, end: 4 },
      ],
      videoStreamIndex: 0,
      audioStreamIndex: undefined,
      outputPlaybackRate: 1,
      videoWidth: 320,
      videoHeight: 180,
      gpuFrames: { downloadFormat: 'nv12', outputFps: undefined },
    });
    expect(graph[0]).toBe('[0:0]setpts=(PTS-STARTPTS)/4,fps=source_fps,hwdownload,format=nv12,crop=160:90:0:0,scale=320:180,setsar=1[segmentv0]');
    expect(graph[1]).toBe('[1:0]setpts=(PTS-STARTPTS)/1,hwdownload,format=nv12[segmentv1]');
  });

  it('crops each segment into a consistent frame before merging and keeps its speed', () => {
    const { graph } = buildSegmentConcatFilters({
      segments: [
        { start: 0, end: 2, speed: 2, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
        { start: 2, end: 4, crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } },
      ],
      videoStreamIndex: 0,
      audioStreamIndex: undefined,
      outputPlaybackRate: 1,
      videoWidth: 320,
      videoHeight: 180,
    });
    expect(graph[0]).toBe('[0:0]setpts=(PTS-STARTPTS)/2,crop=160:90:0:0,scale=320:180,setsar=1[segmentv0]');
    expect(graph[1]).toBe('[1:0]setpts=(PTS-STARTPTS)/1,crop=160:90:160:90,scale=320:180,setsar=1[segmentv1]');
  });

  it('retimes video and pitch-preserving audio before concatenating mixed speeds', () => {
    const { graph, labels } = buildSegmentConcatFilters({
      segments: [{ start: 5, end: 9, speed: 2 }, { start: 20, end: 24, speed: 0.25 }],
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      outputPlaybackRate: 1,
    });
    expect(graph).toContain('[0:0]setpts=(PTS-STARTPTS)/2[segmentv0]');
    expect(graph).toContain('[1:1]asetpts=PTS-STARTPTS,atempo=0.5,atempo=0.5[segmenta1]');
    expect(labels).toBe('[segmentv0][segmenta0][segmentv1][segmenta1]');
  });

  it('supports silent sources and the legacy whole-file rate', () => {
    const { graph, labels } = buildSegmentConcatFilters({
      segments: [{ start: 0, end: 4, speed: 2 }], videoStreamIndex: 2, audioStreamIndex: undefined, outputPlaybackRate: 0.5,
    });
    expect(graph).toEqual(['[0:2]setpts=(PTS-STARTPTS)/1[segmentv0]']);
    expect(labels).toBe('[segmentv0]');
  });
});

describe('getRelativeSegmentOverlapWindow', () => {
  it('keeps text entirely inside a segment', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 1,
      overlayEnd: 2.5,
      segmentStart: 0,
      segmentEnd: 4,
      outputPlaybackRate: 1,
    })).toEqual({ start: 1, end: 2.5 });
  });

  it('drops text entirely outside an exported segment', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 6,
      overlayEnd: 7,
      segmentStart: 0,
      segmentEnd: 4,
      outputPlaybackRate: 1,
    })).toBeUndefined();
  });

  it('clips text that crosses the end of a segment', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 2.5,
      overlayEnd: 5,
      segmentStart: 0,
      segmentEnd: 4,
      outputPlaybackRate: 1,
    })).toEqual({ start: 2.5, end: 4 });
  });

  it('clips text that enters an exported segment from a non-exported area', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 8,
      overlayEnd: 10.5,
      segmentStart: 10,
      segmentEnd: 14,
      outputPlaybackRate: 1,
    })).toEqual({ start: 0, end: 0.5 });
  });

  it('maps later-segment text into merged timeline coordinates', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 11,
      overlayEnd: 12.25,
      segmentStart: 10,
      segmentEnd: 14,
      outputPlaybackRate: 1,
      timelineOffset: 4,
    })).toEqual({ start: 5, end: 6.25 });
  });

  it('scales overlap windows by playback rate', () => {
    expect(getRelativeSegmentOverlapWindow({
      overlayStart: 1,
      overlayEnd: 3,
      segmentStart: 0,
      segmentEnd: 4,
      outputPlaybackRate: 2,
    })).toEqual({ start: 0.5, end: 1.5 });
  });
});

describe('buildOverlayImageInputArgs', () => {
  it('reads each text image once instead of looping it for every frame', () => {
    expect(buildOverlayImageInputArgs(['a.png', 'b.png'])).toEqual(['-i', 'a.png', '-i', 'b.png']);
  });
});

describe('mixing audio tracks', () => {
  it('adds the tracks together at their own volumes, then runs what comes after', () => {
    expect(buildAudioMixFilter({ inputIndex: 0, tracks: [{ index: 1, gainDb: -6 }, { index: 2, gainDb: undefined }], after: ['atempo=2'], outputLabel: '[a]' })).toEqual([
      '[0:1]aresample=async=1:first_pts=0,volume=-6.00dB[mix0t0]',
      '[0:2]aresample=async=1:first_pts=0[mix0t1]',
      '[mix0t0][mix0t1]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=1:level=0:latency=1,atempo=2[a]',
    ]);
  });

  it('mixes each joined clip at its track volumes, with its own volume in them, then its speed', () => {
    const { graph } = buildSegmentConcatFilters({
      segments: [{ start: 0, end: 2, speed: 2, audioGainDb: -6 }],
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      outputPlaybackRate: 1,
      mixedAudioTracks: [{ index: 1, gainDb: undefined }, { index: 2, gainDb: 3 }],
    });
    expect(graph.slice(1)).toEqual([
      '[0:1]aresample=async=1:first_pts=0,volume=-6.00dB[mix0t0]',
      '[0:2]aresample=async=1:first_pts=0,volume=-3.00dB[mix0t1]',
      '[mix0t0][mix0t1]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=1:level=0:latency=1,asetpts=PTS-STARTPTS,atempo=2[segmenta0]',
    ]);
  });
});

describe("an added file's sound in the mix", () => {
  it("mixes any added track, and two or more of the recording's", () => {
    expect(isAudioMix(undefined)).toBe(false);
    expect(isAudioMix([{ index: 1, gainDb: undefined }])).toBe(false);
    expect(isAudioMix([{ index: 1, gainDb: undefined }, { index: 2, gainDb: undefined }])).toBe(true);
    // An added sound alone (the recording's left out) still comes from its own input.
    expect(isAudioMix([{ index: 1, gainDb: undefined, added: 0 }])).toBe(true);
  });

  it("cuts each added file at each clip's times, clip by clip", () => {
    expect(buildAddedAudioInputArgs({ files: ['a.mp3', 'b.mkv'], segments: [{ start: 1, end: 3 }, { start: 10, end: 11.5 }] })).toEqual([
      '-ss', '1.00000', '-t', '2.00000', '-i', 'a.mp3',
      '-ss', '1.00000', '-t', '2.00000', '-i', 'b.mkv',
      '-ss', '10.00000', '-t', '1.50000', '-i', 'a.mp3',
      '-ss', '10.00000', '-t', '1.50000', '-i', 'b.mkv',
    ]);
    expect(buildAddedAudioInputArgs({ files: [], segments: [{ start: 1, end: 3 }] })).toEqual([]);
  });

  it("takes an added track from its file's input", () => {
    const graph = buildAudioMixFilter({ inputIndex: 0, tracks: [{ index: 1, gainDb: undefined }, { index: 0, gainDb: -6, added: 1 }], outputLabel: '[amixed]', getAddedInputIndex: (added) => 1 + added });
    expect(graph[0]).toMatch(/^\[0:1\]aresample/);
    expect(graph[1]).toMatch(/^\[2:0\]aresample=async=1:first_pts=0,volume=-6\.00dB/);
    expect(graph[2]).toMatch(/^\[mix0t0\]\[mix0t1\]amix=inputs=2/);
  });

  it('gives each joined clip its own added inputs, after all the clips', () => {
    const { graph } = buildSegmentConcatFilters({
      segments: [{ start: 0, end: 2 }, { start: 5, end: 7 }],
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      outputPlaybackRate: 1,
      mixedAudioTracks: [{ index: 1, gainDb: undefined }, { index: 0, gainDb: undefined, added: 0 }, { index: 0, gainDb: undefined, added: 1 }],
      addedInputs: { first: 2, files: 2 },
    });
    // Clip 0: added files at inputs 2 and 3; clip 1: at 4 and 5.
    expect(graph.some((part) => part.startsWith('[2:0]'))).toBe(true);
    expect(graph.some((part) => part.startsWith('[3:0]'))).toBe(true);
    expect(graph.some((part) => part.startsWith('[4:0]'))).toBe(true);
    expect(graph.some((part) => part.startsWith('[5:0]'))).toBe(true);
    expect(graph.some((part) => part.startsWith('[1:1]aresample'))).toBe(true);
  });
});
