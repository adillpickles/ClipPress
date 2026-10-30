import type { KeyBinding, ModifierKey, MouseGesture } from './types.ts';
import { quickExportKeyBindings } from './quickExport.js';

// The shortcuts a new install starts with (and Reset all shortcuts goes back to); shared so Settings can tell a
// changed shortcut from its default.
const defaultKeyBindings: KeyBinding[] = [
  { keys: 'ShiftLeft+Equal', action: 'addSegment' },
  { keys: 'Space', action: 'togglePlayResetSpeed' },
  { keys: 'KeyK', action: 'togglePlayNoResetSpeed' },
  { keys: 'KeyJ', action: 'reducePlaybackRate' },
  { keys: 'ShiftLeft+KeyJ', action: 'reducePlaybackRateMore' },
  { keys: 'KeyL', action: 'increasePlaybackRate' },
  { keys: 'ShiftLeft+KeyL', action: 'increasePlaybackRateMore' },
  { keys: 'KeyZ', action: 'timelineToggleComfortZoom' },
  { keys: 'ShiftLeft+KeyZ', action: 'makeCursorTimeZero' },
  { keys: 'Comma', action: 'seekPreviousFrame' },
  { keys: 'Period', action: 'seekNextFrame' },
  { keys: 'KeyC', action: 'captureSnapshot' },
  { keys: 'ControlLeft+KeyC', action: 'copySegmentsToClipboard' },
  { keys: 'MetaLeft+KeyC', action: 'copySegmentsToClipboard' },
  { keys: 'ShiftLeft+KeyC', action: 'captureSnapshotToClipboard' },

  { keys: 'KeyI', action: 'setCutStart' },
  { keys: 'KeyO', action: 'setCutEnd' },
  { keys: 'Backspace', action: 'removeCurrentCutpoint' },
  { keys: 'KeyB', action: 'splitCurrentSegment' },
  // R is crop in photo editors; it used to rotate the export, unseen in the simple editor (rotation is still bindable).
  { keys: 'KeyR', action: 'editCurrentSegmentCrop' },
  { keys: 'ControlLeft+KeyR', action: 'toggleSegmentSpeedControls' },
  { keys: 'MetaLeft+KeyR', action: 'toggleSegmentSpeedControls' },
  { keys: 'KeyG', action: 'goToTimecode' },
  { keys: 'KeyT', action: 'addTextOverlay' },
  { keys: 'ShiftLeft+KeyT', action: 'toggleStripCurrentFilter' },

  { keys: 'ArrowLeft', action: 'seekBackwards' },
  { keys: 'ControlLeft+ShiftLeft+ArrowLeft', action: 'seekBackwards2' },
  { keys: 'ControlLeft+ArrowLeft', action: 'seekBackwardsPercent' },
  { keys: 'MetaLeft+ArrowLeft', action: 'seekBackwardsPercent' },
  { keys: 'AltLeft+ArrowLeft', action: 'seekBackwardsKeyframe' },
  { keys: 'ShiftLeft+ArrowLeft', action: 'jumpCutStart' },

  { keys: 'ArrowRight', action: 'seekForwards' },
  { keys: 'ControlLeft+ShiftLeft+ArrowRight', action: 'seekForwards2' },
  { keys: 'ControlLeft+ArrowRight', action: 'seekForwardsPercent' },
  { keys: 'MetaLeft+ArrowRight', action: 'seekForwardsPercent' },
  { keys: 'AltLeft+ArrowRight', action: 'seekForwardsKeyframe' },
  { keys: 'ShiftLeft+ArrowRight', action: 'jumpCutEnd' },

  { keys: 'ControlLeft+Home', action: 'jumpTimelineStart' },
  { keys: 'ControlLeft+End', action: 'jumpTimelineEnd' },

  { keys: 'PageUp', action: 'jumpFirstSegment' },
  { keys: 'ArrowUp', action: 'jumpPrevSegment' },
  { keys: 'ShiftLeft+AltLeft+PageUp', action: 'jumpSeekFirstSegment' },
  { keys: 'ShiftLeft+AltLeft+ArrowUp', action: 'jumpSeekPrevSegment' },
  { keys: 'ControlLeft+ArrowUp', action: 'timelineZoomIn' },
  { keys: 'MetaLeft+ArrowUp', action: 'timelineZoomIn' },
  { keys: 'ShiftLeft+ArrowUp', action: 'batchPreviousFile' },
  { keys: 'ControlLeft+ShiftLeft+ArrowUp', action: 'batchOpenPreviousFile' },

  { keys: 'PageDown', action: 'jumpLastSegment' },
  { keys: 'ArrowDown', action: 'jumpNextSegment' },
  { keys: 'ShiftLeft+AltLeft+PageDown', action: 'jumpSeekLastSegment' },
  { keys: 'ShiftLeft+AltLeft+ArrowDown', action: 'jumpSeekNextSegment' },
  { keys: 'ControlLeft+ArrowDown', action: 'timelineZoomOut' },
  { keys: 'MetaLeft+ArrowDown', action: 'timelineZoomOut' },
  { keys: 'ShiftLeft+ArrowDown', action: 'batchNextFile' },
  { keys: 'ControlLeft+ShiftLeft+ArrowDown', action: 'batchOpenNextFile' },

  { keys: 'ShiftLeft+Enter', action: 'batchOpenSelectedFile' },

  // https://github.com/mifi/lossless-cut/issues/610
  { keys: 'ControlLeft+KeyZ', action: 'undo' },
  { keys: 'MetaLeft+KeyZ', action: 'undo' },
  { keys: 'ControlLeft+ShiftLeft+KeyZ', action: 'redo' },
  { keys: 'MetaLeft+ShiftLeft+KeyZ', action: 'redo' },
  // The usual Windows redo, as in Edit > Redo.
  { keys: 'ControlLeft+KeyY', action: 'redo' },

  { keys: 'KeyF', action: 'toggleFullscreenVideo' },

  { keys: 'Enter', action: 'labelCurrentSegment' },

  { keys: 'Delete', action: 'removeSelectedClips' },

  { keys: 'KeyE', action: 'export' },
  ...quickExportKeyBindings,
  { keys: 'ShiftLeft+Slash', action: 'toggleKeyboardShortcuts' },

  { keys: 'AltLeft+ArrowUp', action: 'increaseVolume' },
  { keys: 'AltLeft+ArrowDown', action: 'decreaseVolume' },
  { keys: 'KeyM', action: 'toggleMuted' },

  { keys: 'AltLeft+KeyP', action: 'toggleSegmentsList' },
  { keys: 'ControlLeft+KeyD', action: 'duplicateCurrentSegment' },
  { keys: 'MetaLeft+KeyD', action: 'duplicateCurrentSegment' },
];

/** The mouse gestures' own modifiers (Ctrl+wheel zooms, and so on). */
export const defaultMouseModifierKeys: Record<MouseGesture, ModifierKey> = { zoom: 'ctrl', frameSeek: 'alt', keyframeSeek: 'shift', segment: 'shift' };

export default defaultKeyBindings;
