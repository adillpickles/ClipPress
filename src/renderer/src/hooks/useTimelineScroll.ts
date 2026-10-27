import type { WheelEventHandler } from 'react';
import { useCallback } from 'react';
import { t } from 'i18next';

import normalizeWheel from './normalizeWheel';
import type { ExtraMouseModifierKeys, ModifierKey, MouseGesture } from '../../../common/types';
import { getMetaKeyName } from '../util';

export const keyMap = {
  ctrl: 'ctrlKey',
  shift: 'shiftKey',
  alt: 'altKey',
  meta: 'metaKey',
} as const;

export const getModifierKeyNames = () => ({
  ctrl: t('Ctrl'),
  shift: t('Shift'),
  alt: t('Alt'),
  meta: getMetaKeyName(),
});

export const getModifier = (key: ModifierKey) => getModifierKeyNames()[key];

/** Whether a gesture's modifier, or one of those added for it in Settings > Shortcuts, is held. */
export function isGestureModifierHeld(event: { ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean }, modifier: ModifierKey, extra: ExtraMouseModifierKeys | undefined, gesture: MouseGesture) {
  return [modifier, ...(extra?.[gesture] ?? [])].some((key) => event[keyMap[key]]);
}

function useTimelineScroll({ wheelSensitivity, mouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, extraMouseModifierKeys, invertTimelineScroll, zoomRel, seekRel, shortStep, seekClosestKeyframe }: {
  wheelSensitivity: number,
  mouseWheelZoomModifierKey: ModifierKey,
  mouseWheelFrameSeekModifierKey: ModifierKey,
  mouseWheelKeyframeSeekModifierKey: ModifierKey,
  extraMouseModifierKeys?: ExtraMouseModifierKeys | undefined,
  invertTimelineScroll?: boolean | undefined,
  zoomRel: (a: number) => void,
  seekRel: (a: number) => void,
  shortStep: (a: number) => void,
  seekClosestKeyframe: (a: number) => void,
}) {
  const onWheel = useCallback<WheelEventHandler<Element>>((wheelEvent) => {
    const { pixelX, pixelY } = normalizeWheel(wheelEvent);
    // console.log({ spinX, spinY, pixelX, pixelY });

    const direction = invertTimelineScroll ? 1 : -1;

    const makeUnit = (v: number) => ((direction * v) > 0 ? 1 : -1);

    if (isGestureModifierHeld(wheelEvent, mouseWheelZoomModifierKey, extraMouseModifierKeys, 'zoom')) {
      // Scrolling up zooms in, as in other editors and maps (see also https://github.com/mifi/lossless-cut/issues/2703)
      zoomRel(-pixelY * wheelSensitivity * 0.4);
    } else if (isGestureModifierHeld(wheelEvent, mouseWheelFrameSeekModifierKey, extraMouseModifierKeys, 'frameSeek')) {
      shortStep(makeUnit(pixelX + pixelY));
    } else if (isGestureModifierHeld(wheelEvent, mouseWheelKeyframeSeekModifierKey, extraMouseModifierKeys, 'keyframeSeek')) {
      seekClosestKeyframe(makeUnit(pixelX + pixelY));
    } else {
      seekRel(direction * (pixelX + pixelY) * wheelSensitivity * 0.2);
    }
  }, [invertTimelineScroll, mouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, extraMouseModifierKeys, zoomRel, wheelSensitivity, shortStep, seekClosestKeyframe, seekRel]);

  return onWheel;
}

export default useTimelineScroll;
