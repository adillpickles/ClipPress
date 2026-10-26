import type { ReactNode, SetStateAction, Dispatch } from 'react';
import { memo, Fragment, useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaMouse, FaPlus, FaStepForward, FaStepBackward, FaUndo, FaTrash, FaSave, FaHammer } from 'react-icons/fa';
import groupBy from 'lodash/groupBy';
import { AnimatePresence, motion } from 'motion/react';

import useUserSettings from '../hooks/useUserSettings';
import SetCutpointButton from './SetCutpointButton';
import SegmentCutpointButton from './SegmentCutpointButton';
import { getModifier } from '../hooks/useTimelineScroll';
import type { KeyBinding, KeyboardAction, ModifierKey } from '../../../common/types';
import type { StateSegment } from '../types';
import { splitKeyboardKeys } from '../util';
import { fixKeys } from '../shortcutKeys';
import * as Dialog from './Dialog';
import Warning from './Warning';
import Button, { DialogButton } from './Button';
import ConfirmButton from './ConfirmButton';
import Action from './Action';
import TextInput from './TextInput';
import renderKeys from './renderKeys';
import SegmentedControl from './SegmentedControl';
import { useAppContext } from '../contexts';
import { normalizeQuickExportPresets, quickExportPresetActions } from '../../../common/quickExport';
import { getQuickExportPresetLabel } from '../quickExport';
import styles from './KeyboardShortcuts.module.css';


type Category = string;

type ActionsMap = Record<KeyboardAction, { name: string, category?: Category, before?: ReactNode }>;


// eslint-disable-next-line react/display-name
const CreateBinding = memo(({
  actionsMap, action, setCreatingBinding, onNewKeyBindingConfirmed,
}: {
  actionsMap: ActionsMap,
  action: KeyboardAction | undefined,
  setCreatingBinding: Dispatch<SetStateAction<KeyboardAction | undefined>>,
  onNewKeyBindingConfirmed: (a: KeyboardAction, keys: string[]) => void,
}) => {
  const { t } = useTranslation();

  const [keysDown, setKeysDown] = useState<string[]>([]);

  const validKeysDown = useMemo(() => fixKeys(keysDown), [keysDown]);

  const isShown = action != null;

  useEffect(() => {
    if (isShown) {
      // todo
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKeysDown([]);
    }
  }, [isShown]);

  const addKeyDown = useCallback((character: string) => setKeysDown((old) => [...new Set([...old, character])]), []);

  useEffect(() => {
    if (!isShown) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      // console.log(e)
      addKeyDown(e.code);
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addKeyDown, isShown]);

  const isComboInvalid = validKeysDown.length === 0 && keysDown.length > 0;

  const fixedKeys = useMemo(() => fixKeys(keysDown), [keysDown]);

  if (action == null) return null;

  return (
    <Dialog.Root open={isShown} onOpenChange={(v) => v === false && setCreatingBinding(undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content style={{ width: '40em' }} aria-describedby={undefined}>
          <Dialog.Title>{t('Bind new key to action')}</Dialog.Title>

          <p>{t('Action:')} {actionsMap[action].name} <span style={{ color: 'var(--gray-10)', marginLeft: '.5em' }}><Action name={action} /></span></p>

          <p>{t('Please press your desired key combination. Make sure it doesn\'t conflict with any other binding or system hotkeys.')}</p>

          <div style={{ minHeight: '2em' }}>{renderKeys(validKeysDown.length > 0 ? validKeysDown : keysDown)}</div>

          <AnimatePresence>
            {isComboInvalid && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <Warning style={{ paddingBottom: '1em' }}>{t('Combination is invalid')}</Warning>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom: '1em', display: 'flex', gap: '.5em', flexWrap: 'wrap' }}>
            {!keysDown.includes('esc') && <Button style={{ padding: '.2em .4em' }} onClick={() => addKeyDown('esc')}>ESC</Button>}
            {keysDown.length > 0 && (
              <Button onClick={() => setKeysDown([])}><FaUndo style={{ fontSize: '.8em', verticalAlign: 'middle', marginRight: '.3em' }} />{t('Start over')}</Button>
            )}
          </div>

          <Dialog.ButtonRow>
            <DialogButton disabled={fixedKeys.length === 0 || isComboInvalid} onClick={() => action != null && onNewKeyBindingConfirmed(action, keysDown)} primary>
              <FaSave style={{ marginRight: '.3em', verticalAlign: 'middle' }} />{t('Save')}
            </DialogButton>
          </Dialog.ButtonRow>

          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

const rowStyle = { display: 'flex', alignItems: 'center', gap: '.5em', padding: '.4em 0', borderBottom: '1px solid var(--cp-line)', fontSize: '.875rem' };

/** What each quick export preset (Ctrl+1/2/3) makes, as set in Settings: "Discord · 10 MB". */
function useQuickExportLabels() {
  const { t } = useTranslation();
  const { quickExportPresets } = useUserSettings();
  return useMemo(() => normalizeQuickExportPresets(quickExportPresets).map((preset) => getQuickExportPresetLabel(preset, (key, options) => t(key, options))), [quickExportPresets, t]);
}

function WheelModifier({ text, wheelText, modifier }: { text: string, wheelText: string, modifier: ModifierKey }) {
  return (
    <div style={{ ...rowStyle, alignItems: 'center' }}>
      <span>{text}</span>
      <div style={{ flexGrow: 1 }} />
      <kbd style={{ marginRight: '.7em' }}>{getModifier(modifier)}</kbd>
      <FaMouse style={{ marginRight: '.3em' }} />
      <span>{wheelText}</span>
    </div>
  );
}

// eslint-disable-next-line react/display-name
const KeyboardShortcuts = memo(({
  keyBindings, setKeyBindings, resetKeyBindings, currentCutSeg, onTriggerActionClick,
}: {
  keyBindings: KeyBinding[],
  setKeyBindings: Dispatch<SetStateAction<KeyBinding[]>>,
  resetKeyBindings: () => void,
  currentCutSeg: StateSegment | undefined,
  onTriggerActionClick: (action: KeyboardAction) => void,
}) => {
  const { t } = useTranslation();
  const { updateKeyboardLayout, confirmDialog } = useAppContext();

  const { mouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, segmentMouseModifierKey, simpleMode } = useUserSettings();
  const quickExportLabels = useQuickExportLabels();

  const { actionsMap, extraLinesPerCategory } = useMemo(() => {
    const playbackCategory = t('Playback');
    const selectivePlaybackCategory = t('Playback/preview segments only');
    const seekingCategory = t('Seeking');
    const segmentsAndCutpointsCategory = t('Segments and cut points');
    const zoomOperationsCategory = t('Timeline/zoom operations');
    const outputCategory = t('Output actions');
    const batchFilesCategory = t('Batch file list');
    const otherCategory = t('Other operations');
    const streamsCategory = t('Tracks');

    // eslint-disable-next-line no-shadow
    const actionsMap: ActionsMap = {
      toggleLastCommands: {
        name: t('Last ffmpeg commands'),
      },
      toggleKeyboardShortcuts: {
        name: t('Keyboard & mouse shortcuts'),
      },

      // playbackCategory
      togglePlayResetSpeed: {
        name: t('Play/pause'),
        category: playbackCategory,
      },
      togglePlayNoResetSpeed: {
        name: t('Play/pause (no reset speed)'),
        category: playbackCategory,
      },
      play: {
        name: t('Play'),
        category: playbackCategory,
      },
      pause: {
        name: t('Pause'),
        category: playbackCategory,
      },
      increasePlaybackRate: {
        name: t('Speed up playback'),
        category: playbackCategory,
      },
      reducePlaybackRate: {
        name: t('Slow down playback'),
        category: playbackCategory,
      },
      increasePlaybackRateMore: {
        name: t('Speed up playback more'),
        category: playbackCategory,
      },
      reducePlaybackRateMore: {
        name: t('Slow down playback more'),
        category: playbackCategory,
      },
      increaseVolume: {
        name: t('Increase audio volume'),
        category: playbackCategory,
      },
      decreaseVolume: {
        name: t('Decrease audio volume'),
        category: playbackCategory,
      },
      toggleMuted: {
        name: t('Mute preview'),
        category: playbackCategory,
      },
      reloadFile: {
        name: t('Reload current media'),
        category: playbackCategory,
      },
      html5ify: {
        name: t('Convert to supported format'),
        category: playbackCategory,
      },
      makeCursorTimeZero: {
        name: t('Make cursor time zero'),
        category: playbackCategory,
      },

      // selectivePlaybackCategory
      togglePlayOnlyCurrentSegment: {
        name: t('Play current segment once'),
        category: selectivePlaybackCategory,
      },
      toggleLoopOnlyCurrentSegment: {
        name: t('Loop current segment'),
        category: selectivePlaybackCategory,
      },
      toggleLoopStartEndOnlyCurrentSegment: {
        name: t('Loop beginning and end of current segment'),
        category: selectivePlaybackCategory,
      },
      togglePlaySelectedSegments: {
        name: t('Play selected segments in order'),
        category: selectivePlaybackCategory,
      },
      toggleLoopSelectedSegments: {
        name: t('Loop selected segments in order'),
        category: selectivePlaybackCategory,
      },

      // seekingCategory
      seekPreviousFrame: {
        name: t('Step backward 1 frame'),
        category: seekingCategory,
      },
      seekNextFrame: {
        name: t('Step forward 1 frame'),
        category: seekingCategory,
      },
      seekBackwards: {
        name: t('Backward seek'),
        category: seekingCategory,
      },
      seekForwards: {
        name: t('Forward seek'),
        category: seekingCategory,
      },
      seekBackwards2: {
        name: t('Backward seek (longer)'),
        category: seekingCategory,
      },
      seekForwards2: {
        name: t('Forward seek (longer)'),
        category: seekingCategory,
      },
      seekBackwards3: {
        name: t('Backward seek (longest)'),
        category: seekingCategory,
      },
      seekForwards3: {
        name: t('Forward seek (longest)'),
        category: seekingCategory,
      },
      // What these do in the simple editor (see App): Alt+← / → go to clip edges, Ctrl+← / → step a frame.
      seekBackwardsKeyframe: {
        name: simpleMode ? t('Go to the clip edge before') : t('Seek previous keyframe'),
        category: seekingCategory,
      },
      seekForwardsKeyframe: {
        name: simpleMode ? t('Go to the clip edge after') : t('Seek next keyframe'),
        category: seekingCategory,
      },
      seekBackwardsPercent: {
        name: simpleMode ? t('Step backward 1 frame') : t('Seek backward 1% of timeline at current zoom'),
        category: seekingCategory,
      },
      seekForwardsPercent: {
        name: simpleMode ? t('Step forward 1 frame') : t('Seek forward 1% of timeline at current zoom'),
        category: seekingCategory,
      },
      jumpCutStart: {
        name: t('Jump to current segment\'s start time'),
        category: seekingCategory,
        before: <SegmentCutpointButton currentCutSeg={currentCutSeg} side="start" Icon={FaStepBackward} style={{ verticalAlign: 'middle', marginRight: 5 }} />,
      },
      jumpCutEnd: {
        name: t('Jump to current segment\'s end time'),
        category: seekingCategory,
        before: <SegmentCutpointButton currentCutSeg={currentCutSeg} side="end" Icon={FaStepForward} style={{ verticalAlign: 'middle', marginRight: 5 }} />,
      },
      jumpTimelineStart: {
        name: t('Jump to start of video'),
        category: seekingCategory,
      },
      jumpTimelineEnd: {
        name: t('Jump to end of video'),
        category: seekingCategory,
      },
      goToTimecode: {
        name: t('Seek to timecode'),
        category: seekingCategory,
      },

      // segmentsAndCutpointsCategory
      addSegment: {
        name: t('Add cut segment'),
        category: segmentsAndCutpointsCategory,
      },
      removeCurrentCutpoint: {
        name: t('Remove current segment cutpoint'),
        category: segmentsAndCutpointsCategory,
      },
      removeCurrentSegment: {
        name: t('Remove current segment'),
        category: segmentsAndCutpointsCategory,
      },
      removeSelectedClips: {
        name: t('Remove the selected clips'),
        category: segmentsAndCutpointsCategory,
      },
      startOver: {
        name: t('Start over (back to the whole recording)'),
        category: segmentsAndCutpointsCategory,
      },
      setCutStart: {
        name: t('Start current segment at current time'),
        category: segmentsAndCutpointsCategory,
        before: <SetCutpointButton currentCutSeg={currentCutSeg} side="start" style={{ verticalAlign: 'middle', marginRight: 5 }} />,
      },
      setCutEnd: {
        name: t('End current segment at current time'),
        category: segmentsAndCutpointsCategory,
        before: <SetCutpointButton currentCutSeg={currentCutSeg} side="end" style={{ verticalAlign: 'middle', marginRight: 5 }} />,
      },
      labelCurrentSegment: {
        name: t('Label current segment'),
        category: segmentsAndCutpointsCategory,
      },
      editCurrentSegmentTags: {
        name: t('Edit current segment tags'),
        category: segmentsAndCutpointsCategory,
      },
      splitCurrentSegment: {
        name: t('Split segment at cursor'),
        category: segmentsAndCutpointsCategory,
      },
      focusSegmentAtCursor: {
        name: t('Focus segment at cursor'),
        category: segmentsAndCutpointsCategory,
      },
      selectSegmentsAtCursor: {
        name: t('Select segments at cursor'),
        category: segmentsAndCutpointsCategory,
      },
      duplicateCurrentSegment: {
        name: t('Duplicate current segment'),
        category: segmentsAndCutpointsCategory,
      },
      toggleSegmentSpeedControls: {
        name: t('Toggle segment speed controls'),
        category: segmentsAndCutpointsCategory,
      },
      addTextOverlay: {
        name: t('Add text'),
        category: segmentsAndCutpointsCategory,
      },
      editCurrentSegmentCrop: {
        name: t('Zoom / crop the current clip'),
        category: segmentsAndCutpointsCategory,
      },
      jumpPrevSegment: {
        name: t('Jump to previous segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpSeekPrevSegment: {
        name: t('Jump & seek to previous segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpNextSegment: {
        name: t('Jump to next segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpSeekNextSegment: {
        name: t('Jump & seek to next segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpFirstSegment: {
        name: t('Jump to first segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpSeekFirstSegment: {
        name: t('Jump & seek to first segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpLastSegment: {
        name: t('Jump to last segment'),
        category: segmentsAndCutpointsCategory,
      },
      jumpSeekLastSegment: {
        name: t('Jump & seek to last segment'),
        category: segmentsAndCutpointsCategory,
      },
      reorderSegsByStartTime: {
        name: t('Reorder segments by start time'),
        category: segmentsAndCutpointsCategory,
      },
      invertAllSegments: {
        name: t('Invert all segments on timeline'),
        category: segmentsAndCutpointsCategory,
      },
      fillSegmentsGaps: {
        name: t('Fill gaps between segments'),
        category: segmentsAndCutpointsCategory,
      },
      shiftAllSegmentTimes: {
        name: t('Shift all segments on timeline'),
        category: segmentsAndCutpointsCategory,
      },
      alignSegmentTimesToKeyframes: {
        name: t('Align segment times to keyframes'),
        category: segmentsAndCutpointsCategory,
      },
      createSegmentsFromKeyframes: {
        name: t('Create segments from keyframes'),
        category: segmentsAndCutpointsCategory,
      },
      createFixedDurationSegments: {
        name: t('Create fixed duration segments'),
        category: segmentsAndCutpointsCategory,
      },
      createNumSegments: {
        name: t('Create num segments'),
        category: segmentsAndCutpointsCategory,
      },
      createFixedByteSizedSegments: {
        name: t('Create byte sized segments'),
        category: segmentsAndCutpointsCategory,
      },
      createRandomSegments: {
        name: t('Create random segments'),
        category: segmentsAndCutpointsCategory,
      },
      detectBlackScenes: {
        name: t('Detect black scenes'),
        category: segmentsAndCutpointsCategory,
      },
      detectSilentScenes: {
        name: t('Detect silent scenes'),
        category: segmentsAndCutpointsCategory,
      },
      detectSceneChanges: {
        name: t('Detect scene changes'),
        category: segmentsAndCutpointsCategory,
      },
      shuffleSegments: {
        name: t('Shuffle segments order'),
        category: segmentsAndCutpointsCategory,
      },
      combineOverlappingSegments: {
        name: t('Combine overlapping segments'),
        category: segmentsAndCutpointsCategory,
      },
      combineSelectedSegments: {
        name: t('Combine selected segments'),
      },
      clearSegments: {
        name: t('Clear all segments'),
        category: segmentsAndCutpointsCategory,
      },
      toggleSegmentsList: {
        name: simpleMode ? t('Show or hide the clips panel') : t('Show sidebar'),
        category: segmentsAndCutpointsCategory,
      },
      selectOnlyCurrentSegment: {
        name: t('Select only this segment'),
        category: segmentsAndCutpointsCategory,
      },
      toggleCurrentSegmentSelected: {
        name: t('Toggle current segment selected'),
        category: segmentsAndCutpointsCategory,
      },
      deselectAllSegments: {
        name: t('Deselect all segments'),
        category: segmentsAndCutpointsCategory,
      },
      selectAllSegments: {
        name: t('Select all segments'),
        category: segmentsAndCutpointsCategory,
      },
      selectAllMarkers: {
        name: t('Select all markers'),
        category: segmentsAndCutpointsCategory,
      },
      selectSegmentsByLabel: {
        name: t('Select segments by label'),
        category: segmentsAndCutpointsCategory,
      },
      selectSegmentsByExpr: {
        name: t('Select segments by expression'),
        category: segmentsAndCutpointsCategory,
      },
      labelSelectedSegments: {
        name: t('Label selected segments'),
        category: segmentsAndCutpointsCategory,
      },
      invertSelectedSegments: {
        name: t('Invert selected segments'),
        category: segmentsAndCutpointsCategory,
      },
      removeSelectedSegments: {
        name: t('Remove selected segments'),
        category: segmentsAndCutpointsCategory,
      },
      mutateSegmentsByExpr: {
        name: t('Edit segments by expression'),
        category: segmentsAndCutpointsCategory,
      },

      // streamsCategory
      toggleStreamsSelector: {
        name: t('Edit tracks / metadata tags'),
        category: streamsCategory,
      },
      extractAllStreams: {
        name: t('Extract all tracks'),
        category: streamsCategory,
      },
      showStreamsSelector: {
        name: t('Edit tracks / metadata tags'),
        category: streamsCategory,
      },
      showIncludeExternalStreamsDialog: {
        name: t('Include more tracks from other file'),
        category: streamsCategory,
      },

      // zoomOperationsCategory
      timelineZoomIn: {
        name: t('Zoom in timeline'),
        category: zoomOperationsCategory,
      },
      timelineZoomOut: {
        name: t('Zoom out timeline'),
        category: zoomOperationsCategory,
      },
      timelineToggleComfortZoom: {
        name: t('Toggle zoom between 1x and a calculated comfortable zoom level'),
        category: zoomOperationsCategory,
      },

      // outputCategory
      export: {
        name: t('Export segment(s)'),
        category: outputCategory,
      },
      quickExport: {
        name: t('Export right away with the last settings'),
        category: outputCategory,
      },
      quickExportPreset1: {
        name: t('Quick export {{number}}: {{preset}}', { number: 1, preset: quickExportLabels[0] }),
        category: outputCategory,
      },
      quickExportPreset2: {
        name: t('Quick export {{number}}: {{preset}}', { number: 2, preset: quickExportLabels[1] }),
        category: outputCategory,
      },
      quickExportPreset3: {
        name: t('Quick export {{number}}: {{preset}}', { number: 3, preset: quickExportLabels[2] }),
        category: outputCategory,
      },
      // The ones added in Settings > Export (or not, yet).
      quickExportPreset4: { name: t('Quick export {{number}}: {{preset}}', { number: 4, preset: quickExportLabels[3] ?? '' }), category: outputCategory },
      quickExportPreset5: { name: t('Quick export {{number}}: {{preset}}', { number: 5, preset: quickExportLabels[4] ?? '' }), category: outputCategory },
      quickExportPreset6: { name: t('Quick export {{number}}: {{preset}}', { number: 6, preset: quickExportLabels[5] ?? '' }), category: outputCategory },
      quickExportPreset7: { name: t('Quick export {{number}}: {{preset}}', { number: 7, preset: quickExportLabels[6] ?? '' }), category: outputCategory },
      quickExportPreset8: { name: t('Quick export {{number}}: {{preset}}', { number: 8, preset: quickExportLabels[7] ?? '' }), category: outputCategory },
      quickExportPreset9: { name: t('Quick export {{number}}: {{preset}}', { number: 9, preset: quickExportLabels[8] ?? '' }), category: outputCategory },
      captureSnapshot: {
        name: t('Capture snapshot'),
        category: outputCategory,
      },
      captureSnapshotAsCoverArt: {
        name: t('Set current frame as cover art'),
        category: outputCategory,
      },
      captureSnapshotToClipboard: {
        name: t('Capture snapshot to clipboard'),
        category: outputCategory,
      },
      exportYouTube: {
        name: t('Start times as YouTube Chapters'),
        category: outputCategory,
      },
      extractCurrentSegmentFramesAsImages: {
        name: t('Extract frames from current segment as image files'),
        category: outputCategory,
      },
      extractSelectedSegmentsFramesAsImages: {
        name: t('Extract frames from selected segments as image files'),
        category: outputCategory,
      },
      cleanupFilesDialog: {
        name: t('Delete source file'),
        category: outputCategory,
      },
      convertFormatBatch: {
        name: t('Batch convert files to supported format'),
        category: outputCategory,
      },
      convertFormatCurrentFile: {
        name: t('Convert current file to supported format'),
        category: outputCategory,
      },
      fixInvalidDuration: {
        name: t('Fix incorrect duration'),
        category: outputCategory,
      },

      // batchFilesCategory
      batchPreviousFile: {
        name: t('Previous file'),
        category: batchFilesCategory,
      },
      batchOpenPreviousFile: {
        name: t('Open previous file'),
        category: batchFilesCategory,
      },
      batchNextFile: {
        name: t('Next file'),
        category: batchFilesCategory,
      },
      batchOpenNextFile: {
        name: t('Open next file'),
        category: batchFilesCategory,
      },
      batchOpenSelectedFile: {
        name: t('Open selected file'),
        category: batchFilesCategory,
      },
      closeBatch: {
        name: t('Close batch'),
        category: batchFilesCategory,
      },
      concatBatch: {
        name: t('Merge/concatenate files'),
        category: batchFilesCategory,
      },

      // otherCategory
      toggleKeyframeCutMode: {
        name: t('Cut mode'),
        category: otherCategory,
      },
      toggleCaptureFormat: {
        name: t('Capture frame format'),
        category: otherCategory,
      },
      toggleStripAudio: {
        name: t('Keep or discard audio tracks'),
        category: otherCategory,
      },
      toggleStripVideo: {
        name: t('Keep or discard video tracks'),
        category: otherCategory,
      },
      toggleStripSubtitle: {
        name: t('Keep or discard subtitle tracks'),
        category: otherCategory,
      },
      toggleStripThumbnail: {
        name: t('Keep or discard thumbnail tracks'),
        category: otherCategory,
      },
      toggleStripAll: {
        name: t('Keep or discard all tracks'),
        category: otherCategory,
      },
      toggleStripCurrentFilter: {
        name: t('Toggle tracks using current filter'),
        category: otherCategory,
      },
      increaseRotation: {
        name: t('Change rotation'),
        category: otherCategory,
      },
      setStartTimeOffset: {
        name: t('Set custom start offset/timecode'),
        category: otherCategory,
      },
      undo: {
        name: t('Undo'),
        category: otherCategory,
      },
      redo: {
        name: t('Redo'),
        category: otherCategory,
      },
      copySegmentsToClipboard: {
        name: t('Copy selected segments times to clipboard'),
        category: otherCategory,
      },
      toggleWaveformMode: {
        name: t('Show waveform'),
        category: otherCategory,
      },
      generateOverviewWaveform: {
        name: t('Load overview'),
        category: otherCategory,
      },
      toggleShowThumbnails: {
        name: t('Show thumbnails'),
        category: otherCategory,
      },
      toggleShowKeyframes: {
        name: t('Show keyframes'),
        category: otherCategory,
      },
      readAllKeyframes: {
        name: t('Read all keyframes'),
        category: otherCategory,
      },
      toggleFullscreenVideo: {
        name: 'Toggle full screen video',
        category: otherCategory,
      },
      toggleSettings: {
        name: t('Settings'),
        category: otherCategory,
      },
      toggleDarkMode: {
        name: t('Toggle dark mode'),
        category: otherCategory,
      },
      openSendReportDialog: {
        name: t('Report an error'),
        category: otherCategory,
      },
      openFilesDialog: {
        name: t('Open'),
        category: otherCategory,
      },
      openDirDialog: {
        name: t('Open folder'),
        category: otherCategory,
      },
      closeCurrentFile: {
        name: t('Close current file'),
        category: otherCategory,
      },
      quit: {
        name: t('Quit ClipPress'),
        category: otherCategory,
      },
    };

    // eslint-disable-next-line no-shadow
    const extraLinesPerCategory: Record<Category, ReactNode> = {
      [zoomOperationsCategory]: [
        <div key="1" style={{ ...rowStyle, alignItems: 'center' }}>
          <span>{t('Pan timeline')}</span>
          <div style={{ flexGrow: 1 }} />
          <FaMouse style={{ marginRight: '.3em' }} />
          <span>{t('Mouse scroll/wheel up/down')}</span>
        </div>,

        <WheelModifier key="2" text={t('Seek one frame')} wheelText={t('Mouse scroll/wheel up/down')} modifier={mouseWheelFrameSeekModifierKey} />,

        <WheelModifier key="3" text={t('Seek one key frame')} wheelText={t('Mouse scroll/wheel up/down')} modifier={mouseWheelKeyframeSeekModifierKey} />,

        <WheelModifier key="4" text={t('Zoom in/out timeline')} wheelText={t('Mouse scroll/wheel up/down')} modifier={mouseWheelZoomModifierKey} />,
      ],
      [segmentsAndCutpointsCategory]: [
        <div key="1" style={{ ...rowStyle, alignItems: 'center' }}>
          <span>{t('Manipulate segments on timeline')}</span>
          <div style={{ flexGrow: 1 }} />
          <kbd style={{ marginRight: '.7em' }}>{getModifier(segmentMouseModifierKey)}</kbd>
          <FaMouse style={{ marginRight: '.3em' }} />
          <span>{t('Mouse click and drag')}</span>
        </div>,
      ],
    };

    return {
      extraLinesPerCategory,
      actionsMap,
    };
  }, [currentCutSeg, mouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, mouseWheelZoomModifierKey, quickExportLabels, segmentMouseModifierKey, simpleMode, t]);

  useEffect(() => {
    updateKeyboardLayout();
  }, [updateKeyboardLayout]);

  useEffect(() => {
    // cleanup invalid bindings, to prevent renamed actions from blocking user to rebind
    const validBindings = keyBindings.filter(({ action }) => actionsMap[action]);

    if (validBindings.length !== keyBindings.length) {
      console.log(`Auto deleting ${keyBindings.length - validBindings.length} invalid key binding(s)`);
      setKeyBindings(validBindings);
    }
  }, [actionsMap, keyBindings, setKeyBindings]);

  const [creatingBinding, setCreatingBinding] = useState<KeyboardAction>();
  const [searchQuery, setSearchQuery] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const searchQueryTrimmed = searchQuery.toLowerCase().trim();
  const isSearching = !!searchQueryTrimmed;

  // Quick exports that haven't been added (Settings > Export) aren't listed.
  const isUnusedQuickExport = useCallback((action: KeyboardAction) => (quickExportPresetActions as readonly KeyboardAction[]).indexOf(action) >= quickExportLabels.length, [quickExportLabels.length]);
  const actionEntries = useMemo(() => (Object.entries(actionsMap) as unknown as [keyof typeof actionsMap, typeof actionsMap[keyof typeof actionsMap]][]).filter(([key, { name, category }]) => (
    !isUnusedQuickExport(key) && (
      !isSearching
      || key.toLocaleLowerCase().includes(searchQueryTrimmed)
      || name.toLowerCase().includes(searchQueryTrimmed)
      || (category != null && category.toLowerCase().includes(searchQueryTrimmed))
    )
  )), [actionsMap, isSearching, isUnusedQuickExport, searchQueryTrimmed]);

  const categoriesWithActions = useMemo(() => Object.entries(groupBy(actionEntries, ([, { category }]) => category)), [actionEntries]);

  // Confirmed in place (ConfirmButton).
  const onDeleteBindingClick = useCallback(({ action, keys }: { action: KeyboardAction, keys: string }) => {
    console.log('Delete key binding', action, keys);
    setKeyBindings((existingBindings) => existingBindings.filter((existingBinding) => !(existingBinding.keys === keys && existingBinding.action === action)));
  }, [setKeyBindings]);


  const onAddBindingClick = useCallback((action: KeyboardAction) => {
    setCreatingBinding(action);
  }, []);

  const stringifyKeys = (keys: string[]) => keys.join('+');

  const onNewKeyBindingConfirmed = useCallback(async (action: KeyboardAction, keys: string[]) => {
    const keysStr = stringifyKeys(keys);
    console.log('New key binding', action, keysStr);

    const duplicate = keyBindings.find((existingBinding) => existingBinding.keys === keysStr);
    let shouldReplaceDuplicate: KeyBinding | undefined;
    if (duplicate) {
      const isConfirmed = await confirmDialog({ confirmButtonText: t('Replace'), description: t('These keys already run "{{alreadyBoundKey}}". Use them for this instead?', { alreadyBoundKey: actionsMap[duplicate.action]?.name }) });

      if (isConfirmed) {
        shouldReplaceDuplicate = duplicate;
      } else {
        return;
      }
    }

    setKeyBindings((existingBindings) => {
      console.log('Saving key binding');
      setCreatingBinding(undefined);
      const filtered = !shouldReplaceDuplicate ? existingBindings : existingBindings.filter((existing) => existing.keys !== shouldReplaceDuplicate.keys);
      return [...filtered, { action, keys: keysStr }];
    });
  }, [actionsMap, confirmDialog, keyBindings, setKeyBindings, t]);

  return (
    <>
      <div style={{ marginBottom: '1em' }}>
        {/* Sticks to the top of the scrolling list, so searching never means scrolling back up. */}
        <div className={styles['search']}>
          <TextInput ref={searchInputRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('Search shortcuts')} aria-label={t('Search shortcuts')} style={{ width: '100%' }} />
        </div>

        {categoriesWithActions.map(([category, actionsInCategory]) => (
          <div key={category} className={styles['category']}>
            {category !== 'undefined' && <div className={styles['categoryTitle']}>{category}</div>}

            {actionsInCategory.map(([action, actionObj]) => {
              const actionName = (actionObj && actionObj.name) || action;
              const beforeContent = actionObj && actionObj.before;

              const bindingsForThisAction = keyBindings.filter((keyBinding) => keyBinding.action === action);

              return (
                <div key={action} className={styles['row']}>
                  <div className={styles['rowName']} title={simpleMode ? undefined : t('API action name: {{action}}', { action })}>
                    {beforeContent}
                    <span>{actionName}</span>
                    {!simpleMode && (
                      <Button size="sm" variant="ghost" title={t('Run this action now')} aria-label={t('Run this action now')} onClick={() => onTriggerActionClick(action)}><FaHammer aria-hidden /></Button>
                    )}
                  </div>

                  <div className={styles['rowKeys']}>
                    {bindingsForThisAction.map(({ keys }) => (
                      <div key={keys} className={styles['binding']}>
                        {renderKeys(splitKeyboardKeys(keys))}
                        <ConfirmButton size="sm" className={styles['bindingRemove']} confirmLabel={t('Remove')} onConfirm={() => onDeleteBindingClick({ action, keys })}><FaTrash aria-label={t('Remove shortcut')} style={{ fontSize: '.75em' }} /></ConfirmButton>
                      </div>
                    ))}

                    {bindingsForThisAction.length === 0 && <span className={styles['noBinding']}>{t('None')}</span>}
                  </div>

                  <Button size="sm" variant="ghost" title={t('Add a shortcut')} aria-label={t('Add a shortcut')} onClick={() => onAddBindingClick(action)}><FaPlus aria-hidden style={{ fontSize: '.75em' }} /></Button>
                </div>
              );
            })}

            {extraLinesPerCategory[category] && <div style={{ marginTop: '.5em' }}>{extraLinesPerCategory[category]}</div>}
          </div>
        ))}
      </div>

      {!isSearching && (
        <div style={{ marginBottom: '1em' }}>
          <ConfirmButton question={t('Reset every shortcut?')} confirmLabel={t('Reset')} onConfirm={resetKeyBindings}><FaUndo aria-hidden />{t('Reset all shortcuts')}</ConfirmButton>
        </div>
      )}

      <CreateBinding actionsMap={actionsMap} action={creatingBinding} setCreatingBinding={setCreatingBinding} onNewKeyBindingConfirmed={onNewKeyBindingConfirmed} />
    </>
  );
});

/** The clip workflow's shortcuts at a glance (#20), read from the current bindings. */
function Essentials({ keyBindings }: { keyBindings: KeyBinding[] }) {
  const { t } = useTranslation();
  const { segmentMouseModifierKey, simpleMode } = useUserSettings();
  const quickExportLabels = useQuickExportLabels();

  const groups = useMemo(() => [
    {
      id: 'playback',
      title: t('Playback'),
      items: [
        { label: t('Play / pause'), actions: ['togglePlayResetSpeed'] },
        { label: t('Back / forward'), actions: ['seekBackwards', 'seekForwards'] },
        // Ctrl+← / → in the simple editor (see App).
        { label: t('Previous / next frame'), actions: simpleMode ? ['seekBackwardsPercent', 'seekForwardsPercent'] : ['seekPreviousFrame', 'seekNextFrame'] },
        { label: t('Slower / faster'), actions: ['reducePlaybackRate', 'increasePlaybackRate'] },
        { label: t('Mute'), actions: ['toggleMuted'] },
      ],
    },
    {
      id: 'clips',
      title: t('Clips'),
      items: [
        { label: t('Start the clip here'), actions: ['setCutStart'] },
        { label: t('End the clip here'), actions: ['setCutEnd'] },
        { label: t('New clip'), actions: ['addSegment'] },
        { label: t('Split the clip'), actions: ['splitCurrentSegment'] },
        { label: t('Previous / next clip'), actions: ['jumpPrevSegment', 'jumpNextSegment'] },
        { label: t('Go to clip start / end'), actions: ['jumpCutStart', 'jumpCutEnd'] },
        ...(simpleMode ? [{ label: t('Clip edge before / after'), actions: ['seekBackwardsKeyframe', 'seekForwardsKeyframe'] satisfies KeyboardAction[] }] : []),
        { label: t('Rename the clip'), actions: ['labelCurrentSegment'] },
      ],
    },
    {
      id: 'editing',
      title: t('Editing'),
      items: [
        { label: t('Add text'), actions: ['addTextOverlay'] },
        { label: t('Speed controls'), actions: ['toggleSegmentSpeedControls'] },
        { label: t('Undo / redo'), actions: ['undo', 'redo'] },
        { label: t('Zoom the timeline in / out'), actions: ['timelineZoomIn', 'timelineZoomOut'] },
      ],
    },
    {
      id: 'export',
      title: t('Export and more'),
      items: [
        { label: t('Export'), actions: ['export'] },
        { label: t('Save a still frame'), actions: ['captureSnapshot'] },
        { label: t('Go to a time'), actions: ['goToTimecode'] },
        { label: t('Full screen video'), actions: ['toggleFullscreenVideo'] },
        { label: t('Keyboard shortcuts'), actions: ['toggleKeyboardShortcuts'] },
      ],
    },
    {
      // Without the export options. The presets share a row, with what each makes in its tooltip (they're set in
      // Settings > Export), so this column stays shorter than the other.
      id: 'quickExport',
      title: t('Quick export'),
      items: [
        { label: t('Last settings'), actions: ['quickExport'] },
        {
          label: t('Presets'),
          actions: quickExportPresetActions.slice(0, quickExportLabels.length),
          title: quickExportLabels.map((preset, index) => t('Quick export {{number}}: {{preset}}', { number: index + 1, preset })).join('\n'),
        },
      ],
    },
  ] satisfies { id: string, title: string, items: { label: string, actions: KeyboardAction[], title?: string }[] }[], [quickExportLabels, simpleMode, t]);

  // The first binding of each action (most have one); unbound actions show a dash.
  const keysFor = (action: KeyboardAction) => keyBindings.find((binding) => binding.action === action)?.keys;

  // Two columns that each stack their own groups (Playback over Editing and Quick export, Clips over Export and
  // more), so a short group doesn't leave a gap beside a long one. The second one is the taller, so it sets the
  // dialog's height as before the quick exports.
  const columns = [['playback', 'editing', 'quickExport'], ['clips', 'export']].map((ids) => groups.filter((group) => ids.includes(group.id)));

  return (
    <div className={styles['essentials']}>
      {columns.map((column) => (
        <div key={column.map((group) => group.id).join(',')} className={styles['essentialsColumn']}>
          {column.map((group) => (
            <section key={group.id} className={styles['essentialsGroup']}>
              <div className={styles['categoryTitle']}>{group.title}</div>
              {group.items.map((item) => (
                <div key={item.actions.join(',')} className={styles['essentialsRow']} title={'title' in item ? item.title : undefined}>
                  <span>{item.label}</span>
                  <span className={styles['essentialsKeys']}>
                    {item.actions.map((action, i) => {
                      const keys = keysFor(action);
                      return (
                        <Fragment key={action}>
                          {i > 0 && <span className={styles['slash']}>/</span>}
                          {keys != null ? renderKeys(splitKeyboardKeys(keys)) : <span className={styles['noBinding']}>–</span>}
                        </Fragment>
                      );
                    })}
                  </span>
                </div>
              ))}
              {group.id === 'clips' && (
                <div className={styles['essentialsRow']}>
                  <span>{t('Move or resize a clip')}</span>
                  <span className={styles['essentialsKeys']}>
                    <kbd>{getModifier(segmentMouseModifierKey)}</kbd>
                    <span className={styles['slash']}>+</span>
                    <FaMouse aria-hidden />
                    <span className={styles['noBinding']} style={{ marginLeft: '.3em' }}>{t('drag')}</span>
                  </span>
                </div>
              )}
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

function KeyboardShortcutsDialog({
  isShown, onHide, keyBindings, setKeyBindings, resetKeyBindings, currentCutSeg, getKeyboardAction, onChangeShortcutsRequested, initialView,
}: {
  isShown: boolean,
  onHide: () => void,
  keyBindings: KeyBinding[],
  setKeyBindings: Dispatch<SetStateAction<KeyBinding[]>>,
  resetKeyBindings: () => void,
  currentCutSeg: StateSegment | undefined,
  getKeyboardAction: (action: KeyboardAction) => () => void,
  /** Settings > Shortcuts, where they're changed: this dialog is the quick reference. */
  onChangeShortcutsRequested: () => void,
  initialView?: 'essentials' | 'all' | undefined,
}) {
  const { t } = useTranslation();
  const { simpleMode } = useUserSettings();
  const [view, setView] = useState<'essentials' | 'all' | undefined>(initialView);
  const effectiveView = view ?? (simpleMode ? 'essentials' : 'all');

  const handleTriggerActionClick = useCallback((action: KeyboardAction) => {
    onHide();
    getKeyboardAction(action)();
  }, [getKeyboardAction, onHide]);

  return (
    <Dialog.Root open={isShown} onOpenChange={(v) => v === false && onHide()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content
          // Only the list scrolls: the title, the close button and the view switch stay put.
          style={{ width: '44rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          aria-describedby={undefined}
          // Focus the dialog itself, so it opens without a focus ring on "Essentials". The "All shortcuts" view
          // has already focused its search box as it mounted: leave that.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const content = e.currentTarget as HTMLElement | null;
            if (content != null && !content.contains(document.activeElement)) content.focus({ preventScroll: true });
          }}
        >
          <Dialog.Title>{t('Keyboard shortcuts')}</Dialog.Title>

          <div className={styles['viewSwitch']}>
            <SegmentedControl<'essentials' | 'all'>
              ariaLabel={t('Shortcuts to show')}
              fullWidth={false}
              value={effectiveView}
              onChange={setView}
              options={[
                { value: 'essentials', label: t('Essentials') },
                { value: 'all', label: t('All shortcuts') },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={onChangeShortcutsRequested}>{t('Change shortcuts…')}</Button>
          </div>

          <div className={styles['body']}>
            {effectiveView === 'essentials' ? (
              <Essentials keyBindings={keyBindings} />
            ) : (
              <KeyboardShortcuts keyBindings={keyBindings} setKeyBindings={setKeyBindings} currentCutSeg={currentCutSeg} resetKeyBindings={resetKeyBindings} onTriggerActionClick={handleTriggerActionClick} />
            )}
          </div>

          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default memo(KeyboardShortcutsDialog);
