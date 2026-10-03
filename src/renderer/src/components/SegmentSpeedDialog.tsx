import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as Dialog from './Dialog';
import Button, { DialogButton } from './Button';
import TextInput from './TextInput';
import { getSegmentOutputDuration, getSegmentSpeed, isSegmentSpeedValid } from '../segmentSpeed';
import type { FormatTimecode, StateSegment } from '../types';
import styles from './SegmentSpeed.module.css';

export default function SegmentSpeedDialog({ segment, fileDuration, formatTimecode, onApply, onClose }: {
  segment: StateSegment,
  fileDuration: number | undefined,
  formatTimecode: FormatTimecode,
  onApply: (speed: number) => void,
  onClose: () => void,
}) {
  const { t } = useTranslation();
  const [percent, setPercent] = useState(String(getSegmentSpeed(segment) * 100));
  const speed = Number(percent) / 100;
  const valid = isSegmentSpeedValid(speed);
  const originalDuration = getSegmentOutputDuration({ ...segment, speed: 1 }, 1, fileDuration);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content style={{ width: 380, maxWidth: 'calc(100vw - 48px)' }}>
          <Dialog.Title>{t('Change segment speed')}</Dialog.Title>
          <Dialog.Description>{t('Adjust this segment from 25% to 400%. Audio keeps its pitch.')}</Dialog.Description>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (valid) onApply(speed);
          }}
          >
            <label className={styles['speedField']} htmlFor="segment-speed-percent">
              <span>{t('Speed')}</span>
              <TextInput id="segment-speed-percent" type="number" min={25} max={400} step={1} value={percent} onChange={(event) => setPercent(event.target.value)} autoFocus aria-invalid={!valid} style={{ width: '6em', textAlign: 'right' }} />
              <span>%</span>
            </label>
            <div className={styles['presets']}>
              {[25, 50, 100, 150, 200, 400].map((value) => (
                <Button key={value} aria-pressed={Number(percent) === value} onClick={() => setPercent(String(value))}>{value}%</Button>
              ))}
            </div>
            <div className={styles['durations']} aria-live="polite">
              <span>{t('Original duration')}</span><span>{formatTimecode({ seconds: originalDuration })}</span>
              <strong>{t('New duration')}</strong><strong>{valid ? formatTimecode({ seconds: originalDuration / speed }) : '—'}</strong>
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
