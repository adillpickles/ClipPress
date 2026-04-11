import type { CSSProperties, MouseEventHandler } from 'react';
import { forwardRef } from 'react';
import { FiScissors } from 'react-icons/fi';
import { FaFileExport } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import { primaryColor } from '../colors';
import useUserSettings from '../hooks/useUserSettings';
import type { SegmentToExport } from '../types';
import styles from './ExportButton.module.css';


interface Props {
  segmentsToExport: SegmentToExport[],
  areWeCutting: boolean,
  onClick: MouseEventHandler<HTMLButtonElement>,
  style?: CSSProperties,
  label?: string,
  titleOverride?: string,
}

// eslint-disable-next-line react/display-name
const ExportButton = forwardRef<HTMLButtonElement, Props>(({
  segmentsToExport,
  areWeCutting,
  onClick,
  style,
  label,
  titleOverride,
}, ref) => {
  const CutIcon = areWeCutting ? FiScissors : FaFileExport;

  const { t } = useTranslation();

  const { autoMerge, simpleMode } = useUserSettings();

  let title = titleOverride ?? t('Export');
  if (titleOverride == null && segmentsToExport.length === 1) {
    title = t('Export selection');
  } else if (titleOverride == null && segmentsToExport.length > 1) {
    title = t('Export {{ num }} segments', { num: segmentsToExport.length });
  }

  const text = label ?? (autoMerge && segmentsToExport && segmentsToExport.length > 1 ? t('Export all') : t('Export'));

  return (
    <button
      ref={ref}
      type="button"
      className={[...(simpleMode ? ['export-animation'] : []), styles['exportButton']].join(' ')}
      style={{ backgroundColor: primaryColor, ...style }}
      onClick={onClick}
      title={title}
    >
      <CutIcon
        style={{ verticalAlign: 'middle', marginRight: '.2em' }}
      />
      {text}
    </button>
  );
});

export default ExportButton;
