import type { CSSProperties, MouseEventHandler } from 'react';
import { forwardRef } from 'react';
import { FiShare } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import type { SegmentToExport } from '../types';
import styles from './ExportButton.module.css';


interface Props {
  segmentsToExport: SegmentToExport[],
  onClick: MouseEventHandler<HTMLButtonElement>,
  style?: CSSProperties,
  label?: string,
  titleOverride?: string,
}

// eslint-disable-next-line react/display-name
const ExportButton = forwardRef<HTMLButtonElement, Props>(({
  segmentsToExport,
  onClick,
  style,
  label,
  titleOverride,
}, ref) => {
  const { t } = useTranslation();

  const { simpleMode } = useUserSettings();

  let title = titleOverride ?? t('Export');
  if (titleOverride == null && segmentsToExport.length === 1) {
    title = t('Export selection');
  } else if (titleOverride == null && segmentsToExport.length > 1) {
    title = t('Export {{ num }} segments', { num: segmentsToExport.length });
  }

  return (
    <button
      ref={ref}
      type="button"
      className={[...(simpleMode ? ['export-animation'] : []), styles['exportButton']].join(' ')}
      style={style}
      onClick={onClick}
      title={title}
    >
      <FiShare aria-hidden style={{ fontSize: '1em', flexShrink: 0 }} />
      {/* Always "Export" here: what it makes depends on the export options, and their own button says it. */}
      {label ?? t('Export')}
    </button>
  );
});

export default ExportButton;
