import type {
  CSSProperties,
  ClipboardEvent,
  Dispatch,
  FormEvent,
  SetStateAction,
} from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdRotate90DegreesCcw } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { IoIosCamera, IoMdKey, IoMdSpeedometer } from 'react-icons/io';
import {
  FaYinYang,
  FaTrashAlt,
  FaStepBackward,
  FaStepForward,
  FaCaretLeft,
  FaCaretRight,
  FaPause,
  FaPlay,
  FaImages,
  FaKey,
} from 'react-icons/fa';
import { GiSoundWaves } from 'react-icons/gi';
// import useTraceUpdate from 'use-trace-update';
import invariant from 'tiny-invariant';

import {
  primaryTextColor,
  primaryColor,
  darkModeTransition,
  dangerColor,
} from './colors';
import SegmentCutpointButton from './components/SegmentCutpointButton';
import SetCutpointButton from './components/SetCutpointButton';
import CaptureFormatButton from './components/CaptureFormatButton';
import Select from './components/Select';
import Button from './components/Button';

import { withBlur, mirrorTransform } from './util';
import getSwal from './swal';
import { getSegColor as getSegColorRaw } from './util/colors';
import { useSegColors } from './contexts';
import { isExactDurationMatch } from './util/duration';
import useUserSettings from './hooks/useUserSettings';
import { askForPlaybackRate, checkAppPath } from './dialogs';
import type {
  FormatTimecode,
  ParseTimecode,
  PlaybackMode,
  SegmentColorIndex,
  StateSegment,
} from './types';
import type { WaveformMode } from '../../common/types';
import type { Frame } from './ffmpeg';

const { clipboard } = window.require('electron');

const zoomOptions = Array.from({ length: 13 })
  .fill(undefined)
  .map((_unused, z) => 2 ** z);

const leftRightWidth = 100;

// eslint-disable-next-line react/display-name
const InvertCutModeButton = memo(
  ({
    invertCutSegments,
    setInvertCutSegments,
  }: {
    invertCutSegments: boolean;
    setInvertCutSegments: Dispatch<SetStateAction<boolean>>;
  }) => {
    const { t } = useTranslation();

    const onYinYangClick = useCallback(() => {
      setInvertCutSegments((v) => {
        const newVal = !v;
        getSwal().toast.fire({
          title: newVal
            ? t(
              'When you export, selected segments on the timeline will be REMOVED - the surrounding areas will be KEPT',
            )
            : t(
              'When you export, selected segments on the timeline will be KEPT - the surrounding areas will be REMOVED.',
            ),
        });
        return newVal;
      });
    }, [setInvertCutSegments, t]);

    return (
      <Button
        onClick={onYinYangClick}
        title={
          invertCutSegments
            ? t('Discard selected segments')
            : t('Keep selected segments')
        }
        style={{ minHeight: '2rem', padding: '0 .72rem', display: 'inline-flex', alignItems: 'center', gap: '.45rem', color: invertCutSegments ? dangerColor : undefined }}
      >
        <FaYinYang style={{ fontSize: '1.05rem' }} />
        <span style={{ fontSize: '.82rem', fontWeight: 700 }}>
          {invertCutSegments ? t('Remove') : t('Keep')}
        </span>
      </Button>
    );
  },
);

// eslint-disable-next-line react/display-name
const CutTimeInput = memo(
  ({
    disabled,
    darkMode,
    cutTime,
    setCutTime,
    startTimeOffset,
    seekAbs,
    currentCutSeg,
    isStart,
    formatTimecode,
    parseTimecode,
  }: {
    disabled: boolean;
    darkMode: boolean;
    cutTime: number | undefined;
    setCutTime: (type: 'start' | 'end', v: number | undefined) => void;
    startTimeOffset: number;
    seekAbs: (a: number) => void;
    currentCutSeg: StateSegment | undefined;
    isStart?: boolean;
    formatTimecode: FormatTimecode;
    parseTimecode: ParseTimecode;
  }) => {
    const { t } = useTranslation();
    const { getSegColor } = useSegColors();

    const [cutTimeManual, setCutTimeManual] = useState<string>();
    const [error, setError] = useState<boolean>(false);

    // Clear manual overrides if upstream cut time has changed
    useEffect(() => {
      // todo
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCutTimeManual(undefined);
      setError(false);
    }, [setCutTimeManual, currentCutSeg?.start, currentCutSeg?.end]);

    const isCutTimeManualSet = useCallback(
      () => cutTimeManual !== undefined,
      [cutTimeManual],
    );

    const border = useMemo(() => {
      const segColor = getSegColor(currentCutSeg);
      return `.1em solid ${darkMode ? segColor.desaturate(0.4).lightness(50).string() : segColor.desaturate(0.2).lightness(60).string()}`;
    }, [currentCutSeg, darkMode, getSegColor]);

    const setTime = useCallback(
      (timeWithOffset: number | undefined) => {
        // Note: If we get an error from setCutTime, remain in the editing state (cutTimeManual)
        // https://github.com/mifi/lossless-cut/issues/988

        if (timeWithOffset == null) {
          // clear time
          invariant(!isStart);
          setCutTime('end', undefined);
          setCutTimeManual(undefined);
          setError(false);
          return;
        }

        const timeWithoutOffset = Math.max(timeWithOffset - startTimeOffset, 0);
        setCutTime(isStart ? 'start' : 'end', timeWithoutOffset);
        seekAbs(timeWithoutOffset);
        setCutTimeManual(undefined);
        setError(false);
      },
      [isStart, seekAbs, setCutTime, startTimeOffset],
    );

    const isEmptyEndTime = useCallback(
      (v: string | undefined) => !isStart && v?.trim() === '',
      [isStart],
    );

    const handleSubmit = useCallback(
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
          if (isEmptyEndTime(cutTimeManual)) {
            setTime(undefined); // clear time
            return;
          }

          // Don't proceed if not a valid time value
          const timeWithOffset = cutTimeManual != null ? parseTimecode(cutTimeManual) : undefined;
          if (timeWithOffset === undefined) return;

          setTime(timeWithOffset);
        } catch (err) {
          console.warn('Cannot submit cut time', err);
        }
      },
      [cutTimeManual, isEmptyEndTime, parseTimecode, setTime],
    );

    const parseAndSetCutTime = useCallback(
      (text: string) => {
        if (isEmptyEndTime(text)) {
          setTime(undefined); // clear time
          return;
        }

        // Don't proceed if not a valid time value
        const timeWithOffset = parseTimecode(text);
        if (timeWithOffset === undefined) return;

        setTime(timeWithOffset);
      },
      [isEmptyEndTime, parseTimecode, setTime],
    );

    const handleCutTimeInput = useCallback(
      (text: string) => {
        try {
          if (isExactDurationMatch(text) || isEmptyEndTime(text)) {
            parseAndSetCutTime(text);
            return;
          }
        } catch (err) {
          console.warn(err);
          setError(true);
        }

        // else or if error, just set manual value, to make sure it doesn't jump to end https://github.com/mifi/lossless-cut/issues/988#issuecomment-3475870072
        setCutTimeManual(text);
      },
      [isEmptyEndTime, parseAndSetCutTime],
    );

    const handleInputBlur = useCallback(() => {
      setCutTimeManual(undefined);
      setError(false);
    }, []);

    const handleCutTimePaste = useCallback(
      (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();

        try {
          const clipboardData = e.clipboardData.getData('Text');
          setCutTimeManual(clipboardData);
          parseAndSetCutTime(clipboardData);
          setError(false);
        } catch (err) {
          console.warn(err);
          setError(true);
        }
      },
      [parseAndSetCutTime],
    );

    const handleContextMenu = useCallback(() => {
      const text = clipboard.readText();
      if (text) {
        try {
          setCutTimeManual(text);
          parseAndSetCutTime(text);
          setError(false);
        } catch (err) {
          console.warn(err);
          setError(true);
        }
      }
    }, [parseAndSetCutTime]);

    const style = useMemo<CSSProperties>(
      () => ({
        border,
        borderRadius: 5,
        backgroundColor: 'var(--gray-5)',
        transition: darkModeTransition,
        fontSize: 13,
        textAlign: 'center',
        padding: '1px 3px',
        marginTop: 0,
        marginBottom: 0,
        marginLeft: isStart ? 0 : 5,
        marginRight: isStart ? 5 : 0,
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        width: 90,
        outline: 'none',
        color: error
          ? dangerColor
          : (isCutTimeManualSet()
            ? 'var(--gray-12)'
            : 'var(--gray-11)'),
      }),
      [border, error, isCutTimeManualSet, isStart],
    );

    function renderValue() {
      if (isCutTimeManualSet()) return cutTimeManual;
      if (cutTime == null) return formatTimecode({ seconds: 0 }); // marker, see https://github.com/mifi/lossless-cut/issues/2590
      return formatTimecode({ seconds: cutTime + startTimeOffset });
    }

    return (
      <form onSubmit={handleSubmit}>
        <input
          disabled={disabled}
          style={style}
          type="text"
          title={
            isStart
              ? t("Manually input current segment's start time")
              : t("Manually input current segment's end time")
          }
          onChange={(e) => handleCutTimeInput(e.target.value)}
          onPaste={handleCutTimePaste}
          onBlur={handleInputBlur}
          onContextMenu={handleContextMenu}
          value={renderValue()}
        />
      </form>
    );
  },
);

function BottomBar({
  zoom,
  setZoom,
  timelineToggleComfortZoom,
  isRotationSet,
  rotation,
  increaseRotation,
  cleanupFilesDialog,
  captureSnapshot,
  hasVideo,
  seekAbs,
  currentSegIndexSafe,
  cutSegments,
  currentCutSeg,
  setCutStart,
  setCutEnd,
  setCurrentSegIndex,
  jumpTimelineStart,
  jumpTimelineEnd,
  jumpCutEnd,
  jumpCutStart,
  startTimeOffset,
  setCutTime,
  playing,
  shortStep,
  togglePlay,
  toggleLoopSelectedSegments,
  hasAudio,
  keyframesEnabled,
  toggleShowKeyframes,
  seekClosestKeyframe,
  detectedFps,
  isFileOpened,
  selectedSegments,
  darkMode,
  toggleShowThumbnails,
  toggleWaveformMode,
  waveformMode,
  showThumbnails,
  outputPlaybackRate,
  setOutputPlaybackRate,
  formatTimecode,
  parseTimecode,
  playbackRate,
  currentFrame,
  playbackMode,
}: {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  timelineToggleComfortZoom: () => void;
  isRotationSet: boolean;
  rotation: number;
  increaseRotation: () => void;
  cleanupFilesDialog: () => void;
  captureSnapshot: () => void;
  hasVideo: boolean;
  seekAbs: (a: number) => void;
  currentSegIndexSafe: number;
  cutSegments: StateSegment[];
  currentCutSeg: StateSegment | undefined;
  setCutStart: () => void;
  setCutEnd: () => void;
  setCurrentSegIndex: Dispatch<SetStateAction<number>>;
  jumpTimelineStart: () => void;
  jumpTimelineEnd: () => void;
  jumpCutEnd: () => void;
  jumpCutStart: () => void;
  startTimeOffset: number;
  setCutTime: (type: 'start' | 'end', v: number | undefined) => void;
  playing: boolean;
  shortStep: (a: number) => void;
  togglePlay: () => void;
  toggleLoopSelectedSegments: () => void;
  hasAudio: boolean;
  keyframesEnabled: boolean;
  toggleShowKeyframes: () => void;
  seekClosestKeyframe: (a: number) => void;
  detectedFps: number | undefined;
  isFileOpened: boolean;
  selectedSegments: SegmentColorIndex[];
  darkMode: boolean;
  toggleShowThumbnails: () => void;
  toggleWaveformMode: () => void;
  waveformMode: WaveformMode | undefined;
  showThumbnails: boolean;
  outputPlaybackRate: number;
  setOutputPlaybackRate: (v: number) => void;
  formatTimecode: FormatTimecode;
  parseTimecode: ParseTimecode;
  playbackRate: number;
  currentFrame: Frame | undefined;
  playbackMode: PlaybackMode | undefined;
}) {
  const { t } = useTranslation();
  const { getSegColor } = useSegColors();

  const playStyle = useMemo<CSSProperties>(
    () => ({
      paddingLeft: playing ? 0 : '.1em',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '2.3em',
      height: '2.3em',
      borderRadius: '50%',
      boxSizing: 'border-box',
    }),
    [playing],
  );
  const utilityButtonStyle = useMemo<CSSProperties>(() => ({
    minHeight: '2rem',
    padding: '0 .6rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.42rem',
    borderRadius: '999px',
  }), []);

  // ok this is a bit over-engineered but what the hell!
  const loopSelectedSegmentsButtonStyle = useMemo<CSSProperties>(() => {
    // need at least 2 gradient elements:
    const selectedSegmentsSafe = (
      selectedSegments.length >= 2
        ? selectedSegments
        : [
          selectedSegments[0] ?? { segColorIndex: 0 },
          selectedSegments[1] ?? { segColorIndex: 1 },
        ]
    ).slice(0, 10);

    const gradientColors = selectedSegmentsSafe
      .map((seg, i) => {
        const segColor = getSegColorRaw(seg);
        // make colors stronger, the more segments
        return `${segColor.alpha(Math.max(0.4, Math.min(0.8, selectedSegmentsSafe.length / 3))).string()} ${((i / (selectedSegmentsSafe.length - 1)) * 100).toFixed(1)}%`;
      })
      .join(', ');

    return {
      ...playStyle,
      fontSize: '.7em',
      backgroundOffset: 30,
      background: `linear-gradient(90deg, ${gradientColors})`,
      border: '1px solid var(--gray-10)',
    };
  }, [playStyle, selectedSegments]);

  const keyframeStyle = useMemo(
    () => ({
      color:
        currentFrame != null && currentFrame.keyframe
          ? primaryTextColor
          : undefined,
    }),
    [currentFrame],
  );

  const { invertCutSegments, setInvertCutSegments, simpleMode } = useUserSettings();

  const rotationStr = `${rotation}°`;

  useEffect(() => {
    checkAppPath();
  }, []);

  const handleChangePlaybackRateClick = useCallback(async () => {
    const newRate = await askForPlaybackRate({
      detectedFps,
      outputPlaybackRate,
    });
    if (newRate != null) setOutputPlaybackRate(newRate);
  }, [detectedFps, outputPlaybackRate, setOutputPlaybackRate]);

  const playbackRateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    playbackRateRef.current?.animate(
      [{ transform: 'scale(1.7)', color: 'var(--gray-12)' }, {}],
      { duration: 200 },
    );
  }, [playbackRate]);

  function renderJumpCutpointButton(direction: number) {
    const newIndex = currentSegIndexSafe + direction;
    const seg = cutSegments[newIndex];

    const backgroundColor = seg
      && getSegColor(seg)
        .desaturate(0.6)
        .lightness(darkMode ? 35 : 55)
        .string();
    const opacity = seg ? undefined : 0.5;
    const text = seg ? `${newIndex + 1}` : '-';
    const wide = text.length > 1;
    const segButtonStyle: CSSProperties = {
      backgroundColor,
      opacity,
      padding: `6px ${wide ? 4 : 6}px`,
      borderRadius: 10,
      color: seg ? 'white' : undefined,
      fontSize: wide ? 12 : 14,
      width: 20,
      boxSizing: 'border-box',
      letterSpacing: -1,
      lineHeight: '10px',
      fontWeight: 'bold',
      margin: '0 6px',
    };

    return (
      <div
        style={segButtonStyle}
        role="button"
        title={`${direction > 0 ? t('Select next segment') : t('Select previous segment')} (${newIndex + 1})`}
        onClick={() => seg && setCurrentSegIndex(newIndex)}
      >
        {text}
      </div>
    );
  }

  const PlayPause = playing ? FaPause : FaPlay;
  const PlayPauseMode = playing
    && (playbackMode === 'play-selected-segments'
      || playbackMode === 'loop-selected-segments')
    ? FaPause
    : FaPlay;

  const currentCutSegOrDefault = useMemo(
    () => currentCutSeg ?? { segColorIndex: 0 },
    [currentCutSeg],
  );

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: isFileOpened ? 1 : 0.5,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexBasis: leftRightWidth,
          }}
        >
          {!simpleMode && (
            <>
              {hasAudio && (
                <Button title={t('Show waveform')} onClick={() => toggleWaveformMode()} style={utilityButtonStyle}>
                  <GiSoundWaves
                    style={{
                      fontSize: '1.2em',
                      color: waveformMode != null ? primaryTextColor : undefined,
                    }}
                  />
                </Button>
              )}
              {hasVideo && (
                <>
                  <Button title={t('Show thumbnails')} onClick={toggleShowThumbnails} style={utilityButtonStyle}>
                    <FaImages
                      style={{
                        fontSize: '1em',
                        color: showThumbnails ? primaryTextColor : undefined,
                      }}
                    />
                  </Button>

                  <Button title={t('Show keyframes')} onClick={toggleShowKeyframes} style={utilityButtonStyle}>
                    <FaKey
                      style={{
                        fontSize: '.95em',
                        color: keyframesEnabled ? primaryTextColor : undefined,
                      }}
                    />
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <div style={{ flexGrow: 1 }} />

        {!simpleMode && (
          <>
            <FaStepBackward
              size={16}
              style={{ flexShrink: 0 }}
              title={t('Jump to start of video')}
              role="button"
              onClick={jumpTimelineStart}
            />

            {renderJumpCutpointButton(-1)}

            <SegmentCutpointButton
              currentCutSeg={currentCutSeg}
              side="start"
              Icon={FaStepBackward}
              onClick={jumpCutStart}
              title={t("Jump to current segment's start time")}
              style={{ marginRight: 5 }}
            />
          </>
        )}

        <SetCutpointButton
          currentCutSeg={currentCutSegOrDefault}
          side="start"
          onClick={setCutStart}
          title={simpleMode ? t('Mark In (I)') : t('Start current segment at current time')}
          style={{ marginRight: 5 }}
        />

        {!simpleMode && (
          <CutTimeInput
            disabled={!isFileOpened}
            darkMode={darkMode}
            currentCutSeg={currentCutSeg}
            startTimeOffset={startTimeOffset}
            seekAbs={seekAbs}
            cutTime={currentCutSeg?.start}
            setCutTime={setCutTime}
            isStart
            formatTimecode={formatTimecode}
            parseTimecode={parseTimecode}
          />
        )}

        {!simpleMode && keyframesEnabled && (
          <IoMdKey
            size={25}
            role="button"
            title={t('Seek previous keyframe')}
            style={{
              flexShrink: 0,
              marginRight: 2,
              transform: mirrorTransform,
              ...keyframeStyle,
            }}
            onClick={() => seekClosestKeyframe(-1)}
          />
        )}

        {!simpleMode && (
          <FaCaretLeft
            style={{ flexShrink: 0, marginLeft: -6, marginRight: -4 }}
            size={28}
            role="button"
            title={t('One frame back')}
            onClick={() => shortStep(-1)}
          />
        )}

        <div
          role="button"
          onClick={() => togglePlay()}
          style={{
            ...playStyle,
            margin: '.1em .1em 0 .2em',
            background: primaryColor,
          }}
        >
          <PlayPause style={{ fontSize: '.9em' }} />
        </div>

        {!simpleMode && (
          <FaCaretRight
            style={{ flexShrink: 0, marginRight: -6, marginLeft: -4 }}
            size={28}
            role="button"
            title={t('One frame forward')}
            onClick={() => shortStep(1)}
          />
        )}

        {!simpleMode && keyframesEnabled && (
          <IoMdKey
            style={{ flexShrink: 0, marginLeft: 2, ...keyframeStyle }}
            size={25}
            role="button"
            title={t('Seek next keyframe')}
            onClick={() => seekClosestKeyframe(1)}
          />
        )}

        {!simpleMode && (
          <CutTimeInput
            disabled={!isFileOpened}
            darkMode={darkMode}
            currentCutSeg={currentCutSeg}
            startTimeOffset={startTimeOffset}
            seekAbs={seekAbs}
            cutTime={currentCutSeg?.end}
            setCutTime={setCutTime}
            formatTimecode={formatTimecode}
            parseTimecode={parseTimecode}
          />
        )}

        <SetCutpointButton
          currentCutSeg={currentCutSeg}
          side="end"
          onClick={setCutEnd}
          title={simpleMode ? t('Mark Out (O)') : t('End current segment at current time')}
          style={{ marginLeft: 5 }}
        />

        {!simpleMode && (
          <>
            <SegmentCutpointButton
              currentCutSeg={currentCutSeg}
              side="end"
              Icon={FaStepForward}
              onClick={jumpCutEnd}
              title={t("Jump to current segment's end time")}
              style={{ marginLeft: 5 }}
            />

            {renderJumpCutpointButton(1)}

            <FaStepForward
              size={16}
              style={{ flexShrink: 0 }}
              title={t('Jump to end of video')}
              role="button"
              onClick={jumpTimelineEnd}
            />
          </>
        )}

        <div style={{ flexGrow: 1 }} />

        <div style={{ flexBasis: leftRightWidth }} />
      </div>

      {!simpleMode && (
        <div
          className="no-user-select"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '.1em .3em',
            gap: '.5em',
            height: '2em',
          }}
        >
          <InvertCutModeButton
            invertCutSegments={invertCutSegments}
            setInvertCutSegments={setInvertCutSegments}
          />

          {isFileOpened && (
            <>
              <div
                role="button"
                title={t('Zoom')}
                onClick={timelineToggleComfortZoom}
              >
                {Math.floor(zoom)}x
              </div>

              <Select
                style={{ width: '4.5em' }}
                value={zoomOptions.includes(zoom) ? zoom.toString() : ''}
                title={t('Zoom')}
                onChange={withBlur((e) => setZoom(() => parseInt(e.target.value, 10)))}
              >
                <option key="" value="" disabled>
                  {t('Zoom')}
                </option>
                {zoomOptions.map((val) => (
                  <option key={val} value={String(val)}>
                    {t('Zoom')} {val}x
                  </option>
                ))}
              </Select>

              <div
                ref={playbackRateRef}
                title={t('Playback rate')}
                style={{ color: 'var(--gray-11)', fontSize: '.7em' }}
              >
                {playbackRate.toFixed(1)}
              </div>

              <Button title={t('Change FPS')} onClick={handleChangePlaybackRateClick} style={utilityButtonStyle}>
                <IoMdSpeedometer
                  style={{ fontSize: '1.1em', verticalAlign: 'middle' }}
                />
                {detectedFps != null && (
                  <span
                    title={t('Video FPS')}
                    style={{
                      color: 'var(--gray-11)',
                      fontSize: '.75em',
                    }}
                  >
                    {(detectedFps * outputPlaybackRate).toFixed(3)}
                  </span>
                )}
              </Button>
            </>
          )}

          {isFileOpened && hasVideo && (
            <Button onClick={increaseRotation} title={`${t('Set output rotation. Current: ')} ${isRotationSet ? rotationStr : t("Don't modify")}`} style={utilityButtonStyle}>
              <MdRotate90DegreesCcw
                style={{
                  fontSize: '1.05em',
                  verticalAlign: 'middle',
                  color: isRotationSet ? primaryTextColor : undefined,
                }}
              />
              <span
                style={{
                  textAlign: 'right',
                  display: 'inline-block',
                  fontSize: '.76em',
                }}
              >
                {isRotationSet && rotationStr}
              </span>
            </Button>
          )}

          <div style={{ flexGrow: 1 }} />

          {isFileOpened && (
            <Button title={t('Close file and clean up')} onClick={cleanupFilesDialog} style={{ ...utilityButtonStyle, color: dangerColor }}>
              <FaTrashAlt style={{ fontSize: '.95em' }} />
            </Button>
          )}

          {hasVideo && (
            <div>
              <Button title={t('Capture frame')} onClick={captureSnapshot} style={{ ...utilityButtonStyle, marginRight: '.25rem' }}>
                <IoIosCamera style={{ fontSize: '1.3em', verticalAlign: 'middle' }} />
              </Button>

              <CaptureFormatButton
                style={{
                  width: '3.7em',
                  textAlign: 'center',
                  marginLeft: '.1em',
                }}
              />
            </div>
          )}

          {isFileOpened && (
            <div
              role="button"
              onClick={toggleLoopSelectedSegments}
              title={t('Play selected segments in order')}
              style={loopSelectedSegmentsButtonStyle}
            >
              <PlayPauseMode />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(BottomBar);
