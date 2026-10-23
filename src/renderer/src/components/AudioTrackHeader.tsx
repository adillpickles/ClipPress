import { memo, useId, useRef, useState } from 'react';
import { FaUndo } from 'react-icons/fa';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import HelpTip from './HelpTip';
import styles from './AudioTrackHeader.module.css';
import { defaultAudioGainDb, formatVolumePercent, maxClipVolumePercent, sliderPercentToTrackGainDb, snapToFullVolume, trackGainToSliderPercent } from '../util/audioGain';

export interface TrackGainControl {
  streamIndex: number,
  label: string,
  audioGainDb: number,
}

/**
 * The audio track's header: mute the preview (doesn't change the export) and the track's volume for the whole
 * export (what used to be "Clip gain" on the preview). Only simple mode has it, so the volume reads in % like a
 * clip's; advanced mode's controls keep dB.
 */
function AudioTrackHeader({ previewVolume, onPreviewVolumeChange, onTogglePreviewMuted, gainControls, onGainChange }: {
  /** 0..1, what you hear here only. */
  previewVolume: number,
  onPreviewVolumeChange: (volume: number) => void,
  onTogglePreviewMuted: () => void,
  gainControls: TrackGainControl[],
  onGainChange: (streamIndex: number, audioGainDb: number) => void,
}) {
  const { t } = useTranslation();
  const ticksId = useId();
  // The pill the popover opens from (null when closed).
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pointerDownRef = useRef(false);

  const previewMuted = previewVolume === 0;
  const main = gainControls[0];
  const changed = gainControls.some((control) => control.audioGainDb !== defaultAudioGainDb);
  const PreviewIcon = previewMuted ? FiVolumeX : FiVolume2;

  return (
    <div className={styles['header']}>
      <button
        type="button"
        className={[styles['iconButton'], ...(previewMuted ? [styles['iconButtonActive']] : [])].join(' ')}
        onClick={onTogglePreviewMuted}
        title={previewMuted ? t('Unmute preview') : t('Mute preview (the export is not affected)')}
        aria-label={previewMuted ? t('Unmute preview') : t('Mute preview')}
        aria-pressed={previewMuted}
      >
        <PreviewIcon aria-hidden />
      </button>

      {main != null && (
        <button
          type="button"
          className={[styles['pill'], ...(changed ? [styles['pillChanged']] : [])].join(' ')}
          onClick={(e) => setAnchor(anchor != null ? null : e.currentTarget)}
          aria-expanded={anchor != null}
          title={t('Track volume')}
        >
          {formatVolumePercent(main.audioGainDb, t('Muted'))}
        </button>
      )}

      {anchor != null && (
        <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} label={t('Track volume')} keyboardFocus>
          <div className={styles['gainItem']}>
            <div className={styles['gainHeader']}>
              <span className={styles['gainLabel']}>{t('Preview volume (not exported)')}</span>
              <span className={styles['gainValue']}>{Math.round(previewVolume * 100)}%</span>
            </div>
            <input
              className={styles['slider']}
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(previewVolume * 100)}
              aria-label={t('Preview volume')}
              onChange={(e) => onPreviewVolumeChange(Number(e.target.value) / 100)}
            />
          </div>
          <div className={styles['divider']} />
          <div className={styles['popoverTitle']}>
            {t('Track volume')}
            <HelpTip label={t('About track volume')}>{t('For the whole export. Right-click a clip on the audio track to change just that clip.')}</HelpTip>
          </div>
          {gainControls.map(({ streamIndex, label, audioGainDb }) => {
            const volumeText = formatVolumePercent(audioGainDb, t('Muted'));
            return (
              <div key={streamIndex} className={styles['gainItem']}>
                <div className={styles['gainHeader']}>
                  <span className={styles['gainLabel']}>{label}</span>
                  <span className={styles['gainValue']}>{volumeText}</span>
                  <button
                    type="button"
                    className={styles['resetButton']}
                    title={t('Back to 100%')}
                    aria-label={t('Back to 100%')}
                    disabled={audioGainDb === defaultAudioGainDb}
                    onClick={() => onGainChange(streamIndex, defaultAudioGainDb)}
                  >
                    <FaUndo size={10} />
                  </button>
                </div>
                {/* The same 0–200% scale as a clip's volume. */}
                <input
                  className={styles['slider']}
                  type="range"
                  min={0}
                  max={maxClipVolumePercent}
                  step={1}
                  value={trackGainToSliderPercent(audioGainDb)}
                  list={ticksId}
                  aria-label={label}
                  aria-valuetext={volumeText}
                  onPointerDown={() => { pointerDownRef.current = true; }}
                  onPointerUp={() => { pointerDownRef.current = false; }}
                  onChange={(e) => {
                    const percent = Number(e.target.value);
                    // Snap only for the pointer: with the arrow keys, 99 and 101 must stay reachable.
                    onGainChange(streamIndex, sliderPercentToTrackGainDb(pointerDownRef.current ? snapToFullVolume(percent) : percent));
                  }}
                />
              </div>
            );
          })}
          <datalist id={ticksId}>
            <option value={100} aria-label="100%" />
          </datalist>
        </AnchoredPopover>
      )}
    </div>
  );
}

export default memo(AudioTrackHeader);
