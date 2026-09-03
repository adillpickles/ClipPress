import { describe, expect, it } from 'vitest';

import { createDefaultTextOverlayClip, sanitizeOverlayClip, minTextOverlayDuration } from './textOverlays';

describe('textOverlays bounds', () => {
  it('creates overlay that does not exceed file duration for short media', () => {
    const clip = createDefaultTextOverlayClip({ currentTime: 0, fileDuration: 0.05, overlayId: 'a' });
    expect(clip.end).toBeLessThanOrEqual(0.05);
    expect(clip.end).toBe(0.05);
    // start should be clamped to 0
    expect(clip.start).toBe(0);
  });

  it('sanitize clamps end to fileDuration', () => {
    const clip = {
      overlayId: 'b',
      type: 'text' as const,
      start: 8,
      end: 100,
      text: 'hi',
      box: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
    };
    const sanitized = sanitizeOverlayClip(clip, 10);
    expect(sanitized.end).toBeLessThanOrEqual(10);
    expect(sanitized.start).toBeLessThan(sanitized.end);
  });

  it('sanitize clamps start outside duration', () => {
    const clip = {
      overlayId: 'c',
      type: 'text' as const,
      start: 20,
      end: 22,
      text: 'hi',
      box: { x: 0, y: 0, width: 0.6, height: 0.18 },
    };
    const sanitized = sanitizeOverlayClip(clip, 10);
    expect(sanitized.start).toBeLessThanOrEqual(10 - minTextOverlayDuration);
    expect(sanitized.end).toBeLessThanOrEqual(10);
  });
});
