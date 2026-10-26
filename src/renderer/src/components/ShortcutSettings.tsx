import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaMouse } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';

import type { KeyBinding, KeyboardAction, ModifierKey } from '../../../common/types';
import { normalizeQuickExportPresets, quickExportPresetActions } from '../../../common/quickExport';
import useUserSettings from '../hooks/useUserSettings';
import { getModifier, getModifierKeyNames } from '../hooks/useTimelineScroll';
import { getQuickExportPresetLabel } from '../quickExport';
import { getEventBindingKeys, getShownBindings, normalizeBindingKeys } from '../shortcutKeys';
import { isMac } from '../util';
import Button from './Button';
import Select from './Select';
import SettingRow from './SettingRow';
import ShortcutField from './ShortcutField';
import Switch from './Switch';
import TextInput from './TextInput';
import type { TunerType } from '../types';
import { useAppContext } from '../contexts';
import renderKeys from './renderKeys';
import { SettingsSearchContext, matchesSearch, useSettingsSearch } from './settingsSearch';
import styles from './Settings.module.css';

function ModifierSelect({ value, setValue, label }: { value: ModifierKey, setValue: (v: ModifierKey) => void, label: string }) {
  return (
    <Select value={value} onChange={(e) => setValue(e.target.value as ModifierKey)} aria-label={label} style={{ width: 'auto' }}>
      {Object.entries(getModifierKeyNames()).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </Select>
  );
}

/** A gesture that isn't a key binding: shown, with its modifier chosen from a list (wheel gestures aren't rebindable). */
function WheelGesture({ modifier, setModifier, label, gesture }: { modifier: ModifierKey, setModifier: (v: ModifierKey) => void, label: string, gesture: string }) {
  return (
    <SettingRow label={label} keywords={`${getModifier(modifier)} ${gesture} wheel scroll mouse`}>
      <span className={styles['controlGroup']}>
        <ModifierSelect value={modifier} setValue={setModifier} label={label} />
        <span className={styles['gesture']}>+ <FaMouse aria-hidden /> {gesture}</span>
      </span>
    </SettingRow>
  );
}

interface ShortcutItem { action: KeyboardAction, label: string }

/**
 * The Shortcuts tab's groups of actions and their names, which Settings > Export's quick exports use too (to say which
 * action already has a shortcut).
 */
export function useShortcutGroups() {
  const { t } = useTranslation();
  const { quickExportPresets, simpleMode } = useUserSettings();

  const quickExportLabels = useMemo(() => normalizeQuickExportPresets(quickExportPresets).map((preset) => getQuickExportPresetLabel(preset, (key, options) => t(key, options))), [quickExportPresets, t]);

  const groups = useMemo<{ id: string, title: string, items: ShortcutItem[], extra?: ReactNode }[]>(() => [
    {
      id: 'playback',
      title: t('Playback'),
      items: [
        { action: 'togglePlayResetSpeed', label: t('Play / pause') },
        { action: 'seekBackwards', label: t('Back a little') },
        { action: 'seekForwards', label: t('Forward a little') },
        // The simple editor steps a frame with Ctrl+← / → (these actions, see App); , and . still work.
        ...(simpleMode ? [
          { action: 'seekBackwardsPercent', label: t('Previous frame') },
          { action: 'seekForwardsPercent', label: t('Next frame') },
        ] as const : [
          { action: 'seekPreviousFrame', label: t('Previous frame') },
          { action: 'seekNextFrame', label: t('Next frame') },
        ] as const),
        { action: 'reducePlaybackRate', label: t('Play slower') },
        { action: 'increasePlaybackRate', label: t('Play faster') },
        { action: 'toggleMuted', label: t('Mute the preview') },
        { action: 'goToTimecode', label: t('Go to a time') },
        { action: 'toggleFullscreenVideo', label: t('Full screen video') },
      ],
    },
    {
      id: 'clips',
      title: t('Clips'),
      items: [
        { action: 'setCutStart', label: t('Start a clip here') },
        { action: 'setCutEnd', label: t('End the clip here') },
        { action: 'addSegment', label: t('New clip') },
        { action: 'splitCurrentSegment', label: t('Split the clip') },
        { action: 'removeSelectedClips', label: t('Remove the selected clips') },
        { action: 'duplicateCurrentSegment', label: t('Duplicate the clip') },
        { action: 'labelCurrentSegment', label: t('Rename the clip') },
        { action: 'jumpPrevSegment', label: t('Select and go to the clip before') },
        { action: 'jumpNextSegment', label: t('Select and go to the clip after') },
        { action: 'jumpCutStart', label: t('Go to the clip\'s start') },
        { action: 'jumpCutEnd', label: t('Go to the clip\'s end') },
        // Alt+← / →: clip edges in the simple editor, keyframes in advanced mode (see App).
        ...(simpleMode ? [
          { action: 'seekBackwardsKeyframe', label: t('Go to the clip edge before') },
          { action: 'seekForwardsKeyframe', label: t('Go to the clip edge after') },
        ] as const : []),
        { action: 'startOver', label: t('Start over') },
      ],
    },
    {
      id: 'editing',
      title: t('Editing'),
      items: [
        { action: 'undo', label: t('Undo') },
        { action: 'redo', label: t('Redo') },
        { action: 'addTextOverlay', label: t('Add text') },
        { action: 'toggleSegmentSpeedControls', label: t('Speed controls') },
        { action: 'editCurrentSegmentCrop', label: t('Zoom / crop the clip') },
        { action: 'captureSnapshot', label: t('Save a still frame') },
      ],
    },
    {
      id: 'timeline',
      title: t('Timeline'),
      items: [
        { action: 'timelineZoomIn', label: t('Zoom in') },
        { action: 'timelineZoomOut', label: t('Zoom out') },
      ],
    },
    {
      id: 'export',
      title: t('Export'),
      items: [
        { action: 'export', label: t('Export') },
        { action: 'quickExport', label: t('Export with the last settings') },
        ...quickExportLabels.map((preset, index) => ({ action: quickExportPresetActions[index]!, label: t('Quick export {{number}}: {{preset}}', { number: index + 1, preset }) })),
        { action: 'batchOpenNextFile', label: t('Open the next clip in the folder') },
      ],
    },
    {
      id: 'app',
      title: t('ClipPress'),
      items: [
        { action: 'toggleKeyboardShortcuts', label: t('Keyboard shortcuts') },
        { action: 'cleanupFilesDialog', label: t('Close and clean up files') },
      ],
    },
  ], [quickExportLabels, simpleMode, t]);

  // , and . aren't listed in the simple editor, but can still be named when their keys are taken.
  const names = useMemo(() => new Map<KeyboardAction, string>([
    ['seekPreviousFrame', t('Previous frame')],
    ['seekNextFrame', t('Next frame')],
    ...groups.flatMap((group) => group.items.map((item) => [item.action, item.label] as const)),
  ]), [groups, t]);
  const getActionName = useCallback((action: KeyboardAction) => names.get(action) ?? action, [names]);

  return { groups, getActionName };
}

/**
 * Settings > Shortcuts: the shortcuts of everything one makes sense for, grouped, each changed by clicking its keys
 * and pressing new ones. The mouse and wheel gestures sit with the timeline's. Every action (the advanced ones too) is
 * in the full list of the shortcuts dialog.
 */
export default function ShortcutSettings({ onAllShortcutsRequested, onTunerRequested, formatSeconds, showAdvancedSettings }: {
  onAllShortcutsRequested: () => void,
  onTunerRequested: (type: TunerType) => void,
  formatSeconds: (seconds: number) => string,
  showAdvancedSettings: boolean,
}) {
  const { t } = useTranslation();
  const outerQuery = useSettingsSearch();
  const [ownQuery, setOwnQuery] = useState('');
  const searchId = useId();
  const {
    keyBindings, setKeyBindings, resetKeyBindings,
    mouseWheelZoomModifierKey, setMouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, setMouseWheelFrameSeekModifierKey,
    segmentMouseModifierKey, setSegmentMouseModifierKey, invertTimelineScroll, setInvertTimelineScroll, wheelSensitivity, keyboardNormalSeekSpeed,
    mouseWheelKeyframeSeekModifierKey, setMouseWheelKeyframeSeekModifierKey, keyboardSeekSpeed2, keyboardSeekSpeed3, keyboardSeekAccFactor,
  } = useUserSettings();
  const { confirmDialog } = useAppContext();

  // Shortcut changes made here can be undone and redone, with the keys Undo and Redo are set to.
  const historyRef = useRef<{ past: KeyBinding[][], future: KeyBinding[][] }>({ past: [], future: [] });
  const remember = useCallback(() => {
    historyRef.current = { past: [...historyRef.current.past.slice(-49), keyBindings], future: [] };
  }, [keyBindings]);
  const changeKeyBindings = useCallback((update: (bindings: KeyBinding[]) => KeyBinding[]) => {
    const next = update(keyBindings);
    if (next === keyBindings) return;
    remember();
    setKeyBindings(next);
  }, [keyBindings, remember, setKeyBindings]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Not while a shortcut is being recorded (those keys are the new shortcut), nor in a text field (its own undo).
      if (document.querySelector('[data-shortcut-recording]') != null) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]') != null) return;
      const pressed = normalizeBindingKeys(getEventBindingKeys(e));
      const isAction = (name: KeyboardAction) => keyBindings.some((binding) => binding.action === name && normalizeBindingKeys(binding.keys) === pressed);
      const undo = isAction('undo');
      if (!undo && !isAction('redo')) return;
      const { past, future } = historyRef.current;
      const restore = undo ? past.at(-1) : future.at(-1);
      if (restore == null) return;
      e.preventDefault();
      e.stopPropagation();
      historyRef.current = undo ? { past: past.slice(0, -1), future: [...future, keyBindings] } : { past: [...past, keyBindings], future: future.slice(0, -1) };
      setKeyBindings(restore);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [keyBindings, setKeyBindings]);

  const onResetClick = async () => {
    if (!await confirmDialog({ confirmButtonText: t('Reset'), description: t('Put every shortcut back as it came?') })) return;
    remember();
    resetKeyBindings();
  };

  const { groups, getActionName } = useShortcutGroups();
  const query = [outerQuery, ownQuery].filter(Boolean).join(' ');
  const keysText = (action: KeyboardAction) => keyBindings.filter((b) => b.action === action).map((b) => b.keys.replaceAll(/Left|Right|Key|Digit/g, '').replaceAll('Control', 'Ctrl')).join(' ');

  return (
    <SettingsSearchContext.Provider value={query}>
      <div className={styles['shortcutSearch']}>
        <FiSearch aria-hidden />
        <TextInput id={searchId} value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} placeholder={t('Search shortcuts')} aria-label={t('Search shortcuts')} />
      </div>

      {groups.map((group) => (
        <section key={group.id} className={styles['group']}>
          <h3 className={styles['groupTitle']}>{group.title}</h3>
          {group.items.filter((item) => matchesSearch(query, item.label, keysText(item.action))).map(({ action, label }) => (
            <div key={action} className={styles['row']} data-setting-row="">
              <div className={styles['rowText']}><div className={styles['rowLabel']}>{label}</div></div>
              <div className={styles['rowControl']}>
                <ShortcutField
                  action={action}
                  label={label}
                  shown={getShownBindings(keyBindings.filter((binding) => binding.action === action))}
                  keyBindings={keyBindings}
                  setKeyBindings={changeKeyBindings}
                  getActionName={getActionName}
                />
              </div>
            </div>
          ))}
          {group.id === 'timeline' && (
            <>
              {/* Wheel gestures aren't key bindings: their modifier is chosen here, and the direction can turn round. */}
              <WheelGesture label={t('Zoom the timeline')} modifier={mouseWheelZoomModifierKey} setModifier={setMouseWheelZoomModifierKey} gesture={t('scroll')} />
              <WheelGesture label={t('Step frames')} modifier={mouseWheelFrameSeekModifierKey} setModifier={setMouseWheelFrameSeekModifierKey} gesture={t('scroll')} />
              <WheelGesture label={t('Move or resize a clip')} modifier={segmentMouseModifierKey} setModifier={setSegmentMouseModifierKey} gesture={t('drag')} />
              <SettingRow label={t('Reverse wheel direction')} description={t('For moving along the timeline with the wheel.')}>
                <Switch checked={invertTimelineScroll ?? false} onCheckedChange={setInvertTimelineScroll} aria-label={t('Reverse wheel direction')} />
              </SettingRow>
              <SettingRow label={t('Wheel and trackpad sensitivity')} value={wheelSensitivity.toFixed(2)}>
                <Button onClick={() => onTunerRequested('wheelSensitivity')}>{t('Adjust')}</Button>
              </SettingRow>
              <SettingRow label={t('Arrow key seek step')} description={t('How far the arrow keys move.')} value={formatSeconds(keyboardNormalSeekSpeed)}>
                <Button onClick={() => onTunerRequested('keyboardNormalSeekSpeed')}>{t('Adjust')}</Button>
              </SettingRow>
              {showAdvancedSettings && (
                <>
                  <WheelGesture label={t('Jump keyframes')} modifier={mouseWheelKeyframeSeekModifierKey} setModifier={setMouseWheelKeyframeSeekModifierKey} gesture={t('scroll')} />
                  <SettingRow label={t('Longer seek step')} value={formatSeconds(keyboardSeekSpeed2)}>
                    <Button onClick={() => onTunerRequested('keyboardSeekSpeed2')}>{t('Adjust')}</Button>
                  </SettingRow>
                  <SettingRow label={t('Longest seek step')} value={formatSeconds(keyboardSeekSpeed3)}>
                    <Button onClick={() => onTunerRequested('keyboardSeekSpeed3')}>{t('Adjust')}</Button>
                  </SettingRow>
                  <SettingRow label={t('Seek acceleration')} description={t('How quickly holding a seek key speeds up.')} value={`×${keyboardSeekAccFactor.toFixed(2)}`}>
                    <Button onClick={() => onTunerRequested('keyboardSeekAccFactor')}>{t('Adjust')}</Button>
                  </SettingRow>
                </>
              )}
            </>
          )}
          {group.id === 'app' && (
            <>
              {/* The menu's own keys: fixed. */}
              {[{ label: t('Open a clip'), keys: isMac ? 'MetaLeft+KeyO' : 'ControlLeft+KeyO' }, { label: t('Close the clip'), keys: isMac ? 'MetaLeft+KeyW' : 'ControlLeft+KeyW' }, { label: t('Settings'), keys: isMac ? 'MetaLeft+Comma' : 'ControlLeft+Comma' }]
                .filter((item) => matchesSearch(query, item.label)).map((item) => (
                  <div key={item.label} className={styles['row']} data-setting-row="">
                    <div className={styles['rowText']}><div className={styles['rowLabel']}>{item.label}</div></div>
                    <div className={styles['rowControl']}><span className={styles['fixedKeys']} title={t('Set by the menu')}>{renderKeys(item.keys.split('+'))}</span></div>
                  </div>
                ))}
            </>
          )}
        </section>
      ))}

      <div className={styles['shortcutActions']}>
        <Button onClick={onAllShortcutsRequested}>{t('Every action…')}</Button>
        <Button variant="ghost" onClick={onResetClick}>{t('Reset all shortcuts')}</Button>
      </div>
    </SettingsSearchContext.Provider>
  );
}
