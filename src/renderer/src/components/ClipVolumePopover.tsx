import { memo, useId, useRef } from 'react';
import { FaUndo } from 'react-icons/fa';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import styles from './ClipVolumePopover.module.css';
import { dbToPercent, formatVolumePercent, getClipPlaysAtPercent, isMutedAudioGain, isNeutralAudioGain, maxClipVolumePercent, percentToDb, snapToFullVolume } from '../util/audioGain';

export interface ClipVolumeChange {
  audioGainDb: number | undefined,
  audioMuted: boolean,
}

/**
 * A clip's own volume: a mute switch that remembers the level, a 0–200% slider and a reset. Opened by
 * right-clicking the clip on the audio track. It changes the export, on top of the track volume (when that isn't
 * 100%, a line says what the clip really plays at).
 */
function ClipVolumePopover({ anchor, clipLabel, audioGainDb, audioMuted, trackGainDb, onChange, onClose }: {
  anchor: HTMLElement | { x: number, y: number },
  clipLabel: string,
  audioGainDb: number | undefined,
  audioMuted: boolean,
  /** The track volume under the clip's (undefined when tracks differ). */
  trackGainDb: number | undefined,
  /** `dragId` while the slider moves: changes with the same id are one undo step. */
  onChange: (volume: ClipVolumeChange, dragId: number | undefined) => void,
  onClose: () => void,
}) {
  const { t } = useTranslation();
  const ticksId = useId();
  const pointerDownRef = useRef(false);
  // Each press or focus of the slider starts a new undo step.
  const dragIdRef = useRef(0);
  // The level before the slider was dragged down to 0, which un-muting brings back.
  const levelBeforeDragRef = useRef<number | undefined>(undefined);

  const levelPercent = dbToPercent(audioGainDb ?? 0);
  const percent = audioMuted ? 0 : levelPercent;
  const changed = audioMuted || percent !== 100;
  const MuteIcon = audioMuted ? FiVolumeX : FiVolume2;

  let playsAt: string | undefined;
  if (trackGainDb != null && !isNeutralAudioGain(trackGainDb) && !audioMuted) {
    playsAt = isMutedAudioGain(trackGainDb)
      ? t('Silent: the track is muted')
      : t('Plays at {{volume}} (track at {{track}})', { volume: `${getClipPlaysAtPercent(trackGainDb, { audioGainDb })}%`, track: formatVolumePercent(trackGainDb, t('Muted')) });
  }

  const onSlide = (value: number) => {
    // Snap only for the pointer: with the arrow keys, 99 and 101 must stay reachable.
    const snapped = pointerDownRef.current ? snapToFullVolume(value) : value;
    if (snapped <= 0) {
      onChange({ audioGainDb: pointerDownRef.current ? levelBeforeDragRef.current : audioGainDb, audioMuted: true }, dragIdRef.current);
      return;
    }
    onChange({ audioGainDb: snapped === 100 ? undefined : percentToDb(snapped), audioMuted: false }, dragIdRef.current);
  };

  // Mute keeps the level; un-mute brings it back as it was.
  const toggleMuted = () => onChange({ audioGainDb, audioMuted: !audioMuted }, undefined);

  const startInteraction = () => {
    dragIdRef.current += 1;
  };

  return (
    // Opened from the clip's volume badge with the keyboard, focus moves into it (see AnchoredPopover).
    <AnchoredPopover anchor={anchor} onClose={onClose} label={t('Clip volume')} keyboardFocus>
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
          onPointerDown={() => {
            startInteraction();
            pointerDownRef.current = true;
            levelBeforeDragRef.current = audioMuted ? undefined : audioGainDb;
          }}
          onPointerUp={() => { pointerDownRef.current = false; }}
          onFocus={startInteraction}
          onChange={(e) => onSlide(Number(e.target.value))}
        />
        <datalist id={ticksId}>
          <option value={100} aria-label="100%" />
        </datalist>
        <span className={styles['value']}>{audioMuted ? t('Muted') : `${percent}%`}</span>
        <button
          type="button"
          className={styles['resetButton']}
          onClick={() => onChange({ audioGainDb: undefined, audioMuted: false }, undefined)}
          disabled={!changed}
          title={t('Back to 100%')}
          aria-label={t('Back to 100%')}
        >
          <FaUndo size={10} />
        </button>
      </div>
      {playsAt != null && <div className={styles['playsAt']}>{playsAt}</div>}
    </AnchoredPopover>
  );
}

export default memo(ClipVolumePopover);
