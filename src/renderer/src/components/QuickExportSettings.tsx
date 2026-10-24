import { Fragment, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import { normalizeQuickExportPresets, quickExportPresetActions } from '../../../common/quickExport';
import type { ExportEncodeMode, KeyboardAction, QuickExportPreset, SizeLimitPreset } from '../../../common/types';
import { splitKeyboardKeys } from '../util';
import { describeExportQuality } from '../quickExport';
import { renderKeys } from './KeyboardShortcuts';
import HelpTip from './HelpTip';
import Select from './Select';
import TextInput from './TextInput';
import SizeLimitMbInput from './SizeLimitMbInput';
import styles from './QuickExportSettings.module.css';

/**
 * Settings > Export: the quick export shortcuts. The first exports with the last settings and has nothing to set;
 * each of the others gets a name and a quality (Original quality, or a size limit with a preset).
 */
export default function QuickExportSettings() {
  const { t } = useTranslation();
  const { quickExportPresets, setQuickExportPresets, keyBindings } = useUserSettings();

  const presets = useMemo(() => normalizeQuickExportPresets(quickExportPresets), [quickExportPresets]);
  const updatePreset = useCallback((index: number, change: Partial<QuickExportPreset>) => {
    setQuickExportPresets(presets.map((preset, i) => (i === index ? { ...preset, ...change } : preset)));
  }, [presets, setQuickExportPresets]);

  // Their shortcuts as they are now (they can be changed like any other); the first one, if there are several.
  const renderShortcut = (action: KeyboardAction) => {
    const keys = keyBindings.find((binding) => binding.action === action)?.keys;
    return (
      <span className={styles['keys']}>
        {keys != null ? renderKeys(splitKeyboardKeys(keys)) : <span className={styles['noKeys']} title={t('No shortcut')}>–</span>}
      </span>
    );
  };

  return (
    <div className={styles['block']}>
      <div className={styles['heading']}>
        {t('Quick exports')}
        <HelpTip>
          <p>{t('Export straight away, without the export options.')}</p>
          <p>{t('The first uses your last export settings, like Ctrl+click on Export. The others export once with the quality set here, and leave your export options as they are. Files, names and the save folder are always your last ones.')}</p>
        </HelpTip>
      </div>

      <div className={styles['list']}>
        {renderShortcut('quickExport')}
        <div className={styles['lastSettings']}>{t('With the last settings')}</div>

        {presets.map((preset, index) => {
          const action = quickExportPresetActions[index];
          if (action == null) return null;
          const number = index + 1;
          const isSizeLimited = preset.encodeMode === 'size_limited';
          // Three cells of the list's grid: shortcut, name, quality.
          return (
            <Fragment key={action}>
              {renderShortcut(action)}
              <TextInput
                value={preset.name}
                placeholder={describeExportQuality({ isSizeLimited, sizeLimitMb: preset.sizeLimitMb }, (key, options) => t(key, options))}
                aria-label={t('Quick export {{number}} name', { number })}
                title={t('A name, shown while it exports')}
                spellCheck={false}
                maxLength={40}
                onChange={(e) => updatePreset(index, { name: e.target.value })}
                className={styles['name']}
              />
              <div className={styles['quality']}>
                <Select
                  value={preset.encodeMode}
                  aria-label={t('Quick export {{number}} quality', { number })}
                  onChange={(e) => updatePreset(index, { encodeMode: e.target.value as ExportEncodeMode })}
                >
                  <option value="lossless">{t('Original quality')}</option>
                  <option value="size_limited">{t('Fit a file size')}</option>
                </Select>
                {isSizeLimited && (
                  <>
                    <span className={styles['size']}>
                      <SizeLimitMbInput
                        value={preset.sizeLimitMb}
                        onChange={(sizeLimitMb) => updatePreset(index, { sizeLimitMb })}
                        aria-label={t('Quick export {{number}} size limit in MB', { number })}
                        style={{ width: '3.75rem', flexGrow: 0, textAlign: 'right' }}
                      />
                      <span className={styles['unit']}>{t('MB')}</span>
                    </span>
                    <Select
                      value={preset.sizeLimitPreset}
                      aria-label={t('Quick export {{number}} preset', { number })}
                      onChange={(e) => updatePreset(index, { sizeLimitPreset: e.target.value as SizeLimitPreset })}
                    >
                      <option value="max_quality">{t('Max Quality')}</option>
                      <option value="quality">{t('Quality')}</option>
                      <option value="fast">{t('Fast')}</option>
                    </Select>
                  </>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
