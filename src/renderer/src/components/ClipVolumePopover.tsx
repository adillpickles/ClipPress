import { memo, useId, useRef } from 'react';
import { FaUndo } from 'react-icons/fa';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import styles from './ClipVolumePopover.module.css';
import { dbToPercent, maxClipVolumePercent, percentToDb } from '../util/audioGain';

export interface ClipVolumeChange {
  audioGainDb: number | undefined,
  audioMuted: boolean,
}

/** Dragging near 100% snaps to it, so "back to normal" is easy to hit. */
const detentPercent = 4;
/** Below this, un-muting brings the clip back to 100% instead of to a barely audible level. */
const minRestoredPercent = 10;

/**
 * A clip's own volume: a mute switch that remembers the level, a 0–200% slider and a reset. Opened by
 * right-clicking the clip on the audio track. It changes the export, on top of the track volume.
 */
function ClipVolumePopover({ anchor, clipLabel, audioGainDb, audioMuted, onChange, onClose }: {
  anchor: HTMLElement | { x: number, y: number },
  clipLabel: string,
  audioGainDb: number | undefined,
  audioMuted: boolean,
  /** `drag` while the slider moves, so one drag is one undo step. */
  onChange: (volume: ClipVolumeChange, drag: boolean) => void,
  onClose: () => void,
}) {
  const { t } = useTranslation();
  const ticksId = useId();
  const pointerDownRef = useRef(false);

  const levelPercent = dbToPercent(audioGainDb ?? 0);
  const percent = audioMuted ? 0 : levelPercent;
  const changed = audioMuted || percent !== 100;
  const MuteIcon = audioMuted ? FiVolumeX : FiVolume2;

  const onSlide = (value: number) => {
    // Snap only for the pointer: with the arrow keys, 99 and 101 must stay reachable.
    const snapped = pointerDownRef.current && Math.abs(value - 100) <= detentPercent ? 100 : value;
    if (snapped <= 0) {
      onChange({ audioGainDb, audioMuted: true }, true);
      return;
    }
    onChange({ audioGainDb: snapped === 100 ? undefined : percentToDb(snapped), audioMuted: false }, true);
  };

  const toggleMuted = () => {
    if (audioMuted) {
      onChange({ audioGainDb: levelPercent < minRestoredPercent ? undefined : audioGainDb, audioMuted: false }, false);
    } else {
      onChange({ audioGainDb, audioMuted: true }, false);
    }
  };

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={t('Clip volume')}>
      <div className={styles['heading']}>
        <span className={styles['title']}>{t('Clip volume')}</span>
        <span className={styles['clipName']}>{clipLabel}</span>
      </div>
      <div className={styles['row']}>
        <button
          type="button"
          className={[styles['muteButton'], ...(audioMuted ? [styles['muteButtonOn']] : [])].join(' ')}
          onClick={toggleMuted}
          aria-pressed={audioMuted}
          title={audioMuted ? t('Unmute clip') : t('Mute clip')}
          aria-label={audioMuted ? t('Unmute clip') : t('Mute clip')}
        >
          <MuteIcon aria-hidden />
        </button>
        <input
          className={styles['slider']}
          type="range"
          min={0}
          max={maxClipVolumePercent}
          step={1}
          value={percent}
          list={ticksId}
          aria-label={t('Clip volume')}
          aria-valuetext={audioMuted ? t('Muted') : `${percent}%`}
          onPointerDown={() => { pointerDownRef.current = true; }}
          onPointerUp={() => { pointerDownRef.current = false; }}
          onChange={(e) => onSlide(Number(e.target.value))}
        />
        <datalist id={ticksId}>
          <option value={100} aria-label="100%" />
        </datalist>
        <span className={styles['value']}>{audioMuted ? t('Muted') : `${percent}%`}</span>
        <button
          type="button"
          className={styles['resetButton']}
          onClick={() => onChange({ audioGainDb: undefined, audioMuted: false }, false)}
          disabled={!changed}
          title={t('Back to 100%')}
          aria-label={t('Back to 100%')}
        >
          <FaUndo size={10} />
        </button>
      </div>
    </AnchoredPopover>
  );
}

export default memo(ClipVolumePopover);
