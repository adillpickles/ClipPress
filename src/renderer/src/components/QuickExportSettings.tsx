import { Fragment, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiX } from 'react-icons/fi';

import useUserSettings from '../hooks/useUserSettings';
import { newQuickExportPreset, normalizeQuickExportPresets, quickExportPresetActions, removeQuickExportPreset, defaultQuickExportPresets } from '../../../common/quickExport';
import type { ExportEncodeMode, KeyboardAction, QuickExportPreset, SizeLimitPreset } from '../../../common/types';
import { describeExportQuality } from '../quickExport';
import { getShownBindings } from '../shortcutKeys';
import Button from './Button';
import HelpTip from './HelpTip';
import ShortcutField from './ShortcutField';
import { useShortcutGroups } from './ShortcutSettings';
import Select from './Select';
import TextInput from './TextInput';
import SizeLimitMbInput from './SizeLimitMbInput';
import styles from './QuickExportSettings.module.css';

/**
 * Settings > Export: the quick export shortcuts. The first exports with the last settings and has nothing to set;
 * each of the others gets a name and a quality (Original quality, or a size limit with a preset). Three are always
 * there; "Add shortcut" adds more, up to nine, each with its own shortcut.
 */
export default function QuickExportSettings() {
  const { t } = useTranslation();
  const { quickExportPresets, setQuickExportPresets, keyBindings, setKeyBindings } = useUserSettings();
  const { getActionName } = useShortcutGroups();
  // The one just added, whose shortcut is being recorded.
  const [added, setAdded] = useState<number>();

  const presets = useMemo(() => normalizeQuickExportPresets(quickExportPresets), [quickExportPresets]);
  const updatePreset = useCallback((index: number, change: Partial<QuickExportPreset>) => {
    setQuickExportPresets(presets.map((preset, i) => (i === index ? { ...preset, ...change } : preset)));
  }, [presets, setQuickExportPresets]);
  const addPreset = () => {
    setAdded(presets.length);
    setQuickExportPresets([...presets, newQuickExportPreset]);
  };
  const removePreset = (index: number) => {
    const removed = removeQuickExportPreset(presets, keyBindings, index);
    setAdded(undefined);
    setQuickExportPresets(removed.presets);
    setKeyBindings(removed.keyBindings);
  };

  // Their shortcuts, set and changed here as in the Shortcuts tab.
  const renderShortcut = (action: KeyboardAction, label: string, recordAtStart = false) => (
    <ShortcutField
      key={`${action}-${recordAtStart}`}
      action={action}
      label={label}
      shown={getShownBindings(keyBindings.filter((binding) => binding.action === action))}
      keyBindings={keyBindings}
      setKeyBindings={(update) => setKeyBindings(update(keyBindings))}
      getActionName={getActionName}
      recordAtStart={recordAtStart}
      canAddMore={false}
      className={styles['shortcut']}
    />
  );

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
        {renderShortcut('quickExport', t('Export with the last settings'))}
        <div className={styles['lastSettings']}>{t('With the last settings')}</div>

        {presets.map((preset, index) => {
          const action = quickExportPresetActions[index];
          if (action == null) return null;
          const number = index + 1;
          const isSizeLimited = preset.encodeMode === 'size_limited';
          // Three cells of the list's grid: shortcut, name, and quality (with ✕ at its end for one that was added).
          return (
            <Fragment key={action}>
              {renderShortcut(action, t('Quick export {{number}}', { number }), added === index)}
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
                {index >= defaultQuickExportPresets.length && (
                  <button type="button" className={styles['remove']} onClick={() => removePreset(index)} title={t('Remove')} aria-label={t('Remove quick export {{number}}', { number })}>
                    <FiX aria-hidden />
                  </button>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {presets.length < quickExportPresetActions.length && (
        <Button variant="ghost" size="sm" className={styles['add']} onClick={addPreset}>
          <FiPlus aria-hidden />
          {t('Add shortcut')}
        </Button>
      )}
    </div>
  );
}
