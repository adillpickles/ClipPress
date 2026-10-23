import { memo, useCallback, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MotionStyle } from 'motion/react';
import { motion, AnimatePresence } from 'motion/react';
import { FaTrashAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ColorInstance } from 'color';

import useUserSettings from './hooks/useUserSettings';
import { useSegColors } from './contexts';
import type { FormatTimecode, StateSegment } from './types';
import { getSegmentSpeed } from './segmentSpeed';
import type { FilmstripFrame } from './filmstrip';
import styles from './TimelineSeg.module.css';
import { dbToPercent, isClipVolumeChanged } from './util/audioGain';


const markerButtonStyle: React.CSSProperties = { fontSize: 10, minWidth: 0, letterSpacing: '-.1em', color: 'white' };

function Marker({
  seg, segNum, color, isActive, selected, onClick, getTimePercent, formatTimecode,
}: {
  seg: StateSegment,
  segNum: number,
  color: ColorInstance,
  isActive: boolean,
  selected: boolean,
  onClick: () => void,
  getTimePercent: (a: number) => string,
  formatTimecode: FormatTimecode,
}) {
  const { darkMode, prefersReducedMotion, springAnimation } = useUserSettings();

  const pinColor = darkMode ? color.saturate(0.2).lightness(40).string() : color.desaturate(0.2).lightness(50).string();

  const title = useMemo(() => {
    const parts = [formatTimecode({ seconds: seg.start, shorten: true })];
    if (seg.name) parts.push(seg.name);
    return parts.join(' ');
  }, [formatTimecode, seg.start, seg.name]);

  const style = useMemo<MotionStyle>(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: getTimePercent(seg.start),
    width: 2,
    marginLeft: -1,
    overflow: 'visible',
    backgroundColor: 'var(--gray-12)',
  }), [getTimePercent, seg.start]);

  const borderColor = useMemo(() => {
    if (isActive) {
      if (darkMode) return 'rgba(255,255,255,0.5)';
      return 'rgba(0,0,0,0.5)';
    }
    return 'rgba(0,0,0,0)';
  }, [darkMode, isActive]);

  const segNumStyle = useMemo<React.CSSProperties>(() => ({
    borderRadius: '50%', backgroundColor: pinColor, width: 14, height: 14, marginLeft: -7, flexShrink: 0, textAlign: 'center', border: `1px solid ${borderColor}`,
  }), [pinColor, borderColor]);

  return (
    <motion.div
      style={style}
      layout={!prefersReducedMotion}
      layoutDependency={seg.start}
      transition={springAnimation}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: selected ? 1 : 0.5, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      title={title}
    >
      <div style={segNumStyle}>
        <div
          style={markerButtonStyle}
          role="button"
          onClick={() => onClick()}
        >
          {segNum + 1}
        </div>
      </div>
    </motion.div>
  );
}

/** The frames of `filmstrip` that cover [start, end], placed as percentages of the clip block. */
function getClipFrames(filmstrip: readonly FilmstripFrame[], start: number, end: number, toLanePercent: (t: number) => number, fileEnd: number) {
  const left = toLanePercent(start);
  const width = toLanePercent(end) - left;
  if (!(width > 0)) return [];
  const frames: { url: string, left: number, width: number }[] = [];
  for (let i = 0; i < filmstrip.length; i += 1) {
    const frame = filmstrip[i]!;
    const next = filmstrip[i + 1]?.time ?? fileEnd;
    // eslint-disable-next-line no-continue
    if (next <= start || frame.time >= end) continue;
    const frameLeft = toLanePercent(frame.time);
    frames.push({
      url: frame.url,
      left: ((frameLeft - left) / width) * 100,
      width: ((toLanePercent(next) - frameLeft) / width) * 100,
    });
  }
  return frames;
}

function Segment({
  seg, segNum, color, isActive, selected, onClick, getTimePercent, instant, formatTimecode, invertCutSegments, speedControlsVisible, onEditSpeed, onRemoveSpeed, onToggleSpeedControls, onEditCrop, onEditVolume, filmstrip, toLanePercent, fileEnd, onTrimHandleMouseDown,
}: {
  seg: Omit<StateSegment, 'end'> & { end: number },
  segNum: number,
  color: ColorInstance,
  isActive: boolean,
  selected: boolean,
  onClick: () => void,
  getTimePercent: (a: number) => string,
  instant: boolean,
  formatTimecode: FormatTimecode,
  invertCutSegments: boolean,
  speedControlsVisible: boolean,
  onEditSpeed: (index: number) => void,
  onRemoveSpeed: (segmentId: string) => void,
  onToggleSpeedControls: (segmentId: string) => void,
  onEditCrop: (index: number) => void,
  onEditVolume?: ((index: number, point: { x: number, y: number }) => void) | undefined,
  filmstrip: readonly FilmstripFrame[],
  toLanePercent: (time: number) => number,
  fileEnd: number,
  onTrimHandleMouseDown: ((edge: 'start' | 'end') => (event: ReactMouseEvent<HTMLElement>) => void) | undefined,
}) {
  const { darkMode, prefersReducedMotion, springAnimation, simpleMode } = useUserSettings();
  const { t } = useTranslation();
  const { name } = seg;
  const speed = getSegmentSpeed(seg);
  // Simple mode draws the speed controls as a band along the bottom of the block (Timeline), which also shows the %.
  const speedBand = simpleMode && speedControlsVisible && !invertCutSegments;

  const backgroundColor = useMemo(() => {
    // Same hue at a fixed tone, so every clip reads clearly whatever its palette colour. Excluded
    // clips (and all segments when cutting them away) stay faint; see also the hatching below.
    const base = color.saturationl(Math.min(color.saturationl(), 72));
    if (invertCutSegments || !selected) return darkMode ? base.lightness(34).alpha(0.4).string() : base.lightness(78).alpha(0.6).string();
    if (isActive) return darkMode ? base.lightness(54).alpha(0.95).string() : base.lightness(58).alpha(0.95).string();
    return darkMode ? base.lightness(44).alpha(0.88).string() : base.lightness(66).alpha(0.9).string();
  }, [darkMode, invertCutSegments, isActive, color, selected]);

  const excluded = invertCutSegments || !selected;

  const title = useMemo(() => {
    const parts = [
      formatTimecode({ seconds: seg.start, shorten: true }),
      `- ${formatTimecode({ seconds: seg.end, shorten: true })}`,
    ];
    if (name) parts.push(name);
    return parts.join(' ');
  }, [formatTimecode, name, seg.end, seg.start]);

  const wrapperStyle = useMemo<MotionStyle>(() => {
    const cutSectionWidth = `calc(${getTimePercent(seg.end)} - ${getTimePercent(seg.start)})`;
    return {
      position: 'absolute',
      top: 5,
      bottom: 5,
      left: getTimePercent(seg.start),
      width: cutSectionWidth,
      display: 'flex',
      alignItems: speedBand ? 'flex-start' : 'center',
      paddingTop: speedBand ? 2 : 0,
      originX: 0,
      boxSizing: 'border-box',
      color: darkMode || excluded ? 'var(--gray-12)' : 'rgba(0, 0, 0, 0.82)',
      overflow: 'hidden',
      borderRadius: 6,
      cursor: 'pointer',
      backgroundImage: excluded ? `repeating-linear-gradient(135deg, ${darkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)'} 0 5px, transparent 5px 10px)` : undefined,
      boxShadow: isActive
        ? `inset 0 0 0 2px ${darkMode ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.7)'}`
        : `inset 0 0 0 1px ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
    };
  }, [getTimePercent, seg.end, seg.start, darkMode, excluded, isActive, speedBand]);

  // Simple mode (keeping clips): the clip shows its own frames in full colour (see TimelineSeg.module.css).
  const simpleLook = simpleMode && !invertCutSegments;
  const clipFrames = useMemo(() => (simpleLook ? getClipFrames(filmstrip, seg.start, seg.end, toLanePercent, fileEnd) : []), [fileEnd, filmstrip, seg.end, seg.start, simpleLook, toLanePercent]);

  // Shows a changed volume, which advanced mode has no audio track to show.
  const getClipVolumeMenuLabel = () => {
    if (seg.audioMuted) return t('Clip volume (muted)…');
    if (isClipVolumeChanged(seg)) return t('Clip volume ({{percent}}%)…', { percent: dbToPercent(seg.audioGainDb ?? 0) });
    return t('Clip volume…');
  };

  const onContextMenuCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (invertCutSegments) return;
    event.preventDefault();
    event.stopPropagation();
    onClick();
    const point = { x: event.clientX, y: event.clientY };
    const remote = window.require('@electron/remote');
    remote.Menu.buildFromTemplate([
      { label: t('Speed controls'), type: 'checkbox', checked: speedControlsVisible, click: () => onToggleSpeedControls(seg.segId) },
      { label: t('Change speed…'), click: () => onEditSpeed(segNum) },
      { label: t('Remove speed change'), enabled: speed !== 1 || speedControlsVisible, click: () => onRemoveSpeed(seg.segId) },
      { type: 'separator' },
      { label: t('Zoom / Crop…'), click: () => onEditCrop(segNum) },
      ...(onEditVolume != null ? [{ label: getClipVolumeMenuLabel(), click: () => onEditVolume(segNum, point) }] : []),
    ]).popup({ window: remote.getCurrentWindow() });
  };

  if (simpleLook) {
    const hasFrames = clipFrames.length > 0;
    return (
      <motion.div
        className={[styles['clip'], ...(isActive ? [styles['active']] : []), ...(excluded ? [styles['excluded']] : [])].join(' ')}
        style={{
          position: 'absolute',
          top: 5,
          bottom: 5,
          left: getTimePercent(seg.start),
          width: `calc(${getTimePercent(seg.end)} - ${getTimePercent(seg.start)})`,
          originX: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          borderRadius: 10,
          cursor: 'pointer',
          // Until the frames arrive (or for clips without video), the clip is a soft block of its colour.
          backgroundColor: hasFrames ? 'transparent' : backgroundColor,
        }}
        layout={!prefersReducedMotion && !instant}
        // Measured only when this clip moves, not on every render of the timeline.
        layoutDependency={`${seg.start}:${seg.end}`}
        transition={instant ? { duration: 0 } : springAnimation}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={{ opacity: 0, scaleX: 0 }}
        role="button"
        onClick={onClick}
        data-segment-id={seg.segId}
        onContextMenuCapture={onContextMenuCapture}
        title={title}
      >
        {hasFrames && (
          <div className={styles['film']} aria-hidden>
            {clipFrames.map((frame) => (
              <img key={frame.url} src={frame.url} alt="" draggable={false} style={{ left: `${frame.left}%`, width: `${frame.width}%` }} />
            ))}
          </div>
        )}
        <div className={styles['tint']} aria-hidden />
        <span className={styles['pill']}>
          <span className={styles['num']} style={{ background: color.saturationl(Math.min(color.saturationl(), 70)).lightness(46).string() }}>{segNum + 1}</span>
          {name && <span className={styles['name']}>{name}</span>}
          {speed !== 1 && !speedBand && <span className={styles['speed']}>{`${Math.round(speed * 100)}%`}</span>}
        </span>
        {isActive && !excluded && onTrimHandleMouseDown != null && (
          <>
            <button type="button" tabIndex={-1} className={[styles['handle'], styles['handleStart']].join(' ')} aria-label={t('Drag to change where the clip starts')} title={t('Drag to change where the clip starts')} onMouseDown={onTrimHandleMouseDown('start')} />
            <button type="button" tabIndex={-1} className={[styles['handle'], styles['handleEnd']].join(' ')} aria-label={t('Drag to change where the clip ends')} title={t('Drag to change where the clip ends')} onMouseDown={onTrimHandleMouseDown('end')} />
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      style={wrapperStyle}
      layout={!prefersReducedMotion && !instant}
      layoutDependency={`${seg.start}:${seg.end}`}
      transition={instant ? { duration: 0 } : springAnimation}
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1, backgroundColor }}
      exit={{ opacity: 0, scaleX: 0 }}
      role="button"
      onClick={onClick}
      data-segment-id={seg.segId}
      onContextMenuCapture={onContextMenuCapture}
      title={title}
    >
      {/* The block keeps its exact time width (very short clips can be narrower than the padding). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', minWidth: 0, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, minWidth: 16, height: 18, padding: '0 4px', boxSizing: 'border-box', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', background: darkMode ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.55)' }}>{segNum + 1}</div>

        <AnimatePresence>
          {invertCutSegments && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            style={{ flexShrink: 1, display: 'flex' }}
          >
            <FaTrashAlt style={{ display: 'block', minWidth: '.4em', fontSize: 11 }} />
          </motion.div>
          )}
        </AnimatePresence>

        {name && <div style={{ flexShrink: 1, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>}

        {speed !== 1 && !speedBand && <div style={{ flexShrink: 0, marginLeft: 'auto', fontSize: 11, fontWeight: 600, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>{`${Math.round(speed * 100)}%`}</div>}
      </div>
    </motion.div>
  );
}

function SegmentOrMarker({
  seg, toLanePercent, instant, isActive, segNum, onSegClick, invertCutSegments, formatTimecode, selected, speedControlsVisible, onEditSpeed, onRemoveSpeed, onToggleSpeedControls, onEditCrop, onEditVolume, filmstrip, fileEnd, onTrimHandleMouseDown,
} : {
  seg: StateSegment,
  toLanePercent: (time: number) => number,
  instant: boolean,
  isActive: boolean,
  segNum: number,
  onSegClick: (a: number) => void,
  invertCutSegments: boolean,
  formatTimecode: FormatTimecode,
  selected: boolean,
  speedControlsVisible: boolean,
  onEditSpeed: (index: number) => void,
  onRemoveSpeed: (segmentId: string) => void,
  onToggleSpeedControls: (segmentId: string) => void,
  onEditCrop: (index: number) => void,
  onEditVolume?: ((index: number, point: { x: number, y: number }) => void) | undefined,
  filmstrip: readonly FilmstripFrame[],
  fileEnd: number,
  /** Simple mode: start dragging an edge of the active clip. */
  onTrimHandleMouseDown?: ((edge: 'start' | 'end') => (event: ReactMouseEvent<HTMLElement>) => void) | undefined,
}) {
  const { getSegColor } = useSegColors();

  const segColor = useMemo(() => getSegColor(seg), [getSegColor, seg]);

  const getTimePercent = (t: number) => `${toLanePercent(t)}%`;

  const onThisSegClick = useCallback(() => onSegClick(segNum), [onSegClick, segNum]);

  if (seg.end != null) {
    return <Segment seg={seg as Omit<StateSegment, 'end'> & { end: number }} segNum={segNum} color={segColor} selected={selected} isActive={isActive} onClick={onThisSegClick} getTimePercent={getTimePercent} instant={instant} formatTimecode={formatTimecode} invertCutSegments={invertCutSegments} speedControlsVisible={speedControlsVisible} onEditSpeed={onEditSpeed} onRemoveSpeed={onRemoveSpeed} onToggleSpeedControls={onToggleSpeedControls} onEditCrop={onEditCrop} onEditVolume={onEditVolume} filmstrip={filmstrip} toLanePercent={toLanePercent} fileEnd={fileEnd} onTrimHandleMouseDown={onTrimHandleMouseDown} />;
  }

  return (
    <Marker seg={seg} segNum={segNum} color={segColor} selected={selected} isActive={isActive} onClick={onThisSegClick} getTimePercent={getTimePercent} formatTimecode={formatTimecode} />
  );
}

export default memo(SegmentOrMarker);
