import { memo, useId, useRef, useState } from 'react';
import { FaUndo } from 'react-icons/fa';
import { FiVolume1, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import HelpTip from './HelpTip';
import styles from './AudioTrackHeader.module.css';
import { defaultAudioGainDb, formatVolumePercent, getTrackVolumeLevel, maxClipVolumePercent, sliderPercentToTrackGainDb, snapToFullVolume, trackGainToSliderPercent } from '../util/audioGain';

export interface TrackGainControl {
  streamIndex: number,
  label: string,
  audioGainDb: number,
}

/**
 * The audio track's header: a speaker that shows what you'll hear, and opens the track's volume for the whole
 * export (what used to be "Clip gain" on the preview) with the preview's own volume and mute under it. Only
 * simple mode has it, so the volume reads in % like a clip's; advanced mode's controls keep dB.
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
  // The speaker the popover opens from (null when closed).
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pointerDownRef = useRef(false);

  const previewMuted = previewVolume === 0;
  const previewPercent = Math.round(previewVolume * 100);
  const single = gainControls.length === 1 ? gainControls[0] : undefined;
  const trackLevel = getTrackVolumeLevel(gainControls.map((control) => control.audioGainDb));
  const trackChanged = gainControls.some((control) => control.audioGainDb !== defaultAudioGainDb);
  // What you'll hear: silent when the track or the preview is muted.
  let SpeakerIcon = trackLevel === 'lower' ? FiVolume1 : FiVolume2;
  if (trackLevel === 'muted' || previewMuted) SpeakerIcon = FiVolumeX;
  const PreviewIcon = previewMuted ? FiVolumeX : FiVolume2;

  // The tooltip says which of the two is muted or turned down.
  const titleParts: string[] = [];
  if (trackLevel === 'muted') titleParts.push(t('Track muted'));
  else if (single != null && trackChanged) titleParts.push(t('Track at {{volume}}', { volume: formatVolumePercent(single.audioGainDb, t('Muted')) }));
  else if (trackChanged) titleParts.push(t('Track volume changed'));
  if (previewMuted) titleParts.push(t('Preview muted'));
  const speakerTitle = titleParts.length > 0 ? titleParts.join(' · ') : t('Volume');
  let speakerClass = styles['iconButton'];
  if (trackChanged) speakerClass += ` ${styles['iconButtonChanged']}`;
  // Its warning colour wins over the track's tint.
  if (previewMuted) speakerClass += ` ${styles['iconButtonActive']}`;

  const renderReset = ({ streamIndex, audioGainDb }: TrackGainControl) => (
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
  );

  // The same 0–200% scale as a clip's volume. Opened from the keyboard, focus starts on the first one, not the "i".
  const renderSlider = ({ streamIndex, label, audioGainDb }: TrackGainControl, first: boolean) => (
    <input
      className={styles['slider']}
      data-autofocus={first || undefined}
      type="range"
      min={0}
      max={maxClipVolumePercent}
      step={1}
      value={trackGainToSliderPercent(audioGainDb)}
      list={ticksId}
      aria-label={single != null ? t('Track volume') : label}
      aria-valuetext={formatVolumePercent(audioGainDb, t('Muted'))}
      onPointerDown={() => { pointerDownRef.current = true; }}
      onPointerUp={() => { pointerDownRef.current = false; }}
      onChange={(e) => {
        const percent = Number(e.target.value);
        // Snap only for the pointer: with the arrow keys, 99 and 101 must stay reachable.
        onGainChange(streamIndex, sliderPercentToTrackGainDb(pointerDownRef.current ? snapToFullVolume(percent) : percent));
      }}
    />
  );

  return (
    <div className={styles['header']}>
      <button
        type="button"
        className={speakerClass}
        onClick={(e) => setAnchor(anchor != null ? null : e.currentTarget)}
        title={speakerTitle}
        aria-label={t('Volume')}
        aria-haspopup="dialog"
        aria-expanded={anchor != null}
      >
        <SpeakerIcon aria-hidden />
      </button>

      {anchor != null && (
        <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} label={t('Volume')} keyboardFocus>
          <div className={styles['popoverTitle']}>
            {t('Track volume')}
            <HelpTip label={t('About track volume')}>{t('The whole recording, in the export. Right-click a clip on the audio track to change just that clip.')}</HelpTip>
            {single != null && (
              <>
                <span className={styles['gainValue']}>{formatVolumePercent(single.audioGainDb, t('Muted'))}</span>
                {renderReset(single)}
              </>
            )}
          </div>
          {single != null ? renderSlider(single, true) : gainControls.map((control, i) => (
            <div key={control.streamIndex} className={styles['gainItem']}>
              <div className={styles['gainHeader']}>
                <span className={styles['gainLabel']}>{control.label}</span>
                <span className={styles['gainValue']}>{formatVolumePercent(control.audioGainDb, t('Muted'))}</span>
                {renderReset(control)}
              </div>
              {renderSlider(control, i === 0)}
            </div>
          ))}
          <datalist id={ticksId}>
            <option value={100} aria-label="100%" />
          </datalist>

          <div className={styles['divider']} />

          {/* Quieter than the track's: it only changes what you hear here. */}
          <div className={styles['preview']}>
            <div className={styles['gainHeader']}>
              <span className={styles['previewTitle']}>{t('Preview volume')}</span>
              <span className={styles['previewValue']}>{previewMuted ? t('Muted') : `${previewPercent}%`}</span>
            </div>
            <div className={styles['previewNote']}>{t('Only while you watch, not exported')}</div>
            <div className={styles['previewRow']}>
              <button
                type="button"
                className={[styles['muteButton'], ...(previewMuted ? [styles['muteButtonOn']] : [])].join(' ')}
                onClick={onTogglePreviewMuted}
                title={previewMuted ? t('Unmute preview') : t('Mute preview (the export is not affected)')}
                aria-label={previewMuted ? t('Unmute preview') : t('Mute preview')}
                aria-pressed={previewMuted}
              >
                <PreviewIcon aria-hidden />
              </button>
              <input
                className={styles['slider']}
                type="range"
                min={0}
                max={100}
                step={1}
                value={previewPercent}
                aria-label={t('Preview volume')}
                onChange={(e) => onPreviewVolumeChange(Number(e.target.value) / 100)}
              />
            </div>
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}

export default memo(AudioTrackHeader);
