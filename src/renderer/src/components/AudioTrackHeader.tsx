import { memo, useState } from 'react';
import { FaUndo } from 'react-icons/fa';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import styles from './AudioTrackHeader.module.css';
import { defaultAudioGainDb, isMutedAudioGain, maxAudioGainDb, minAudioGainDb } from '../util/streams';

export interface TrackGainControl {
  streamIndex: number,
  label: string,
  audioGainDb: number,
}

export function formatGainDb(audioGainDb: number, muteLabel: string) {
  if (isMutedAudioGain(audioGainDb)) return muteLabel;
  if (audioGainDb === 0) return '0 dB';
  return `${audioGainDb > 0 ? '+' : ''}${audioGainDb} dB`;
}

/**
 * The audio track's header: mute the preview (doesn't change the export) and the track's volume for the whole
 * export (what used to be "Clip gain" on the preview).
 */
function AudioTrackHeader({ previewMuted, onTogglePreviewMuted, gainControls, onGainChange }: {
  previewMuted: boolean,
  onTogglePreviewMuted: () => void,
  gainControls: TrackGainControl[],
  onGainChange: (streamIndex: number, audioGainDb: number) => void,
}) {
  const { t } = useTranslation();
  // The pill the popover opens from (null when closed).
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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
          {formatGainDb(main.audioGainDb, t('Mute'))}
        </button>
      )}

      {anchor != null && (
        <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} label={t('Track volume')}>
          <div className={styles['popoverTitle']}>{t('Track volume')}</div>
          <div className={styles['popoverHint']}>{t('For the whole export. Right-click a clip on the audio track to change just that clip.')}</div>
          {gainControls.map(({ streamIndex, label, audioGainDb }) => (
            <div key={streamIndex} className={styles['gainItem']}>
              <div className={styles['gainHeader']}>
                <span className={styles['gainLabel']}>{label}</span>
                <span className={styles['gainValue']}>{formatGainDb(audioGainDb, t('Mute'))}</span>
                <button type="button" className={styles['resetButton']} title={t('Reset')} aria-label={t('Reset')} onClick={() => onGainChange(streamIndex, defaultAudioGainDb)}>
                  <FaUndo size={10} />
                </button>
              </div>
              <input
                className={styles['slider']}
                type="range"
                min={minAudioGainDb}
                max={maxAudioGainDb}
                step={1}
                value={audioGainDb}
                aria-label={label}
                onChange={(e) => onGainChange(streamIndex, Number(e.target.value))}
              />
            </div>
          ))}
        </AnchoredPopover>
      )}
    </div>
  );
}

export default memo(AudioTrackHeader);
