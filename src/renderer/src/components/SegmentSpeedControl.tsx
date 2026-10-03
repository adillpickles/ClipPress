import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';

import { getSegmentOutputDuration, getSegmentSpeed } from '../segmentSpeed';
import type { FormatTimecode, StateSegment } from '../types';
import styles from './SegmentSpeed.module.css';

export default function SegmentSpeedControl({ segment, formatTimecode, onChange, onEdit, onHide }: {
  segment: StateSegment,
  formatTimecode: FormatTimecode,
  onChange: (speed: number) => void,
  onEdit: () => void,
  onHide: () => void,
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<number>();
  const speed = draft ?? getSegmentSpeed(segment);
  const commit = () => {
    if (draft != null && draft !== getSegmentSpeed(segment)) onChange(draft);
    setDraft(undefined);
  };

  return (
    // The group stops timeline seeking while its native controls receive the interaction.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div role="group" aria-label={t('Speed controls')} className={styles['strip']} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={styles['speedLabel']} onClick={onEdit} title={t('Change segment speed')}>{Math.round(speed * 100)}%</button>
      <input
        type="range"
        min={25}
        max={400}
        step={1}
        value={Math.round(speed * 100)}
        aria-label={t('Segment speed')}
        aria-valuetext={`${Math.round(speed * 100)}%`}
        title={t('Drag left to slow down, right to speed up')}
        onChange={(event) => setDraft(Number(event.target.value) / 100)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onPointerCancel={() => setDraft(undefined)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') setDraft(undefined);
        }}
      />
      <span className={styles['stripDuration']}>{formatTimecode({ seconds: getSegmentOutputDuration({ ...segment, speed }), shorten: true })}</span>
      <button type="button" className={styles['hide']} onClick={onHide} title={t('Hide speed controls')} aria-label={t('Hide speed controls')}><FaTimes size={9} /></button>
    </div>
  );
}
