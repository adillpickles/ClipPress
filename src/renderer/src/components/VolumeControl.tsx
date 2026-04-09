import type { ChangeEventHandler } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import styles from './VolumeControl.module.css';
import {
  maxAudioGainDb,
  minAudioGainDb,
} from '../util/streams';

type AudioGainControl = {
  streamIndex: number,
  label: string,
  audioGainDb: number,
};

function formatAudioGain(audioGainDb: number, t: (key: string) => string) {
  if (audioGainDb <= minAudioGainDb) return t('Mute');
  return `${audioGainDb > 0 ? `+${audioGainDb}` : audioGainDb} dB`;
}

function VolumeControl({
  playbackVolume,
  setPlaybackVolume,
  onToggleMutedClick,
  audioGainControls = [],
  onAudioGainChange,
}: {
  playbackVolume: number,
  setPlaybackVolume: (a: number) => void,
  onToggleMutedClick: () => void,
  audioGainControls?: AudioGainControl[] | undefined,
  onAudioGainChange?: ((streamIndex: number, audioGainDb: number) => void) | undefined,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const onVolumeChange = useCallback<ChangeEventHandler<HTMLInputElement>>((e) => {
    setPlaybackVolume(Number(e.target.value) / 100);
  }, [setPlaybackVolume]);

  const VolumeIcon = playbackVolume === 0 ? FaVolumeMute : FaVolumeUp;

  return (
    <div ref={wrapperRef} className={styles['wrapper']}>
      {isOpen && (
        <div className={styles['popover']}>
          <div className={styles['section']}>
            <div className={styles['sectionLabel']}>{t('Preview volume')}</div>
            <div className={styles['sliderRow']}>
              <input
                className={styles['slider']}
                type="range"
                min={0}
                max={100}
                value={playbackVolume * 100}
                onChange={onVolumeChange}
              />
              <div className={styles['value']}>{Math.round(playbackVolume * 100)}%</div>
            </div>
            <Button onClick={onToggleMutedClick} className={styles['miniButton']}>
              {playbackVolume === 0 ? t('Unmute preview') : t('Mute preview')}
            </Button>
          </div>

          {audioGainControls.length > 0 && (
            <div className={styles['section']}>
              <div className={styles['sectionLabel']}>{t('Clip gain')}</div>
              <div className={styles['gainList']}>
                {audioGainControls.map(({ streamIndex, label, audioGainDb }) => (
                  <div key={streamIndex} className={styles['gainItem']}>
                    <div className={styles['gainHeader']}>
                      <div className={styles['gainLabel']}>{label}</div>
                      <div className={styles['value']}>
                        {formatAudioGain(audioGainDb, t)}
                      </div>
                    </div>
                    <input
                      className={styles['slider']}
                      type="range"
                      min={minAudioGainDb}
                      max={maxAudioGainDb}
                      step={1}
                      value={audioGainDb}
                      onChange={(e) => onAudioGainChange?.(streamIndex, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles['trigger']}
        title={t('Preview volume and clip gain')}
        aria-label={t('Preview volume and clip gain')}
        onClick={() => setIsOpen((value) => !value)}
      >
        <VolumeIcon size={30} />
      </button>
    </div>
  );
}

export default memo(VolumeControl);
