import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as Dialog from './Dialog';
import Button, { DialogButton } from './Button';
import ScrubNumberInput from './ScrubNumberInput';
import { getSegmentOutputDuration, getSegmentSpeed, isSegmentSpeedValid } from '../segmentSpeed';
import type { FormatTimecode, StateSegment } from '../types';
import useUserSettings from '../hooks/useUserSettings';
import { formatClipLength } from '../util/clockTime';
import styles from './SegmentSpeed.module.css';

export default function SegmentSpeedDialog({ segment, fileDuration, formatTimecode, onApply, onClose }: {
  segment: StateSegment,
  fileDuration: number | undefined,
  formatTimecode: FormatTimecode,
  onApply: (speed: number) => void,
  onClose: () => void,
}) {
  const { t } = useTranslation();
  const { simpleMode } = useUserSettings();
  // Simple mode says "clip" and writes every length as a clock time, like the speed band and the Clips panel.
  const formatDuration = (seconds: number) => (simpleMode ? formatClipLength(seconds) : formatTimecode({ seconds }));
  const [percent, setPercent] = useState(String(getSegmentSpeed(segment) * 100));
  const speed = Number(percent) / 100;
  const valid = isSegmentSpeedValid(speed);
  const originalDuration = getSegmentOutputDuration({ ...segment, speed: 1 }, 1, fileDuration);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content style={{ width: 380, maxWidth: 'calc(100vw - 48px)' }}>
          <Dialog.Title>{simpleMode ? t('Change clip speed') : t('Change segment speed')}</Dialog.Title>
          <Dialog.Description>{simpleMode ? t('Adjust this clip from 25% to 400%. Audio keeps its pitch.') : t('Adjust this segment from 25% to 400%. Audio keeps its pitch.')}</Dialog.Description>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (valid) onApply(speed);
          }}
          >
            <div className={styles['speedField']}>
              <label htmlFor="segment-speed-percent">{t('Speed')}</label>
              {/* Drag up for faster, down for slower (5% steps, 1% with Shift), or click to type. */}
              <ScrubNumberInput
                id="segment-speed-percent"
                value={percent}
                onChange={setPercent}
                min={25}
                max={400}
                step={5}
                unit="%"
                label={t('Speed')}
                title={t('Drag up or down to change it, or click to type')}
                invalid={!valid}
              />
            </div>
            <div className={styles['presets']}>
              {[25, 50, 100, 150, 200, 400].map((value) => (
                <Button key={value} aria-pressed={Number(percent) === value} onClick={() => setPercent(String(value))}>{value}%</Button>
              ))}
            </div>
            <div className={styles['durations']} aria-live="polite">
              <span>{t('Original duration')}</span><span>{formatDuration(originalDuration)}</span>
              <strong>{t('New duration')}</strong><strong>{valid ? formatDuration(originalDuration / speed) : '—'}</strong>
            </div>
            {!valid && <div role="alert" className={styles['error']}>{t('Enter a speed between 25% and 400%.')}</div>}
            <Dialog.ButtonRow>
              <DialogButton onClick={() => setPercent('100')}>{t('Reset')}</DialogButton>
              <DialogButton onClick={onClose}>{t('Cancel')}</DialogButton>
              <DialogButton primary type="submit" disabled={!valid}>{t('Apply')}</DialogButton>
            </Dialog.ButtonRow>
          </form>
          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
