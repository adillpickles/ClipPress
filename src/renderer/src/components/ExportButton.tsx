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
  /** Ctrl+click: export right away with the last settings, instead of opening the export options. */
  onQuickExport?: (() => void) | undefined,
  style?: CSSProperties,
  label?: string,
  titleOverride?: string,
  /** The export shortcut, shown in its hint. */
  exportKeys?: string | undefined,
}

// eslint-disable-next-line react/display-name
const ExportButton = forwardRef<HTMLButtonElement, Props>(({
  segmentsToExport,
  onClick,
  onQuickExport,
  style,
  label,
  titleOverride,
  exportKeys,
}, ref) => {
  const { t } = useTranslation();

  const { simpleMode, exportConfirmEnabled } = useUserSettings();

  let title = titleOverride ?? t('Export');
  if (titleOverride == null && segmentsToExport.length === 1) {
    title = t('Export selection');
  } else if (titleOverride == null && segmentsToExport.length > 1) {
    title = t('Export {{ num }} segments', { num: segmentsToExport.length });
  }
  // Without the export options a click exports right away already.
  if (onQuickExport != null && exportConfirmEnabled) title += `\n${t('Ctrl+click to export right away with your last settings')}`;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    if (onQuickExport != null && (e.ctrlKey || e.metaKey)) {
      onQuickExport();
      return;
    }
    onClick(e);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={[...(simpleMode ? ['export-animation'] : []), styles['exportButton']].join(' ')}
      style={style}
      onClick={handleClick}
      title={title}
      data-tip-keys={exportKeys}
    >
      <FiShare aria-hidden style={{ fontSize: '1em', flexShrink: 0 }} />
      {/* Always "Export" here: what it makes depends on the export options, and their own button says it. */}
      {label ?? t('Export')}
    </button>
  );
});

export default ExportButton;
