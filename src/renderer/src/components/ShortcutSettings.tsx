import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRotateCcw, FiSearch } from 'react-icons/fi';

import type { KeyBinding, KeyboardAction, ModifierKey, MouseGesture } from '../../../common/types';
import defaultKeyBindings, { defaultMouseModifierKeys } from '../../../common/defaultKeyBindings';
import { normalizeQuickExportPresets, quickExportPresetActions } from '../../../common/quickExport';
import useUserSettings from '../hooks/useUserSettings';
import { getModifierKeyNames } from '../hooks/useTimelineScroll';
import { getQuickExportPresetLabel } from '../quickExport';
import { getEventBindingKeys, getShownBindings, normalizeBindingKeys } from '../shortcutKeys';
import { isMac } from '../util';
import Button from './Button';
import ConfirmButton from './ConfirmButton';
import SettingRow from './SettingRow';
import ShortcutField, { FixedShortcut, GestureField } from './ShortcutField';
import Switch from './Switch';
import TextInput from './TextInput';
import type { TunerType } from '../types';
import { SettingsSearchContext, matchesSearch, useSettingsSearch } from './settingsSearch';
import styles from './Settings.module.css';

/** Back to a shortcut's default, for that row alone: shown once it differs from it. */
function RevertButton({ keys, onClick }: { keys?: string | undefined, onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={styles['revert']} title={t('Back to the default')} data-tip-keys={keys} aria-label={t('Back to the default')} onClick={onClick}>
      <FiRotateCcw aria-hidden />
    </button>
  );
}

const modifierKeyCodes: Record<ModifierKey, string> = { ctrl: 'ControlLeft', shift: 'ShiftLeft', alt: 'AltLeft', meta: 'MetaLeft' };
const wheelGestures: readonly MouseGesture[] = ['zoom', 'frameSeek', 'keyframeSeek'];
const sameKeys = (a: readonly KeyBinding[], b: readonly KeyBinding[]) => {
  const keysOf = (bindings: readonly KeyBinding[]) => new Set(getShownBindings(bindings).map((binding) => normalizeBindingKeys(binding.keys)));
  const [setA, setB] = [keysOf(a), keysOf(b)];
  return setA.size === setB.size && [...setA].every((keys) => setB.has(keys));
};

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
    extraMouseModifierKeys, setExtraMouseModifierKeys,
  } = useUserSettings();

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
      // Only keys pressed in the Settings dialog itself, not in one opened over it (Every action…, with its own recorder).
      const settingsDialog = document.getElementById(searchId)?.closest('[role="dialog"]');
      if (settingsDialog == null || !(e.target instanceof Node) || !settingsDialog.contains(e.target)) return;
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
  }, [keyBindings, searchId, setKeyBindings]);

  // Confirmed in place (ConfirmButton), and Ctrl+Z brings the shortcuts back.
  const resetAll = () => {
    remember();
    resetKeyBindings();
  };

  const { groups, getActionName } = useShortcutGroups();
  const query = [outerQuery, ownQuery].filter(Boolean).join(' ');
  const keysText = (action: KeyboardAction) => keyBindings.filter((b) => b.action === action).map((b) => b.keys.replaceAll(/Left|Right|Key|Digit/g, '').replaceAll('Control', 'Ctrl')).join(' ');

  // A row back to its default: its own keys as they came; a key of those another action took meanwhile comes back.
  const revertAction = (action: KeyboardAction) => {
    const defaults = defaultKeyBindings.filter((binding) => binding.action === action);
    const taken = new Set(defaults.map((binding) => normalizeBindingKeys(binding.keys)));
    changeKeyBindings((bindings) => [...bindings.filter((binding) => binding.action !== action && !taken.has(normalizeBindingKeys(binding.keys))), ...defaults]);
  };

  // The mouse gestures: each one's own modifier (which can be changed, not removed), then any added here.
  const ownModifier: Record<MouseGesture, [ModifierKey, (modifier: ModifierKey) => void]> = {
    zoom: [mouseWheelZoomModifierKey, setMouseWheelZoomModifierKey],
    frameSeek: [mouseWheelFrameSeekModifierKey, setMouseWheelFrameSeekModifierKey],
    keyframeSeek: [mouseWheelKeyframeSeekModifierKey, setMouseWheelKeyframeSeekModifierKey],
    segment: [segmentMouseModifierKey, setSegmentMouseModifierKey],
  };
  const getGestureModifiers = (gesture: MouseGesture) => {
    const [own] = ownModifier[gesture];
    return [own, ...(extraMouseModifierKeys?.[gesture] ?? []).filter((modifier) => modifier !== own)];
  };
  const setGestureModifiers = (gesture: MouseGesture, modifiers: readonly ModifierKey[]) => {
    const [own, ...extra] = modifiers;
    if (own == null) return;
    ownModifier[gesture][1](own);
    setExtraMouseModifierKeys((previous) => ({ ...previous, [gesture]: extra }));
  };
  const renderGesture = (gesture: MouseGesture, label: string, input: string) => {
    const modifiers = getGestureModifiers(gesture);
    const names = getModifierKeyNames();
    if (!matchesSearch(query, label, `${modifiers.map((modifier) => names[modifier]).join(' ')} ${input} mouse wheel scroll drag`)) return null;
    // Wheel gestures share the wheel: a modifier another one uses would only do that one's job.
    const taken = gesture === 'segment' ? [] : wheelGestures.filter((other) => other !== gesture).flatMap((other) => getGestureModifiers(other));
    const changed = modifiers.length > 1 || modifiers[0] !== defaultMouseModifierKeys[gesture];
    return (
      <div key={gesture} className={styles['row']} data-setting-row="">
        <div className={styles['rowText']}>
          <div className={styles['rowLabel']}>
            {label}
            {changed && <RevertButton keys={modifierKeyCodes[defaultMouseModifierKeys[gesture]]} onClick={() => setGestureModifiers(gesture, [defaultMouseModifierKeys[gesture]])} />}
          </div>
        </div>
        <div className={[styles['rowControl'], styles['rowControlWide']].join(' ')}>
          <GestureField label={label} gesture={input} modifiers={modifiers} onChange={(next) => setGestureModifiers(gesture, next)} taken={taken} />
        </div>
      </div>
    );
  };

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
              <div className={styles['rowText']}>
                <div className={styles['rowLabel']}>
                  {label}
                  {!sameKeys(keyBindings.filter((binding) => binding.action === action), defaultKeyBindings.filter((binding) => binding.action === action)) && (
                    <RevertButton keys={getShownBindings(defaultKeyBindings.filter((binding) => binding.action === action))[0]?.keys} onClick={() => revertAction(action)} />
                  )}
                </div>
              </div>
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
          {/* Mouse gestures aren't key bindings: their modifiers are picked from a list, each beside its keyboard twin. */}
          {group.id === 'playback' && renderGesture('frameSeek', t('Step frames with the mouse wheel'), t('Scroll'))}
          {group.id === 'clips' && renderGesture('segment', t('Move or resize a clip with the mouse'), t('Drag'))}
          {group.id === 'timeline' && (
            <>
              {renderGesture('zoom', t('Zoom with the mouse wheel'), t('Scroll'))}
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
                  {renderGesture('keyframeSeek', t('Jump keyframes with the mouse wheel'), t('Scroll'))}
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
                    <div className={styles['rowControl']}><FixedShortcut keys={item.keys} title={t('Set by the menu')} /></div>
                  </div>
                ))}
            </>
          )}
        </section>
      ))}

      <div className={styles['shortcutActions']}>
        <Button onClick={onAllShortcutsRequested}>{t('Every action…')}</Button>
        <ConfirmButton question={t('Reset every shortcut?')} confirmLabel={t('Reset')} onConfirm={resetAll}>{t('Reset all shortcuts')}</ConfirmButton>
      </div>
    </SettingsSearchContext.Provider>
  );
}
