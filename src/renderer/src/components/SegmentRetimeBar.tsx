import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCaretDown } from 'react-icons/fa';

import { segmentSpeedPresets } from '../segmentSpeed';
import type { FormatTimecode } from '../types';
import { formatClipLength } from '../util/clockTime';
import styles from './SegmentSpeed.module.css';
import LaneDeleteButton from './LaneDeleteButton';

const remote = window.require('@electron/remote');
const { Menu } = remote;

const baseArrowSpacing = 14;

/**
 * Resolve-style retime header drawn over a segment's timeline span. The timeline owns the
 * drag because a speed change ripples every lane; this only renders the bar and its menus.
 */
export default function SegmentRetimeBar({ left, width, speed, committedSpeed, outputDuration, isActive, dragging, overlay = false, formatTimecode, onHandleMouseDown, onSelect, onChange, onEdit, onRemove, onHide }: {
  left: string,
  width: string,
  speed: number,
  committedSpeed: number,
  outputDuration: number,
  isActive: boolean,
  dragging: boolean,
  /**
   * Drawn as a slim band along the bottom of the clip block (simple mode), so showing it doesn't add a lane.
   * Only simple mode draws it, so it also gets simple mode's words and length style.
   */
  overlay?: boolean,
  formatTimecode: FormatTimecode,
  onHandleMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void,
  onSelect: () => void,
  onChange: (nextSpeed: number) => void,
  onEdit: () => void,
  /** Like Resolve: deleting the retime returns the segment to 100% and closes the bar. */
  onRemove: () => void,
  /** Close the bar but keep the speed. */
  onHide: () => void,
}) {
  const { t } = useTranslation();

  const openSpeedMenu = () => {
    onSelect();
    Menu.buildFromTemplate([
      ...segmentSpeedPresets.map((preset) => ({
        label: `${Math.round(preset * 100)}%`,
        type: 'checkbox' as const,
        checked: preset === committedSpeed,
        click: () => onChange(preset),
      })),
      { type: 'separator' as const },
      { label: t('Custom speed…'), click: onEdit },
      { type: 'separator' as const },
      { label: t('Remove speed change'), click: onRemove },
      { label: t('Hide speed controls (keep speed)'), click: onHide },
    ]).popup({ window: remote.getCurrentWindow() });
  };

  const arrowsStyle = { '--retime-arrow-spacing': `${Math.min(48, Math.max(5, baseArrowSpacing / speed))}px` } as CSSProperties;

  return (
    // Clicks select the segment without seeking; the controls inside are real buttons.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={styles['retimeBar']}
      data-tone={speed < 1 ? 'slow' : 'normal'}
      data-active={isActive}
      data-dragging={dragging}
      data-overlay={overlay}
      style={{ left, width }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSpeedMenu();
      }}
    >
      <div className={styles['retimeHeader']}>
        <div className={styles['retimeArrows']} style={arrowsStyle} />
      </div>

      <div className={styles['retimeBody']}>
        <button type="button" className={styles['retimeSpeed']} onClick={(event) => { event.stopPropagation(); openSpeedMenu(); }} title={overlay ? t('Change speed') : t('Change segment speed')}>
          {Math.round(speed * 100)}%<FaCaretDown size={9} />
        </button>
        <span className={styles['retimeDuration']}>{overlay ? formatClipLength(outputDuration) : formatTimecode({ seconds: outputDuration, shorten: true })}</span>
      </div>

      {isActive && !dragging && !overlay && (
        <LaneDeleteButton title={t('Remove speed change (back to 100%)')} onDelete={onRemove} style={{ right: 12 }} />
      )}

      <button
        type="button"
        className={styles['retimeHandle']}
        onMouseDown={onHandleMouseDown}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (committedSpeed !== 1) onChange(1);
        }}
        title={t('Drag right to slow down, left to speed up. Double-click to reset.')}
        aria-label={`${overlay ? t('Clip speed') : t('Segment speed')} ${Math.round(speed * 100)}%`}
      />
    </div>
  );
}
