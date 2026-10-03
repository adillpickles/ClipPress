import { describe, expect, it } from 'vitest';

import { fullFrameCrop, getSegmentCropFilter, getSegmentCropPixels, hasSegmentCrop, moveSegmentCrop, resizeSegmentCrop, zoomSegmentCrop } from './segmentCrop';
import { createSegment, mapSaveableSegments } from './segments';
import { llcProjectV3Schema } from './types';

describe('segment crop', () => {
  it('zooms around the current frame center and clamps movement inside the source', () => {
    const crop = zoomSegmentCrop(fullFrameCrop, 2);
    expect(crop).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(moveSegmentCrop(crop, 10, -10)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(zoomSegmentCrop(crop, 1)).toEqual(fullFrameCrop);
  });

  it('anchors the opposite corner and preserves aspect ratio at the edges', () => {
    expect(resizeSegmentCrop(fullFrameCrop, 'bottom-right', -0.5, -0.5)).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(resizeSegmentCrop(fullFrameCrop, 'top-left', 0.5, 0.5)).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    expect(resizeSegmentCrop(fullFrameCrop, 'top-right', -10, 10)).toEqual({ x: 0, y: 0.75, width: 0.25, height: 0.25 });
    expect(resizeSegmentCrop(fullFrameCrop, 'bottom-left', 10, -10)).toEqual({ x: 0.75, y: 0, width: 0.25, height: 0.25 });
  });

  it('uses the same pixel bounds in preview and export and keeps a consistent output frame', () => {
    const crop = zoomSegmentCrop(fullFrameCrop, 2);
    expect(getSegmentCropPixels(crop, 320, 180)).toEqual({ x: 80, y: 46, width: 160, height: 90, frameWidth: 320, frameHeight: 180 });
    expect(getSegmentCropFilter({ crop }, 320, 180)).toBe('crop=160:90:80:46,scale=320:180,setsar=1');
    const odd = getSegmentCropPixels(crop, 321, 181);
    expect(odd.frameWidth).toBe(320);
    expect(odd.frameHeight).toBe(180);
    expect(getSegmentCropFilter({}, 320, 180)).toBeUndefined();
    expect(hasSegmentCrop({ crop: fullFrameCrop })).toBe(false);
  });

  it('persists a crop with its segment while accepting old projects', () => {
    const crop = zoomSegmentCrop(fullFrameCrop, 2);
    const segment = { ...createSegment({ start: 0, end: 4, crop, speed: 2 }), segColorIndex: 0 };
    const project = llcProjectV3Schema.parse({ version: 3, cutSegments: mapSaveableSegments([segment]) });
    expect(createSegment(project.cutSegments[0]).crop).toEqual(crop);
    expect(llcProjectV3Schema.parse({ version: 3, cutSegments: [{ start: 0, end: 4, name: '' }] }).cutSegments[0]?.crop).toBeUndefined();
    for (const invalid of [{ ...crop, x: 1 }, { ...crop, width: 0 }, { ...crop, height: 0.75 }]) {
      expect(() => llcProjectV3Schema.parse({ version: 3, cutSegments: [{ start: 0, end: 4, name: '', crop: invalid }] })).toThrow();
    }
  });
});
