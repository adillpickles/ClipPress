import type { MutableRefObject, CSSProperties, WheelEventHandler, MouseEventHandler, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import debounce from 'lodash/debounce';
import { useTranslation } from 'react-i18next';
import { FaCaretDown, FaCaretUp, FaTimes } from 'react-icons/fa';
import invariant from 'tiny-invariant';

import TimelineSeg from './TimelineSeg';
import BetweenSegments from './BetweenSegments';
import useContextMenu from './hooks/useContextMenu';
import useUserSettings from './hooks/useUserSettings';

import styles from './Timeline.module.css';


import { timelineBackground, darkModeTransition } from './colors';
import type { Frame } from './ffmpeg';
import type { FormatTimecode, InverseCutSegment, OverviewWaveform, OverlayClip, RenderableWaveform, WaveformSlice, StateSegment, Thumbnail } from './types';
import Button from './components/Button';
import type { UseSegments } from './hooks/useSegments';
import { keyMap } from './hooks/useTimelineScroll';
import { minTextOverlayDuration } from './textOverlays';
import SegmentRetimeBar from './components/SegmentRetimeBar';
import { getSegmentOutputDuration, getSegmentSpeed, getSpeedForOutputDuration } from './segmentSpeed';
import { createTimelineMap, getWarpedImageSpans } from './timelineMap';
import type { TimelineMap } from './timelineMap';

const remote = window.require('@electron/remote');
const { Menu } = remote;


const currentTimeWidth = 1;

// eslint-disable-next-line react/display-name
const Waveform = memo(({ waveform, timelineMap, laneDuration, fileDurationNonZero, darkMode }: {
  waveform: RenderableWaveform,
  timelineMap: TimelineMap,
  laneDuration: number,
  fileDurationNonZero: number,
  darkMode: boolean,
}) => {
  const from = 'from' in waveform ? waveform.from : 0;
  const to = 'to' in waveform ? Math.min(waveform.to, fileDurationNonZero) : fileDurationNonZero;
  const spans = useMemo(() => getWarpedImageSpans(timelineMap, from, to, laneDuration), [from, laneDuration, timelineMap, to]);

  return spans.map((span) => {
    const spanStyle: CSSProperties = { pointerEvents: 'none', position: 'absolute', height: '100%', left: `${span.left}%`, width: `${span.width}%`, overflow: 'hidden' };
    if (waveform.url == null) return <div key={span.left} style={spanStyle} className={styles['loading-bg']} />;
    return (
      <div key={span.left} style={spanStyle}>
        <img src={waveform.url} draggable={false} alt="" style={{ position: 'absolute', height: '100%', left: `${span.innerLeft}%`, width: `${span.innerWidth}%`, filter: darkMode ? undefined : 'invert(1)', imageRendering: 'pixelated' }} />
      </div>
    );
  });
});

// eslint-disable-next-line react/display-name
const Waveforms = memo(({ timelineMap, laneDuration, laneWidthPercent, fileDurationNonZero, waveforms, overviewWaveform, zoom, darkMode, height }: {
  timelineMap: TimelineMap,
  laneDuration: number,
  laneWidthPercent: number,
  fileDurationNonZero: number,
  waveforms: WaveformSlice[],
  overviewWaveform: OverviewWaveform | undefined,
  zoom: number,
  darkMode: boolean,
  height: number,
}) => (
  <div style={{ height, width: `${laneWidthPercent}%`, position: 'relative' }}>
    {zoom === 1 && overviewWaveform != null ? (
      <Waveform waveform={overviewWaveform} timelineMap={timelineMap} laneDuration={laneDuration} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ) : waveforms.map((waveform) => (
      <Waveform key={`${waveform.from}-${waveform.to}`} waveform={waveform} timelineMap={timelineMap} laneDuration={laneDuration} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ))}
  </div>
));

// eslint-disable-next-line react/display-name
const CommandedTime = memo(({ commandedTimePercent }: { commandedTimePercent: string }) => {
  const color = 'var(--gray-12)';
  const commonStyle: CSSProperties = { left: commandedTimePercent, position: 'absolute', pointerEvents: 'none' };
  return (
    <>
      <FaCaretDown style={{ ...commonStyle, top: 0, color, fontSize: 14, marginLeft: -7, marginTop: -6 }} />
      <div style={{ ...commonStyle, bottom: 0, top: 0, backgroundColor: color, width: currentTimeWidth }} />
      <FaCaretUp style={{ ...commonStyle, bottom: 0, color, fontSize: 14, marginLeft: -7, marginBottom: -5 }} />
    </>
  );
});

const timelineHeight = 36;
const textLaneHeight = 24;
const retimeLaneHeight = 38;
/** Extra lane space (fraction of the visible width) kept past the end while retiming. */
const retimeTrailingSpace = 0.15;
const laneLabelStyle: CSSProperties = {
  position: 'absolute',
  left: 8,
  top: 4,
  color: 'var(--gray-11)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  pointerEvents: 'none',
  fontWeight: 700,
};

const timeWrapperStyle: CSSProperties = { height: timelineHeight };

function Timeline({
  fileDurationNonZero,
  startTimeOffset,
  playerTime,
  commandedTime,
  relevantTime,
  zoom,
  neighbouringKeyFrames,
  seekAbs,
  cutSegments,
  setCurrentSegIndex,
  currentSegIndexSafe,
  currentCutSeg,
  inverseCutSegments,
  formatTimecode,
  formatTimeAndFrames,
  waveforms,
  overviewWaveform,
  shouldShowWaveform,
  shouldShowKeyframes,
  thumbnails,
  zoomWindowStartTime,
  zoomWindowEndTime,
  onZoomWindowStartTimeChange,
  onGenerateOverviewWaveformClick,
  waveformEnabled,
  waveformHeight,
  showThumbnails,
  playing,
  isFileOpened,
  onWheel,
  commandedTimeRef,
  goToTimecode,
  darkMode,
  setCutTime,
  overlayClips,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlayClip,
  onDeleteOverlayClip,
  speedControlsSegmentIds,
  onChangeSegmentSpeed,
  onEditSegmentSpeed,
  onEditSegmentCrop,
  onToggleSegmentSpeedControls,
} : {
  fileDurationNonZero: number,
  startTimeOffset: number,
  playerTime: number | undefined,
  commandedTime: number,
  relevantTime: number,
  zoom: number,
  neighbouringKeyFrames: Frame[],
  seekAbs: (a: number) => void,
  cutSegments: StateSegment[],
  setCurrentSegIndex: (a: number) => void,
  currentSegIndexSafe: number,
  currentCutSeg: StateSegment | undefined,
  inverseCutSegments: InverseCutSegment[],
  formatTimecode: FormatTimecode,
  formatTimeAndFrames: (a: number) => string,
  waveforms: WaveformSlice[],
  overviewWaveform: OverviewWaveform | undefined,
  shouldShowWaveform: boolean,
  shouldShowKeyframes: boolean,
  thumbnails: Thumbnail[],
  zoomWindowStartTime: number,
  zoomWindowEndTime: number | undefined,
  onZoomWindowStartTimeChange: (a: number) => void,
  onGenerateOverviewWaveformClick: () => void,
  waveformEnabled: boolean,
  waveformHeight: number,
  showThumbnails: boolean,
  playing: boolean,
  isFileOpened: boolean,
  onWheel: WheelEventHandler,
  commandedTimeRef: MutableRefObject<number>,
  goToTimecode: () => void,
  darkMode: boolean,
  setCutTime: UseSegments['setCutTime'];
  overlayClips: OverlayClip[],
  selectedOverlayId: string | undefined,
  onSelectOverlay: (overlayId: string | undefined) => void,
  onUpdateOverlayClip: (overlayId: string, updater: (clip: OverlayClip) => OverlayClip) => void,
  onDeleteOverlayClip: (overlayId: string) => void,
  speedControlsSegmentIds: ReadonlySet<string>,
  onChangeSegmentSpeed: (segmentId: string, speed: number) => void,
  onEditSegmentSpeed: (index: number) => void,
  onEditSegmentCrop: (index: number) => void,
  onToggleSegmentSpeedControls: (segmentId: string) => void,
}) {
  const { t } = useTranslation();

  const { invertCutSegments, springAnimation, segmentMouseModifierKey } = useUserSettings();

  const timelineScrollerRef = useRef<HTMLDivElement>(null);
  const timelineScrollerSkipEventRef = useRef<boolean>(false);
  const timelineScrollerSkipEventDebounce = useRef<() => void>();
  const timelineWrapperRef = useRef<HTMLDivElement>(null);

  const [hoveringTime, setHoveringTime] = useState<number>();
  const [hoveredDeleteOverlayId, setHoveredDeleteOverlayId] = useState<string>();

  const displayTime = (hoveringTime != null && isFileOpened && !playing ? hoveringTime : relevantTime) + startTimeOffset;
  const displayTimePercent = useMemo(() => `${Math.round((displayTime / fileDurationNonZero) * 100)}%`, [displayTime, fileDurationNonZero]);

  const isZoomed = zoom > 1;

  const keyFramesInZoomWindow = useMemo(() => (zoomWindowEndTime == null ? [] : neighbouringKeyFrames.filter((f) => f.time >= zoomWindowStartTime && f.time <= zoomWindowEndTime)), [neighbouringKeyFrames, zoomWindowEndTime, zoomWindowStartTime]);

  // Don't show keyframes if too packed together (at current zoom)
  // See https://github.com/mifi/lossless-cut/issues/259
  const areKeyframesTooClose = keyFramesInZoomWindow.length > zoom * 200;

  const retimeSegments = useMemo(() => cutSegments.flatMap((seg, index) => (
    seg.end != null && speedControlsSegmentIds.has(seg.segId) ? [{ seg: { ...seg, end: seg.end }, index }] : []
  )), [cutSegments, speedControlsSegmentIds]);

  // The live speed of the segment being retimed, plus the timeline length when the drag began.
  const [retimeDrag, setRetimeDrag] = useState<{ segId: string, speed: number, scaleDuration: number }>();

  const timelineMap = useMemo(() => {
    if (invertCutSegments) return createTimelineMap([], fileDurationNonZero);
    const segments = retimeDrag == null ? cutSegments : cutSegments.map((seg) => (seg.segId === retimeDrag.segId ? { ...seg, speed: retimeDrag.speed } : seg));
    return createTimelineMap(segments, fileDurationNonZero);
  }, [cutSegments, fileDurationNonZero, invertCutSegments, retimeDrag]);

  // While retiming, the pixel scale stays fixed so the edge tracks the cursor: lanes grow or
  // shrink and scroll (with room to keep dragging) instead of the whole timeline refitting.
  const scaleDuration = retimeDrag?.scaleDuration ?? timelineMap.displayDuration;
  const laneDuration = timelineMap.displayDuration + (retimeDrag != null ? (scaleDuration / zoom) * retimeTrailingSpace : 0);
  const laneWidthPercent = zoom * 100 * (laneDuration / scaleDuration);

  const retimeDragging = retimeDrag != null;
  const timelineMapRef = useRef(timelineMap);
  useEffect(() => {
    timelineMapRef.current = timelineMap;
  }, [timelineMap]);

  const toLanePercent = useCallback((time: number) => (timelineMap.toDisplay(time) / laneDuration) * 100, [laneDuration, timelineMap]);

  const calculateTimelinePos = useCallback((time: number | undefined) => (time !== undefined ? Math.min(timelineMap.toDisplay(time) / laneDuration, 1) : undefined), [laneDuration, timelineMap]);
  const calculateTimelinePercent = useCallback((time: number | undefined) => {
    const pos = calculateTimelinePos(time);
    return pos !== undefined ? `${pos * 100}%` : undefined;
  }, [calculateTimelinePos]);

  const currentTimePercent = useMemo(() => calculateTimelinePercent(playerTime), [calculateTimelinePercent, playerTime]);
  const commandedTimePercent = useMemo(() => calculateTimelinePercent(commandedTime), [calculateTimelinePercent, commandedTime]);

  const timeOfInterestPosPixels = useMemo(() => {
    // https://github.com/mifi/lossless-cut/issues/676
    const pos = calculateTimelinePos(relevantTime);
    // eslint-disable-next-line react-hooks/refs
    if (pos != null && timelineScrollerRef.current) return pos * (laneWidthPercent / 100) * timelineScrollerRef.current!.offsetWidth;
    return undefined;
  }, [calculateTimelinePos, laneWidthPercent, relevantTime]);

  const calcZoomWindowStartTime = useCallback(() => (timelineScrollerRef.current
    ? timelineMap.toSource((timelineScrollerRef.current.scrollLeft / (timelineScrollerRef.current!.offsetWidth * (laneWidthPercent / 100))) * laneDuration)
    : 0), [laneDuration, laneWidthPercent, timelineMap]);

  // const zoomWindowStartTime = calcZoomWindowStartTime(duration, zoom);

  useEffect(() => {
    timelineScrollerSkipEventDebounce.current = debounce(() => {
      timelineScrollerSkipEventRef.current = false;
    }, 1000);
  }, []);

  function suppressScrollerEvents() {
    timelineScrollerSkipEventRef.current = true;
    timelineScrollerSkipEventDebounce.current?.();
  }

  const scrollLeftMotion = useMotionValue(0);

  const spring = useSpring(scrollLeftMotion, { damping: 100, stiffness: 1000 });

  useEffect(() => {
    spring.on('change', (value) => {
      if (timelineScrollerSkipEventRef.current) return; // Don't animate while zooming
      timelineScrollerRef.current!.scrollLeft = value;
    });
  }, [spring]);

  // Pan timeline when cursor moves out of timeline window
  useEffect(() => {
    if (timeOfInterestPosPixels == null || timelineScrollerSkipEventRef.current || retimeDragging) return;

    invariant(timelineScrollerRef.current != null);
    if (timeOfInterestPosPixels > timelineScrollerRef.current.scrollLeft + timelineScrollerRef.current.offsetWidth) {
      const timelineWidth = timelineWrapperRef.current!.offsetWidth;
      const scrollLeft = timeOfInterestPosPixels - (timelineScrollerRef.current.offsetWidth * 0.1);
      scrollLeftMotion.set(Math.min(scrollLeft, timelineWidth - timelineScrollerRef.current.offsetWidth));
    } else if (timeOfInterestPosPixels < timelineScrollerRef.current.scrollLeft) {
      const scrollLeft = timeOfInterestPosPixels - (timelineScrollerRef.current.offsetWidth * 0.9);
      scrollLeftMotion.set(Math.max(scrollLeft, 0));
    }
  }, [timeOfInterestPosPixels, scrollLeftMotion, retimeDragging]);

  // Keep cursor in middle while zooming
  useEffect(() => {
    suppressScrollerEvents();

    if (isZoomed) {
      invariant(timelineScrollerRef.current != null);
      const zoomedTargetWidth = timelineScrollerRef.current.offsetWidth * zoom;

      const map = timelineMapRef.current;
      const scrollLeft = Math.max((map.toDisplay(commandedTimeRef.current) / map.displayDuration) * zoomedTargetWidth - timelineScrollerRef.current.offsetWidth / 2, 0);
      scrollLeftMotion.set(scrollLeft);
      timelineScrollerRef.current.scrollLeft = scrollLeft;
    }
  }, [zoom, commandedTimeRef, scrollLeftMotion, isZoomed]);


  useEffect(() => {
    const cancelWheel = (event: WheelEvent) => event.preventDefault();

    const scroller = timelineScrollerRef.current;
    invariant(scroller != null);
    scroller.addEventListener('wheel', cancelWheel, { passive: false });

    return () => {
      scroller.removeEventListener('wheel', cancelWheel);
    };
  }, []);

  const onTimelineScroll = useCallback(() => {
    onZoomWindowStartTimeChange(calcZoomWindowStartTime());
  }, [calcZoomWindowStartTime, onZoomWindowStartTimeChange]);

  // Keep cursor in middle while scrolling
  /* const onTimelineScroll = useCallback((e) => {
    onZoomWindowStartTimeChange(zoomWindowStartTime);

    if (!zoomed || timelineScrollerSkipEventRef.current) return;

    seekAbs((((e.target.scrollLeft + (timelineScrollerRef.current.offsetWidth * 0.5))
      / (timelineScrollerRef.current.offsetWidth * zoom)) * duration));
  }, [duration, seekAbs, zoomed, zoom, zoomWindowStartTime, onZoomWindowStartTimeChange]); */

  const getMouseTimelinePos = useCallback((e: MouseEvent) => {
    const target = timelineWrapperRef.current;
    invariant(target != null);
    const rect = target.getBoundingClientRect();
    const relX = e.pageX - (rect.left + document.body.scrollLeft);
    return timelineMap.toSource((relX / target.offsetWidth) * laneDuration);
  }, [laneDuration, timelineMap]);

  const mouseDownRef = useRef<unknown>();

  useEffect(() => {
    setHoveringTime(undefined);
  }, [relevantTime]);

  // for performance
  const currentCutSegRef = useRef<StateSegment | undefined>(currentCutSeg);
  useEffect(() => {
    currentCutSegRef.current = currentCutSeg;
  }, [currentCutSeg]);

  const resizingSegmentRef = useRef<{ operation: 'start' | 'end' | 'move', offset?: number } | undefined>();
  const overlayInteractionRef = useRef<
    | { overlayId: string, mode: 'start' | 'end' | 'move', pointerStart: number, start: number, end: number }
    | undefined
  >();

  const onMouseDown = useCallback<MouseEventHandler<HTMLElement>>((e) => {
    if (e.nativeEvent.buttons !== 1) return; // not primary button

    const mouseTimelinePos = getMouseTimelinePos(e.nativeEvent);
    seekAbs(mouseTimelinePos);

    // eslint-disable-next-line no-shadow
    const currentCutSeg = currentCutSegRef.current;

    // start/end handles 1.5% of visible timeline
    const threshold = ((0.01 / 2) * fileDurationNonZero) / zoom;

    if (currentCutSeg != null && currentCutSeg.selected && e[keyMap[segmentMouseModifierKey]]) {
      if (Math.abs(mouseTimelinePos - currentCutSeg.start) < threshold) {
        resizingSegmentRef.current = { operation: currentCutSeg.end == null ? 'move' : 'start' }; // move marker or resize segment
      } else if (currentCutSeg.end != null && Math.abs(mouseTimelinePos - currentCutSeg.end) < threshold) {
        resizingSegmentRef.current = { operation: 'end' };
      } else if (currentCutSeg.end != null && mouseTimelinePos >= currentCutSeg.start && mouseTimelinePos <= currentCutSeg.end) {
        resizingSegmentRef.current = { operation: 'move', offset: mouseTimelinePos - currentCutSeg.start };
      }
    }

    mouseDownRef.current = e.target;

    function onMouseMove(e2: MouseEvent) {
      if (mouseDownRef.current == null) return;
      const mouseDragTimelinePos = getMouseTimelinePos(e2);
      seekAbs(mouseDragTimelinePos);
      try {
        // eslint-disable-next-line unicorn/prefer-switch
        if (resizingSegmentRef.current?.operation === 'start') {
          setCutTime('start', mouseDragTimelinePos);
        } else if (resizingSegmentRef?.current?.operation === 'end') {
          setCutTime('end', mouseDragTimelinePos);
        } else if (resizingSegmentRef?.current?.operation === 'move') {
          setCutTime('move', mouseDragTimelinePos - (resizingSegmentRef.current.offset ?? 0));
        }
      } catch (err) {
        console.warn('Error while resizing segment:', err instanceof Error ? err.message : err);
      }
    }

    function onMouseUp() {
      mouseDownRef.current = undefined;
      resizingSegmentRef.current = undefined;
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    // https://github.com/mifi/lossless-cut/issues/1432
    // https://stackoverflow.com/questions/11533098/how-to-catch-mouse-up-event-outside-of-element
    // https://stackoverflow.com/questions/6073505/what-is-the-difference-between-screenx-y-clientx-y-and-pagex-y
    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [fileDurationNonZero, getMouseTimelinePos, seekAbs, segmentMouseModifierKey, setCutTime, zoom]);

  const onOverlayMouseDown = useCallback((overlayClip: OverlayClip, mode: 'start' | 'end' | 'move') => (e: ReactMouseEvent<HTMLElement>) => {
    if (e.nativeEvent.buttons !== 1) return;
    e.preventDefault();
    e.stopPropagation();

    onSelectOverlay(overlayClip.overlayId);
    const mouseTimelinePos = getMouseTimelinePos(e.nativeEvent);
    seekAbs(mode === 'end' ? overlayClip.end : overlayClip.start);
    overlayInteractionRef.current = {
      overlayId: overlayClip.overlayId,
      mode,
      pointerStart: mouseTimelinePos,
      start: overlayClip.start,
      end: overlayClip.end,
    };

    function onMouseMove(e2: MouseEvent) {
      const overlayInteraction = overlayInteractionRef.current;
      if (overlayInteraction == null) return;
      const mouseDragTimelinePos = getMouseTimelinePos(e2);
      seekAbs(mouseDragTimelinePos);
      onUpdateOverlayClip(overlayClip.overlayId, (clip) => {
        if (overlayInteraction.mode === 'start') {
          const delta = mouseDragTimelinePos - overlayInteraction.pointerStart;
          return {
            ...clip,
            start: Math.max(0, Math.min(overlayInteraction.start + delta, overlayInteraction.end - minTextOverlayDuration)),
          };
        }

        if (overlayInteraction.mode === 'move') {
          const duration = overlayInteraction.end - overlayInteraction.start;
          const delta = mouseDragTimelinePos - overlayInteraction.pointerStart;
          const nextStart = Math.max(
            0,
            Math.min(
              overlayInteraction.start + delta,
              fileDurationNonZero - duration,
            ),
          );
          return {
            ...clip,
            start: nextStart,
            end: nextStart + duration,
          };
        }

        const delta = mouseDragTimelinePos - overlayInteraction.pointerStart;
        return {
          ...clip,
          end: Math.min(fileDurationNonZero, Math.max(overlayInteraction.end + delta, overlayInteraction.start + minTextOverlayDuration)),
        };
      });
    }

    function onMouseUp() {
      overlayInteractionRef.current = undefined;
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [fileDurationNonZero, getMouseTimelinePos, onSelectOverlay, onUpdateOverlayClip, seekAbs]);

  const onRetimeHandleMouseDown = useCallback((seg: Omit<StateSegment, 'end'> & { end: number }, index: number) => (event: ReactMouseEvent<HTMLElement>) => {
    const scroller = timelineScrollerRef.current;
    const wrapper = timelineWrapperRef.current;
    if (event.button !== 0 || scroller == null || wrapper == null) return;
    event.preventDefault();
    event.stopPropagation();
    setCurrentSegIndex(index);

    const committedSpeed = getSegmentSpeed(seg);
    const sourceDuration = seg.end - seg.start;
    const dragScaleDuration = timelineMapRef.current.displayDuration;
    const pixelsPerSecond = wrapper.offsetWidth / dragScaleDuration;
    const pointerStart = event.clientX + scroller.scrollLeft;
    let pointerX = event.clientX;
    let nextSpeed = committedSpeed;

    const update = () => {
      const deltaSeconds = (pointerX + scroller.scrollLeft - pointerStart) / pixelsPerSecond;
      nextSpeed = getSpeedForOutputDuration(sourceDuration, (sourceDuration / committedSpeed) + deltaSeconds);
      setRetimeDrag({ segId: seg.segId, speed: nextSpeed, scaleDuration: dragScaleDuration });
    };
    setRetimeDrag({ segId: seg.segId, speed: committedSpeed, scaleDuration: dragScaleDuration });

    // Holding the cursor near (or past) either edge scrolls the timeline so the drag can continue.
    let frame = requestAnimationFrame(function autoScroll() {
      const rect = scroller.getBoundingClientRect();
      const edge = 40;
      const overshoot = pointerX > rect.right - edge ? pointerX - (rect.right - edge) : Math.min(0, pointerX - (rect.left + edge));
      if (overshoot !== 0) {
        const before = scroller.scrollLeft;
        scroller.scrollLeft += Math.max(-30, Math.min(30, overshoot / 2));
        if (scroller.scrollLeft !== before) update();
      }
      frame = requestAnimationFrame(autoScroll);
    });

    const listeners = new AbortController();
    // One commit per drag keeps undo to a single step; Escape cancels.
    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      listeners.abort();
      setRetimeDrag(undefined);
      if (commit && nextSpeed !== committedSpeed) onChangeSegmentSpeed(seg.segId, nextSpeed);
    };
    window.addEventListener('mousemove', (moveEvent) => {
      pointerX = moveEvent.clientX;
      update();
    }, { signal: listeners.signal });
    window.addEventListener('mouseup', () => finish(true), { signal: listeners.signal });
    window.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.stopPropagation();
      finish(false);
    }, { capture: true, signal: listeners.signal });
  }, [onChangeSegmentSpeed, setCurrentSegIndex]);

  const onOverlayContextMenu = useCallback((overlayClip: OverlayClip) => (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectOverlay(overlayClip.overlayId);
    const menu = Menu.buildFromTemplate([
      {
        label: t('Delete text clip'),
        click: () => onDeleteOverlayClip(overlayClip.overlayId),
      },
    ]);
    menu.popup({ window: remote.getCurrentWindow() });
  }, [onDeleteOverlayClip, onSelectOverlay, t]);

  const timeRef = useRef<HTMLDivElement>(null);
  const timeFadeTimeoutRef = useRef<NodeJS.Timeout>();

  const onMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    // need to manually check, because we cannot use css :hover when pointer-events: none
    // and we need pointer-events: none on time because we want to be able to click through it to segments behind (and they are not parent)
    const rect = timeRef.current?.getBoundingClientRect();
    const isInBounds = rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    const showHide = (show: boolean) => timeRef.current?.style.setProperty('opacity', show ? '0.2' : '1');
    if (isInBounds != null) showHide(isInBounds);
    // console.log('isInBounds', isInBounds);

    // https://github.com/mifi/lossless-cut/issues/2592#issuecomment-3476211496
    if (timeFadeTimeoutRef.current) clearTimeout(timeFadeTimeoutRef.current);
    timeFadeTimeoutRef.current = setTimeout(() => showHide(false), 1000);

    if (!mouseDownRef.current) { // no button pressed
      setHoveringTime(getMouseTimelinePos(e.nativeEvent));
    }
    e.preventDefault();
  }, [getMouseTimelinePos]);

  const onMouseOut = useCallback(() => setHoveringTime(undefined), []);

  const contextMenuTemplate = useMemo(() => [
    { label: t('Seek to timecode'), click: goToTimecode },
  ], [goToTimecode, t]);

  useContextMenu(timelineScrollerRef, contextMenuTemplate);

  const onGenerateOverviewWaveformClick2 = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
    e.preventDefault(); // todo this doesn't work. dunno why
    onGenerateOverviewWaveformClick();
  }, [onGenerateOverviewWaveformClick]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/mouse-events-have-key-events
    <div
      style={{ position: 'relative', borderTop: '1px solid var(--gray-7)', borderBottom: '1px solid var(--gray-7)' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
      onMouseOut={onMouseOut}
    >
      {(waveformEnabled && !shouldShowWaveform) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: timelineHeight, bottom: timelineHeight, left: 0, right: 0, color: 'var(--gray-11)' }}>
          {t('Zoom in more to view waveform')}
          <Button onClick={onGenerateOverviewWaveformClick2} style={{ marginLeft: '.5em' }}>{t('Load overview')}</Button>
        </div>
      )}

      <div
        style={{ overflowX: 'scroll', overflowY: 'hidden' }}
        className="hide-scrollbar"
        onWheel={onWheel}
        onScroll={onTimelineScroll}
        ref={timelineScrollerRef}
      >
        {waveformEnabled && shouldShowWaveform && (waveforms.length > 0 || overviewWaveform != null) && (
          <Waveforms
            timelineMap={timelineMap}
            laneDuration={laneDuration}
            laneWidthPercent={laneWidthPercent}
            fileDurationNonZero={fileDurationNonZero}
            waveforms={waveforms}
            overviewWaveform={overviewWaveform}
            zoom={zoom}
            darkMode={darkMode}
            height={waveformHeight}
          />
        )}

        {showThumbnails && (
          <div style={{ height: 60, width: `${laneWidthPercent}%`, position: 'relative', marginBottom: 3 }}>
            {thumbnails.map((thumbnail, i) => {
              const leftPercent = toLanePercent(thumbnail.time);
              const nextThumbnail = thumbnails[i + 1];
              const nextThumbTime = nextThumbnail ? nextThumbnail.time : fileDurationNonZero;
              const maxWidthPercent = (toLanePercent(nextThumbTime) - leftPercent) * 0.9;
              return (
                <img key={thumbnail.url} src={thumbnail.url} alt="" style={{ position: 'absolute', left: `${leftPercent}%`, height: '100%', boxSizing: 'border-box', maxWidth: `${maxWidthPercent}%`, objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.5)', borderBottomRightRadius: 15, borderTopLeftRadius: 15, borderTopRightRadius: 15, pointerEvents: 'none' }} />
              );
            })}
          </div>
        )}

        {overlayClips.length > 0 && (
          <div style={{ height: textLaneHeight, width: `${laneWidthPercent}%`, position: 'relative', backgroundColor: 'var(--gray-3)', borderTop: '1px solid var(--gray-7)' }}>
            <div style={laneLabelStyle}>Text</div>

            {overlayClips.map((overlayClip) => {
              const left = calculateTimelinePercent(overlayClip.start);
              const width = `${Math.max(toLanePercent(overlayClip.end) - toLanePercent(overlayClip.start), 0.5)}%`;
              const selected = overlayClip.overlayId === selectedOverlayId;
              const deleteHovered = hoveredDeleteOverlayId === overlayClip.overlayId;

              return (
                <div
                  key={overlayClip.overlayId}
                  role="button"
                  tabIndex={-1}
                  onMouseDown={onOverlayMouseDown(overlayClip, 'move')}
                  onContextMenu={onOverlayContextMenu(overlayClip)}
                  style={{
                    position: 'absolute',
                    left,
                    width,
                    top: 3,
                    bottom: 3,
                    background: selected ? 'rgba(76, 191, 255, 0.22)' : 'rgba(255, 255, 255, 0.12)',
                    border: selected ? '1px solid rgba(76, 191, 255, 0.92)' : '1px solid rgba(255, 255, 255, 0.22)',
                    borderRadius: 6,
                    color: 'var(--gray-12)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    cursor: 'grab',
                    boxShadow: selected ? '0 0 0 1px rgba(76, 191, 255, 0.18), 0 8px 18px rgba(12, 18, 26, 0.18)' : undefined,
                  }}
                >
                  <button
                    type="button"
                    onMouseDown={onOverlayMouseDown(overlayClip, 'start')}
                    style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 14, cursor: 'ew-resize', border: 'none', background: selected ? 'linear-gradient(90deg, rgba(76, 191, 255, 0.24), transparent)' : 'transparent' }}
                  />
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none', margin: selected ? '0 36px 0 10px' : '0 10px', width: '100%', fontWeight: selected ? 700 : 600 }}>{overlayClip.text || 'Text'}</div>
                  {selected && (
                    <button
                      type="button"
                      title={t('Delete text clip')}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteOverlayClip(overlayClip.overlayId);
                      }}
                      onMouseEnter={() => setHoveredDeleteOverlayId(overlayClip.overlayId)}
                      onMouseLeave={() => setHoveredDeleteOverlayId((current) => (current === overlayClip.overlayId ? undefined : current))}
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 999, border: `1px solid ${deleteHovered ? 'rgba(255, 94, 94, 0.78)' : 'rgba(255, 255, 255, 0.16)'}`, background: deleteHovered ? 'rgba(184, 36, 36, 0.88)' : 'rgba(10, 14, 22, 0.58)', color: deleteHovered ? 'white' : 'rgba(255, 255, 255, 0.88)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease' }}
                    >
                      <FaTimes size={8} />
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={onOverlayMouseDown(overlayClip, 'end')}
                    style={{ position: 'absolute', right: -4, top: 0, bottom: 0, width: 14, cursor: 'ew-resize', border: 'none', background: selected ? 'linear-gradient(270deg, rgba(76, 191, 255, 0.24), transparent)' : 'transparent' }}
                  />
                </div>
              );
            })}

            {currentTimePercent !== undefined && (
              <motion.div transition={springAnimation} animate={{ left: currentTimePercent }} style={{ position: 'absolute', bottom: 0, top: 0, backgroundColor: 'var(--gray-12)', width: currentTimeWidth, pointerEvents: 'none' }} />
            )}
            {commandedTimePercent !== undefined && (
              <CommandedTime commandedTimePercent={commandedTimePercent} />
            )}
          </div>
        )}

        {retimeSegments.length > 0 && (
          <div style={{ height: retimeLaneHeight, width: `${laneWidthPercent}%`, position: 'relative', isolation: 'isolate', overflow: 'hidden', backgroundColor: 'var(--gray-2)', borderTop: '1px solid var(--gray-7)' }}>
            <div style={laneLabelStyle}>Speed</div>

            {retimeSegments.map(({ seg, index }) => {
              const left = toLanePercent(seg.start);
              const dragging = retimeDrag?.segId === seg.segId;
              const speed = dragging ? retimeDrag.speed : getSegmentSpeed(seg);
              return (
                <SegmentRetimeBar
                  key={seg.segId}
                  left={`${left}%`}
                  width={`${toLanePercent(seg.end) - left}%`}
                  speed={speed}
                  committedSpeed={getSegmentSpeed(seg)}
                  outputDuration={getSegmentOutputDuration({ ...seg, speed })}
                  isActive={index === currentSegIndexSafe}
                  dragging={dragging}
                  formatTimecode={formatTimecode}
                  onHandleMouseDown={onRetimeHandleMouseDown(seg, index)}
                  onSelect={() => setCurrentSegIndex(index)}
                  onChange={(nextSpeed) => onChangeSegmentSpeed(seg.segId, nextSpeed)}
                  onEdit={() => onEditSegmentSpeed(index)}
                  onHide={() => onToggleSegmentSpeedControls(seg.segId)}
                />
              );
            })}
          </div>
        )}

        <div
          style={{ height: timelineHeight, width: `${laneWidthPercent}%`, position: 'relative', backgroundColor: timelineBackground, transition: darkModeTransition, borderTop: overlayClips.length > 0 ? '1px solid var(--gray-7)' : undefined }}
          ref={timelineWrapperRef}
        >
          <div style={laneLabelStyle}>Video</div>

          {inverseCutSegments.map((seg) => (
            <BetweenSegments
              key={seg.segId}
              left={toLanePercent(seg.start)}
              width={toLanePercent(seg.end) - toLanePercent(seg.start)}
              instant={retimeDragging}
              invertCutSegments={invertCutSegments}
            />
          ))}

          {cutSegments.map((seg, i) => {
            const selected = invertCutSegments || seg.selected;

            return (
              <TimelineSeg
                key={seg.segId}
                seg={seg}
                segNum={i}
                onSegClick={setCurrentSegIndex}
                isActive={i === currentSegIndexSafe}
                toLanePercent={toLanePercent}
                instant={retimeDragging}
                invertCutSegments={invertCutSegments}
                formatTimecode={formatTimecode}
                selected={selected}
                speedControlsVisible={speedControlsSegmentIds.has(seg.segId)}
                onEditSpeed={onEditSegmentSpeed}
                onChangeSpeed={onChangeSegmentSpeed}
                onToggleSpeedControls={onToggleSegmentSpeedControls}
                onEditCrop={onEditSegmentCrop}
              />
            );
          })}

          {shouldShowKeyframes && !areKeyframesTooClose && keyFramesInZoomWindow.map((f) => (
            <div key={f.time} style={{ position: 'absolute', top: 0, bottom: 0, left: `${toLanePercent(f.time)}%`, marginLeft: -1, width: 1, background: 'var(--gray-10)', pointerEvents: 'none' }} />
          ))}

          {currentTimePercent !== undefined && (
            <motion.div transition={springAnimation} animate={{ left: currentTimePercent }} style={{ position: 'absolute', bottom: 0, top: 0, backgroundColor: 'var(--gray-12)', width: currentTimeWidth, pointerEvents: 'none' }} />
          )}
          {commandedTimePercent !== undefined && (
            <CommandedTime commandedTimePercent={commandedTimePercent} />
          )}
        </div>
      </div>

      <div style={timeWrapperStyle} className={styles['time-wrapper']}>
        <div className={styles['time']} ref={timeRef}>
          {formatTimeAndFrames(displayTime)}{isZoomed ? ` ${displayTimePercent}` : ''}
        </div>
      </div>
    </div>
  );
}

export default memo(Timeline);
