import type { MutableRefObject, CSSProperties, ReactNode, WheelEventHandler, MouseEventHandler, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useRef, useMemo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useMotionValue, useSpring } from 'motion/react';
import debounce from 'lodash/debounce';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';

import TimelineSeg from './TimelineSeg';
import BetweenSegments from './BetweenSegments';
import useContextMenu from './hooks/useContextMenu';
import { openMenu } from './components/Menu';
import useUserSettings from './hooks/useUserSettings';

import styles from './Timeline.module.css';


import { darkModeTransition } from './colors';
import type { Frame } from './ffmpeg';
import type { FormatTimecode, InverseCutSegment, OverviewWaveform, OverlayClip, RenderableWaveform, WaveformSlice, StateSegment, Thumbnail } from './types';
import Button from './components/Button';
import type { UseSegments } from './hooks/useSegments';
import { keyMap } from './hooks/useTimelineScroll';
import { getTextLaneRows, minTextOverlayDuration } from './textOverlays';
import type { TextLaneRow } from './textOverlays';
import SegmentRetimeBar from './components/SegmentRetimeBar';
import LaneDeleteButton from './components/LaneDeleteButton';
import TimelineRuler, { createHoverStore, HoverMarker } from './components/TimelineRuler';
import formatClockTime from './util/clockTime';
import { getSegmentOutputDuration, getSegmentSpeed, getSpeedForOutputDuration } from './segmentSpeed';
import { createTimelineMap, getMaxScale, getRetimeAutoScrollStep, getWarpedImageSpans } from './timelineMap';
import type { TimelineMap } from './timelineMap';
import { fadeInArrivingFrame, filmTileHeight, getFilmTileSlots, getFilmTiles } from './filmstrip';
import type { FilmTile } from './filmstrip';
import type { Filmstrip } from './hooks/useFilmstrip';
import type { AudioPeaks } from './audioPeaks';
import AudioLane from './components/AudioLane';


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
    // A slice that failed isn't loading: no endless animation (it repaints the lane every frame).
    if (waveform.url == null) return <div key={span.left} style={spanStyle} className={'failed' in waveform && waveform.failed ? undefined : styles['loading-bg']} />;
    return (
      <div key={span.left} style={spanStyle}>
        <img src={waveform.url} draggable={false} alt="" style={{ position: 'absolute', height: '100%', left: `${span.innerLeft}%`, width: `${span.innerWidth}%`, filter: darkMode ? undefined : 'invert(1)', imageRendering: 'pixelated' }} />
      </div>
    );
  });
});

// eslint-disable-next-line react/display-name
const Waveforms = memo(({ timelineMap, laneDuration, fileDurationNonZero, waveforms, overviewWaveform, zoom, darkMode, height }: {
  timelineMap: TimelineMap,
  laneDuration: number,
  fileDurationNonZero: number,
  waveforms: WaveformSlice[],
  overviewWaveform: OverviewWaveform | undefined,
  zoom: number,
  darkMode: boolean,
  height: number,
}) => (
  <div style={{ height, width: '100%', position: 'relative' }}>
    {zoom === 1 && overviewWaveform != null ? (
      <Waveform waveform={overviewWaveform} timelineMap={timelineMap} laneDuration={laneDuration} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ) : waveforms.map((waveform) => (
      <Waveform key={`${waveform.from}-${waveform.to}`} waveform={waveform} timelineMap={timelineMap} laneDuration={laneDuration} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ))}
  </div>
));

const fadeInFilmTile = fadeInArrivingFrame(styles['arriving']!);

/** The whole recording as a dimmed, hatched strip of frames behind the clip blocks (simple mode). */
// eslint-disable-next-line react/display-name
const FilmTape = memo(({ tiles, loading }: { tiles: readonly FilmTile[], loading: boolean }) => (
  <div className={styles['filmTape']} aria-hidden>
    <div className={styles['filmFrames']}>
      {tiles.map((tile) => tile.url != null && <img key={tile.left} ref={loading ? fadeInFilmTile : undefined} src={tile.url} alt="" draggable={false} style={{ left: tile.left, width: tile.width }} />)}
    </div>
  </div>
));

/**
 * The one playhead. Paused, it sits at the time the user asked for. While playing, it follows the video on
 * every display frame, written straight to the element (no React render, no easing), so it moves smoothly
 * rather than in steps each time the video reports its position (about 4 times a second).
 */
function Playhead({ playing, commandedTime, getCurrentTime, calculateTimelinePos, lanePx }: {
  playing: boolean,
  commandedTime: number,
  getCurrentTime: () => number,
  calculateTimelinePos: (time: number | undefined) => number | undefined,
  /** The lane's width: the playhead moves with a transform (no layout or repaint of the lanes each frame). */
  lanePx: number,
}) {
  const ref = useRef<HTMLDivElement>(null);
  const calculateTimelinePosRef = useRef(calculateTimelinePos);
  const lanePxRef = useRef(lanePx);

  useLayoutEffect(() => {
    calculateTimelinePosRef.current = calculateTimelinePos;
    lanePxRef.current = lanePx;
    const el = ref.current;
    if (el == null) return;
    const pos = calculateTimelinePos(playing ? getCurrentTime() : commandedTime);
    el.style.transform = `translateX(${(pos ?? 0) * lanePx}px)`;
  }, [calculateTimelinePos, commandedTime, getCurrentTime, lanePx, playing]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = requestAnimationFrame(function follow() {
      const el = ref.current;
      if (el != null) {
        const pos = calculateTimelinePosRef.current(getCurrentTime());
        if (pos != null) el.style.transform = `translateX(${pos * lanePxRef.current}px)`;
      }
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [getCurrentTime, playing]);

  return (
    <div ref={ref} className={styles['playhead']}>
      <div className={styles['playheadHandle']} />
    </div>
  );
}

const rulerHeight = 22;
const clipLaneHeight = 44;
/** Simple mode's clips lane is taller: it shows the filmstrip and holds the speed band, so speed controls don't add a lane. */
const simpleClipLaneHeight = 64;
const audioLaneHeight = 34;
const textLaneHeight = 28;
const retimeLaneHeight = 38;
const thumbnailsHeight = 63;
/** Extra lane space (fraction of the visible width) kept past the end while retiming. */
const retimeTrailingSpace = 0.15;
/**
 * The widest the lane gets. Chromium lays out at most 2^25 px, so a wider lane (a wide window at the deepest zoom)
 * would put what's placed in percent (clips) and what's drawn in pixels (playhead, filmstrip) apart.
 */
const maxLanePx = 2 ** 24;
/**
 * Texts that share their time split the text lane into (at most two, see getTextLaneRows) rows of 11px; the
 * lane keeps its height (so the preview keeps its size).
 */
const stackedTextInset = 2;
const stackedTextGap = 1;

function getStackedTextGeometry({ row, rows }: TextLaneRow) {
  // The lane's top border takes a pixel.
  const height = (textLaneHeight - 1 - (2 * stackedTextInset) - ((rows - 1) * stackedTextGap)) / rows;
  return { top: stackedTextInset + (row * (height + stackedTextGap)), height };
}

/**
 * The speed band's inset from its clip's edges. It clears TimelineSeg's 10px trim handles, so pressing a selected
 * clip's edge always trims. Every band has it, selected clip or not: pressing a band selects its clip, and the
 * band mustn't then move under the cursor.
 */
const retimeOverlayInset = 12;

function Timeline({
  fileDurationNonZero,
  startTimeOffset,
  getCurrentTime,
  onScrubbingChange,
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
  filmstrip,
  audioPeaks,
  audioTrackGainDb,
  showAudioLane,
  audioHeader,
  onEditClipVolume,
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
  setCutStart,
  setCutEnd,
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
  onRemoveSegmentSpeed,
  onRemoveSegment,
  removeSegmentKeys,
  pickedClipIds,
  hasVideo,
} : {
  fileDurationNonZero: number,
  startTimeOffset: number,
  /** The video's position while playing, the asked-for time otherwise. Read every frame, without re-rendering. */
  getCurrentTime: () => number,
  /** Dragging along the timeline starts and ends a scrub: playback pauses during it and resumes after. */
  onScrubbingChange: (scrubbing: boolean) => void,
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
  /** Simple mode: frames of the whole recording for the clips lane. */
  filmstrip: Filmstrip,
  /** Simple mode's audio track under the clips. */
  audioPeaks: AudioPeaks | undefined,
  /** The drawn track's volume, which scales its waveform. */
  audioTrackGainDb: number | undefined,
  showAudioLane: boolean,
  audioHeader: ReactNode,
  /** Opens a clip's volume popover at a point (right-click on the audio track, or the clip's menu). */
  onEditClipVolume?: ((index: number, point: { x: number, y: number }) => void) | undefined,
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
  setCutStart: () => void,
  setCutEnd: () => void,
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
  onRemoveSegmentSpeed: (segmentId: string) => void,
  /** Simple mode's clip-block menu: split a clip at the playhead, duplicate it, remove it. */
  onRemoveSegment?: ((index: number, wholeSegment?: true) => void) | undefined,
  /** The keys that remove the selected clip, shown in the clip menu. */
  removeSegmentKeys?: string | undefined,
  /** Clips picked in the Clips panel for Delete. */
  pickedClipIds?: readonly string[] | undefined,
  /** Media with video can have text: its lane is then always shown, so adding text doesn't resize the preview. */
  hasVideo: boolean,
}) {
  const { t } = useTranslation();

  const { invertCutSegments, segmentMouseModifierKey, simpleMode } = useUserSettings();

  const timelineScrollerRef = useRef<HTMLDivElement>(null);
  const timelineScrollerSkipEventRef = useRef<boolean>(false);
  const timelineScrollerSkipEventDebounce = useRef<() => void>();
  const timelineWrapperRef = useRef<HTMLDivElement>(null);

  // The time under the mouse, outside React state: hovering re-renders only the marker, not the timeline.
  const [hoverStore] = useState(createHoverStore);


  const isZoomed = zoom > 1;

  const zoomWindowLength = zoomWindowEndTime != null ? zoomWindowEndTime - zoomWindowStartTime : undefined;


  const retimeSegments = useMemo(() => cutSegments.flatMap((seg, index) => (
    seg.end != null && speedControlsSegmentIds.has(seg.segId) ? [{ seg: { ...seg, end: seg.end }, index }] : []
  )), [cutSegments, speedControlsSegmentIds]);

  // The live speed of the segment being retimed, plus the timeline length when the drag began.
  const [retimeDrag, setRetimeDrag] = useState<{ segId: string, speed: number, scaleDuration: number }>();
  // A clip edge being dragged follows the cursor exactly, rather than springing after it.
  const [segmentDragging, setSegmentDragging] = useState(false);

  // The text being dragged, and the text lane's rows when the drag began: the other texts keep theirs meanwhile.
  const [textDrag, setTextDrag] = useState<{ overlayId: string, rows: ReadonlyMap<string, TextLaneRow> }>();
  const textLaneRows = useMemo(() => getTextLaneRows(overlayClips, textDrag), [overlayClips, textDrag]);
  const textLaneRowsRef = useRef(textLaneRows);
  useEffect(() => {
    textLaneRowsRef.current = textLaneRows;
  }, [textLaneRows]);

  // Only clips at another speed shape the map: keyed on them, so a plain trim or edit keeps the same map (and the
  // same toLanePercent), and the other clips, the filmstrip and the ruler don't re-render.
  const retimedSegments = (retimeDrag == null ? cutSegments : cutSegments.map((seg) => (seg.segId === retimeDrag.segId ? { ...seg, speed: retimeDrag.speed } : seg)))
    .filter((seg) => seg.end != null && seg.end > seg.start && (seg.speed ?? 1) !== 1);
  const retimedKey = invertCutSegments ? '' : retimedSegments.map((seg) => `${seg.start}:${seg.end}:${seg.speed}`).join('|');
  const timelineMap = useMemo(
    () => createTimelineMap(invertCutSegments ? [] : retimedSegments, fileDurationNonZero),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [retimedKey, fileDurationNonZero, invertCutSegments],
  );

  // While retiming, the pixel scale stays fixed so the edge tracks the cursor: lanes grow or
  // shrink and scroll (with room to keep dragging) instead of the whole timeline refitting.
  const scaleDuration = retimeDrag?.scaleDuration ?? timelineMap.displayDuration;
  const [scrollerWidth, setScrollerWidth] = useState(0);
  const laneZoom = scrollerWidth > 0 ? Math.min(zoom, maxLanePx / scrollerWidth) : zoom;
  const laneDuration = timelineMap.displayDuration + (retimeDrag != null ? (scaleDuration / laneZoom) * retimeTrailingSpace : 0);
  const laneWidthPercent = laneZoom * 100 * (laneDuration / scaleDuration);

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
      const zoomedTargetWidth = timelineScrollerRef.current.offsetWidth * laneZoom;

      const map = timelineMapRef.current;
      const scrollLeft = Math.max((map.toDisplay(commandedTimeRef.current) / map.displayDuration) * zoomedTargetWidth - timelineScrollerRef.current.offsetWidth / 2, 0);
      scrollLeftMotion.set(scrollLeft);
      timelineScrollerRef.current.scrollLeft = scrollLeft;
    }
  }, [laneZoom, commandedTimeRef, scrollLeftMotion, isZoomed]);


  useEffect(() => {
    const cancelWheel = (event: WheelEvent) => event.preventDefault();

    const scroller = timelineScrollerRef.current;
    invariant(scroller != null);
    scroller.addEventListener('wheel', cancelWheel, { passive: false });

    return () => {
      scroller.removeEventListener('wheel', cancelWheel);
    };
  }, []);

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    invariant(scroller != null);
    const observer = new ResizeObserver(() => setScrollerWidth(scroller.offsetWidth));
    observer.observe(scroller);
    setScrollerWidth(scroller.offsetWidth);
    return () => observer.disconnect();
  }, []);

  // The visible start while scrolling is kept here, updated once per frame, and handed to the editor only once
  // scrolling stops (it's only used there for thumbnails): scrolling and auto-pan don't re-render the whole editor.
  const [visibleStart, setVisibleStart] = useState(zoomWindowStartTime);
  const [propStart, setPropStart] = useState(zoomWindowStartTime);
  if (zoomWindowStartTime !== propStart) {
    // The editor moved it (e.g. a new file): follow.
    setPropStart(zoomWindowStartTime);
    setVisibleStart(zoomWindowStartTime);
  }
  const scrollFrameRef = useRef(0);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => {
    cancelAnimationFrame(scrollFrameRef.current);
    clearTimeout(reportTimerRef.current);
  }, []);
  const onTimelineScroll = useCallback(() => {
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      const start = calcZoomWindowStartTime();
      setVisibleStart(start);
      clearTimeout(reportTimerRef.current);
      reportTimerRef.current = setTimeout(() => onZoomWindowStartTimeChange(start), 250);
    });
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
    hoverStore.set(undefined);
  }, [hoverStore, relevantTime]);

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
      if (resizingSegmentRef.current != null) setSegmentDragging(true);
    }

    mouseDownRef.current = e.target;
    let scrubbing = false;

    function onMouseMove(e2: MouseEvent) {
      if (mouseDownRef.current == null) return;
      if (!scrubbing) {
        scrubbing = true;
        onScrubbingChange(true);
      }
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
      setSegmentDragging(false);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      if (scrubbing) onScrubbingChange(false);
    }

    // https://github.com/mifi/lossless-cut/issues/1432
    // https://stackoverflow.com/questions/11533098/how-to-catch-mouse-up-event-outside-of-element
    // https://stackoverflow.com/questions/6073505/what-is-the-difference-between-screenx-y-clientx-y-and-pagex-y
    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [fileDurationNonZero, getMouseTimelinePos, onScrubbingChange, seekAbs, segmentMouseModifierKey, setCutTime, zoom]);

  // Simple mode: drag an edge handle of the active clip to trim it (no modifier key needed).
  const onTrimHandleMouseDown = useCallback((edge: 'start' | 'end') => (e: ReactMouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // eslint-disable-next-line no-shadow
    const currentCutSeg = currentCutSegRef.current;
    if (currentCutSeg == null) return;
    seekAbs(edge === 'start' ? currentCutSeg.start : (currentCutSeg.end ?? currentCutSeg.start));
    resizingSegmentRef.current = { operation: edge };
    setSegmentDragging(true);
    mouseDownRef.current = e.target;
    let scrubbing = false;

    function onMouseMove(e2: MouseEvent) {
      if (!scrubbing) {
        scrubbing = true;
        onScrubbingChange(true);
      }
      const time = getMouseTimelinePos(e2);
      seekAbs(time);
      try {
        setCutTime(edge, time);
      } catch (err) {
        console.warn('Error while trimming clip:', err instanceof Error ? err.message : err);
      }
    }

    function onMouseUp() {
      mouseDownRef.current = undefined;
      resizingSegmentRef.current = undefined;
      setSegmentDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      if (scrubbing) onScrubbingChange(false);
    }

    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [getMouseTimelinePos, onScrubbingChange, seekAbs, setCutTime]);

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
    let scrubbing = false;

    function onMouseMove(e2: MouseEvent) {
      const overlayInteraction = overlayInteractionRef.current;
      if (overlayInteraction == null) return;
      if (!scrubbing) {
        scrubbing = true;
        onScrubbingChange(true);
        setTextDrag({ overlayId: overlayClip.overlayId, rows: textLaneRowsRef.current });
      }
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
      if (scrubbing) {
        onScrubbingChange(false);
        setTextDrag(undefined);
      }
    }

    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [fileDurationNonZero, getMouseTimelinePos, onScrubbingChange, onSelectOverlay, onUpdateOverlayClip, seekAbs]);

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
    const startX = event.clientX;
    let pointerX = event.clientX;
    let nextSpeed = committedSpeed;

    const update = () => {
      const deltaSeconds = (pointerX + scroller.scrollLeft - pointerStart) / pixelsPerSecond;
      nextSpeed = getSpeedForOutputDuration(sourceDuration, (sourceDuration / committedSpeed) + deltaSeconds);
      setRetimeDrag({ segId: seg.segId, speed: nextSpeed, scaleDuration: dragScaleDuration });
    };
    setRetimeDrag({ segId: seg.segId, speed: committedSpeed, scaleDuration: dragScaleDuration });

    // Dragging toward (or past) either edge scrolls the timeline so the drag can continue.
    let frame = requestAnimationFrame(function autoScroll() {
      const rect = scroller.getBoundingClientRect();
      const step = getRetimeAutoScrollStep({ pointerX, startX, left: rect.left, right: rect.right });
      if (step !== 0) {
        const before = scroller.scrollLeft;
        scroller.scrollLeft += step;
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
    openMenu({
      at: { x: event.clientX, y: event.clientY },
      items: [{
        // In simple mode a "clip" is a part of the recording; the lane just says "Text".
        label: simpleMode ? t('Delete text') : t('Delete text clip'),
        click: () => onDeleteOverlayClip(overlayClip.overlayId),
      }],
    });
  }, [onDeleteOverlayClip, onSelectOverlay, simpleMode, t]);

  const onMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    if (!mouseDownRef.current) { // no button pressed
      hoverStore.set(getMouseTimelinePos(e.nativeEvent));
    }
    e.preventDefault();
  }, [getMouseTimelinePos, hoverStore]);

  const onMouseOut = useCallback(() => hoverStore.set(undefined), [hoverStore]);

  const contextMenuTemplate = useMemo(() => [
    { label: simpleMode ? t('Start a clip at the playhead') : t('Start current segment at current time'), click: setCutStart },
    { label: simpleMode ? t('End the clip at the playhead') : t('End current segment at current time'), click: setCutEnd },
    { type: 'separator' as const },
    { label: simpleMode ? t('Go to a time…') : t('Seek to timecode'), click: goToTimecode },
  ], [goToTimecode, setCutEnd, setCutStart, simpleMode, t]);

  useContextMenu(timelineScrollerRef, contextMenuTemplate);

  const onGenerateOverviewWaveformClick2 = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
    e.preventDefault(); // todo this doesn't work. dunno why
    onGenerateOverviewWaveformClick();
  }, [onGenerateOverviewWaveformClick]);

  const showTextLane = hasVideo || overlayClips.length > 0;
  const noneTicked = cutSegments.some((seg) => seg.end != null) && cutSegments.every((seg) => seg.end == null || !seg.selected);
  // The waveform lane keeps its height whether it shows the waveform or the "zoom in" hint, so zooming
  // doesn't resize the preview.
  // (Simple mode has its own audio track under the clips instead.)
  const showWaveformLane = waveformEnabled && !simpleMode;
  const showWaveformHint = showWaveformLane && !shouldShowWaveform;
  const showWaveforms = showWaveformLane && shouldShowWaveform && (waveforms.length > 0 || overviewWaveform != null);
  // Simple mode draws speed controls on the clip block itself rather than in a lane of their own.
  const retimeOverlay = simpleMode;
  const showRetimeLane = !retimeOverlay && retimeSegments.length > 0;
  const lanePx = scrollerWidth * (laneWidthPercent / 100);
  const keyFramesInZoomWindow = useMemo(() => (zoomWindowLength == null ? [] : neighbouringKeyFrames.filter((f) => f.time >= visibleStart && f.time <= visibleStart + zoomWindowLength)), [neighbouringKeyFrames, visibleStart, zoomWindowLength]);
  // Don't show keyframes if too packed together (at current zoom)
  // See https://github.com/mifi/lossless-cut/issues/259
  const areKeyframesTooClose = keyFramesInZoomWindow.length > zoom * 200;
  const pxToTime = useCallback((px: number) => timelineMap.toSource((px / Math.max(lanePx, 1)) * laneDuration), [laneDuration, lanePx, timelineMap]);
  // The visible stretch of the lane, in source time. Retimed clips stretch or squeeze the lane, so
  // this is mapped from lane time rather than taken as a fixed share of the file.
  const visibleEnd = lanePx > 0
    ? timelineMap.toSource(Math.min(laneDuration, timelineMap.toDisplay(visibleStart) + (scrollerWidth / lanePx) * laneDuration))
    : (zoomWindowEndTime ?? fileDurationNonZero);

  // Simple mode's filmstrip: tiles of the video's shape at the clip blocks' height, side by side, made only for
  // the visible stretch and a few tiles either side (in steps of 8 tiles, so scrolling re-renders them rarely).
  const showFilm = simpleMode && !invertCutSegments;
  const filmTileWidth = filmTileHeight * (filmstrip.aspect ?? 16 / 9);
  const filmStepPx = filmTileWidth * 8;
  const visibleStartPx = (toLanePercent(visibleStart) / 100) * lanePx;
  const filmFromPx = (Math.floor(visibleStartPx / filmStepPx) - 1) * filmStepPx;
  const filmToPx = (Math.ceil((visibleStartPx + scrollerWidth) / filmStepPx) + 1) * filmStepPx;
  const filmTiles = useMemo(() => (showFilm && filmstrip.frames.length > 0
    ? getFilmTiles({ frames: filmstrip.frames, covered: filmstrip.covered, tileWidth: filmTileWidth, fromPx: filmFromPx, toPx: filmToPx, lanePx, pxToTime })
    : []), [filmFromPx, filmTileWidth, filmToPx, filmstrip.covered, filmstrip.frames, lanePx, pxToTime, showFilm]);
  // The filmstrip does what's in view first, and makes denser frames when zoomed in past its own: as dense as the
  // most stretched part of the view needs (a slowed clip's tiles each span less of the recording).
  const { setView: setFilmstripView } = filmstrip;
  const filmTileSeconds = lanePx > 0 ? ((laneDuration / lanePx) * filmTileWidth) / getMaxScale(timelineMap, visibleStart, visibleEnd) : 0;
  useEffect(() => {
    if (!showFilm || !(filmTileSeconds > 0) || !(visibleEnd > visibleStart)) return;
    const tileTimes = getFilmTileSlots({ tileWidth: filmTileWidth, fromPx: visibleStartPx, toPx: visibleStartPx + scrollerWidth, lanePx, pxToTime }).map((slot) => slot.time);
    setFilmstripView({ from: visibleStart, to: visibleEnd, tileSeconds: filmTileSeconds, tileTimes });
  }, [filmTileSeconds, filmTileWidth, lanePx, pxToTime, scrollerWidth, setFilmstripView, showFilm, visibleEnd, visibleStart, visibleStartPx]);

  const formatHoverLabel = useCallback((hoverTime: number) => {
    const time = hoverTime + startTimeOffset;
    return simpleMode ? formatClockTime(time, { decimals: 2, showHours: fileDurationNonZero >= 3600 }) : formatTimeAndFrames(time);
  }, [fileDurationNonZero, formatTimeAndFrames, simpleMode, startTimeOffset]);
  const hoverMarker = useMemo(() => (
    <HoverMarker store={hoverStore} visible={isFileOpened && !playing} toLanePercent={toLanePercent} formatLabel={formatHoverLabel} />
  ), [formatHoverLabel, hoverStore, isFileOpened, playing, toLanePercent]);

  return (
    <div className={styles['timeline']}>
      {/* The lane labels are decoration; the audio track's controls are real buttons, so only the labels are hidden. */}
      <div className={styles['gutter']}>
        <div style={{ height: rulerHeight }} aria-hidden />
        {showWaveformLane && <div className={styles['laneLabel']} style={{ height: waveformHeight }} aria-hidden>{t('Audio')}</div>}
        {showThumbnails && <div style={{ height: thumbnailsHeight }} aria-hidden />}
        {showTextLane && <div className={styles['laneLabel']} style={{ height: textLaneHeight }} aria-hidden>{t('Text')}</div>}
        {showRetimeLane && <div className={styles['laneLabel']} style={{ height: retimeLaneHeight }} aria-hidden>{t('Speed')}</div>}
        <div className={styles['laneLabel']} style={{ height: simpleMode ? simpleClipLaneHeight : clipLaneHeight }} aria-hidden>{simpleMode ? t('Clips') : t('Segments')}</div>
        {showAudioLane && <div style={{ height: audioLaneHeight, display: 'flex', flexDirection: 'column' }}>{audioHeader}</div>}
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/mouse-events-have-key-events */}
      <div
        className={styles['tracks']}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
        onMouseOut={onMouseOut}
      >
        <div
          // Sized by the window, never by the (zoomed, many times wider) lane inside it.
          style={{ overflowX: 'scroll', overflowY: 'hidden', contain: 'inline-size' }}
          className="hide-scrollbar"
          onWheel={onWheel}
          onScroll={onTimelineScroll}
          ref={timelineScrollerRef}
        >
          {/* In pixels once the scroller's width is known (offsetWidth, rounded), so what's placed in percent (clips,
              ruler, texts) and what's placed in pixels (playhead, filmstrip tiles, audio track) agree: far zoomed in,
              the scroller's fraction of a pixel put them hundreds of pixels apart. */}
          <div style={{ width: scrollerWidth > 0 ? lanePx : `${laneWidthPercent}%`, position: 'relative' }}>
            <TimelineRuler
              toLanePercent={toLanePercent}
              lanePx={lanePx}
              laneDuration={laneDuration}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              fileDuration={fileDurationNonZero}
              height={rulerHeight}
            >
              {hoverMarker}
            </TimelineRuler>

            {showWaveformHint && (
              <div className={styles['waveformHint']} style={{ height: waveformHeight }}>
                {t('Zoom in more to view waveform')}
                <Button size="sm" onClick={onGenerateOverviewWaveformClick2}>{t('Load overview')}</Button>
              </div>
            )}
            {showWaveformLane && !showWaveformHint && !showWaveforms && <div style={{ height: waveformHeight }} className={styles['loading-bg']} />}
            {showWaveforms && (
              <Waveforms
                timelineMap={timelineMap}
                laneDuration={laneDuration}
                fileDurationNonZero={fileDurationNonZero}
                waveforms={waveforms}
                overviewWaveform={overviewWaveform}
                zoom={zoom}
                darkMode={darkMode}
                height={waveformHeight}
              />
            )}

            {showThumbnails && (
              <div style={{ height: thumbnailsHeight - 3, width: '100%', position: 'relative', marginBottom: 3 }}>
                {thumbnails.map((thumbnail, i) => {
                  const leftPercent = toLanePercent(thumbnail.time);
                  const nextThumbnail = thumbnails[i + 1];
                  const nextThumbTime = nextThumbnail ? nextThumbnail.time : fileDurationNonZero;
                  const maxWidthPercent = (toLanePercent(nextThumbTime) - leftPercent) * 0.9;
                  return (
                    <img key={thumbnail.url} src={thumbnail.url} alt="" style={{ position: 'absolute', left: `${leftPercent}%`, height: '100%', boxSizing: 'border-box', maxWidth: `${maxWidthPercent}%`, objectFit: 'cover', borderRadius: 4, pointerEvents: 'none' }} />
                  );
                })}
              </div>
            )}

            {showTextLane && (
              <div className={styles['lane']} style={{ height: textLaneHeight }}>
                {overlayClips.map((overlayClip) => {
                  const left = calculateTimelinePercent(overlayClip.start);
                  const width = `${Math.max(toLanePercent(overlayClip.end) - toLanePercent(overlayClip.start), 0.5)}%`;
                  const selected = overlayClip.overlayId === selectedOverlayId;
                  const laneRow = textLaneRows.get(overlayClip.overlayId);
                  // Sharing its time with other texts: one row of the lane rather than all of it.
                  const stacked = laneRow != null && laneRow.rows > 1 ? getStackedTextGeometry(laneRow) : undefined;
                  const deleteLabel = simpleMode ? t('Delete text') : t('Delete text clip');

                  return (
                    <div
                      key={overlayClip.overlayId}
                      role="button"
                      tabIndex={-1}
                      className={[styles['textClip'], ...(selected ? [styles['textClipSelected']] : []), ...(stacked != null ? [styles['textClipStacked']] : [])].join(' ')}
                      title={overlayClip.text}
                      onMouseDown={onOverlayMouseDown(overlayClip, 'move')}
                      onContextMenuCapture={onOverlayContextMenu(overlayClip)}
                      style={stacked != null ? { left, width, top: stacked.top, bottom: 'auto', height: stacked.height } : { left, width }}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={t('Change when the text starts')}
                        className={[styles['textClipHandle'], styles['textClipHandleStart']].join(' ')}
                        onMouseDown={onOverlayMouseDown(overlayClip, 'start')}
                      />
                      <div className={styles['textClipLabel']} style={{ marginRight: selected ? (stacked != null ? 18 : 28) : 8 }}>{overlayClip.text || t('Text')}</div>
                      {selected && (
                        // A smaller button fits a stacked row.
                        <LaneDeleteButton title={deleteLabel} onDelete={() => onDeleteOverlayClip(overlayClip.overlayId)} style={stacked != null ? { right: 3, width: stacked.height, height: stacked.height } : undefined} />
                      )}
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={t('Change when the text ends')}
                        className={[styles['textClipHandle'], styles['textClipHandleEnd']].join(' ')}
                        onMouseDown={onOverlayMouseDown(overlayClip, 'end')}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {showRetimeLane && (
              <div className={styles['lane']} style={{ height: retimeLaneHeight, isolation: 'isolate', overflow: 'hidden' }}>
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
                      onRemove={() => onRemoveSegmentSpeed(seg.segId)}
                      onHide={() => onToggleSegmentSpeedControls(seg.segId)}
                    />
                  );
                })}
              </div>
            )}

            <div
              className={[styles['lane'], styles['clipLane']].join(' ')}
              style={{ height: simpleMode ? simpleClipLaneHeight : clipLaneHeight, transition: darkModeTransition }}
              ref={timelineWrapperRef}
            >
              {showFilm && filmstrip.frames.length > 0 && <FilmTape tiles={filmTiles} loading={!filmstrip.done} />}

              {inverseCutSegments.map((seg) => (
                <BetweenSegments
                  key={seg.segId}
                  left={toLanePercent(seg.start)}
                  width={toLanePercent(seg.end) - toLanePercent(seg.start)}
                  instant={retimeDragging || segmentDragging}
                  invertCutSegments={invertCutSegments}
                />
              ))}

              {cutSegments.map((seg, i) => {
                // With no clip ticked, the export takes all of them (useSegments).
                const selected = invertCutSegments || seg.selected || noneTicked;

                return (
                  <TimelineSeg
                    key={seg.segId}
                    seg={seg}
                    segNum={i}
                    onSegClick={setCurrentSegIndex}
                    isActive={i === currentSegIndexSafe}
                    picked={pickedClipIds?.includes(seg.segId) ?? false}
                    toLanePercent={toLanePercent}
                    instant={retimeDragging || segmentDragging}
                    invertCutSegments={invertCutSegments}
                    formatTimecode={formatTimecode}
                    selected={selected}
                    speedControlsVisible={speedControlsSegmentIds.has(seg.segId)}
                    onEditSpeed={onEditSegmentSpeed}
                    onRemoveSpeed={onRemoveSegmentSpeed}
                    onToggleSpeedControls={onToggleSegmentSpeedControls}
                    onEditCrop={onEditSegmentCrop}
                    onEditVolume={onEditClipVolume}
                    filmTiles={filmTiles}
                    filmLoading={!filmstrip.done}
                    lanePx={lanePx}
                    onTrimHandleMouseDown={simpleMode ? onTrimHandleMouseDown : undefined}
                    onRemove={simpleMode ? onRemoveSegment : undefined}
                    removeKeys={removeSegmentKeys}
                  />
                );
              })}

              {retimeOverlay && retimeSegments.map(({ seg, index }) => {
                const left = toLanePercent(seg.start);
                const dragging = retimeDrag?.segId === seg.segId;
                const speed = dragging ? retimeDrag.speed : getSegmentSpeed(seg);
                return (
                  <SegmentRetimeBar
                    key={seg.segId}
                    overlay
                    left={`calc(${left}% + ${retimeOverlayInset}px)`}
                    // max(): a clip narrower than the insets gets no band rather than a negative width.
                    width={`max(0px, calc(${toLanePercent(seg.end) - left}% - ${retimeOverlayInset * 2}px))`}
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
                    onRemove={() => onRemoveSegmentSpeed(seg.segId)}
                    onHide={() => onToggleSegmentSpeedControls(seg.segId)}
                  />
                );
              })}

              {shouldShowKeyframes && !areKeyframesTooClose && keyFramesInZoomWindow.map((f) => (
                <div key={f.time} style={{ position: 'absolute', top: 0, bottom: 0, left: `${toLanePercent(f.time)}%`, marginLeft: -1, width: 1, background: 'var(--gray-10)', pointerEvents: 'none' }} />
              ))}
            </div>

            {showAudioLane && (
              <AudioLane
                peaks={audioPeaks}
                trackGainDb={audioTrackGainDb}
                height={audioLaneHeight}
                segments={cutSegments}
                activeIndex={currentSegIndexSafe}
                noneTicked={noneTicked}
                invertCutSegments={invertCutSegments}
                toLanePercent={toLanePercent}
                pxToTime={pxToTime}
                lanePx={lanePx}
                visibleStartPx={visibleStartPx}
                viewportPx={scrollerWidth}
                onClipClick={setCurrentSegIndex}
                onClipContextMenu={onEditClipVolume}
              />
            )}

            <Playhead playing={playing} commandedTime={commandedTime} getCurrentTime={getCurrentTime} calculateTimelinePos={calculateTimelinePos} lanePx={lanePx} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Timeline);
