import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiX } from 'react-icons/fi';

import type { KeyBinding, KeyboardAction } from '../../../common/types';
import Kbd from './Kbd';
import { fixKeys, normalizeBindingKeys } from '../shortcutKeys';
import { allModifiers, splitKeyboardKeys } from '../util';
import styles from './ShortcutField.module.css';

function Caps({ keys }: { keys: readonly string[] }) {
  return (
    <span className={styles['caps']}>
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span className={styles['plus']}>+</span>}
          <Kbd code={key} />
        </Fragment>
      ))}
    </span>
  );
}

const modifierFlags = [
  ['Control', 'ctrlKey'],
  ['Shift', 'shiftKey'],
  ['Alt', 'altKey'],
  ['Meta', 'metaKey'],
] as const;

/**
 * The modifiers held during a key event, read from the event itself: one whose own key press never reached the page
 * (held before recording started, say) still counts. Left unless that side's key was seen.
 */
function getHeldModifiers(e: KeyboardEvent, sides: Map<string, string>) {
  return modifierFlags.flatMap(([name, flag]) => (e[flag] ? [sides.get(name) ?? `${name}Left`] : []));
}

/** How long "another app may be using that shortcut" shows once ClipPress has the focus again. */
const missedHintMs = 6000;

/**
 * An action's shortcuts as key caps that can be changed: click one, the empty one or the "+" and press the new keys.
 * Modifiers show as they're held, drawn pressed in ClipPress blue; the shortcut is set the moment its other key goes
 * down. Escape cancels, ✕ removes it, and keys another action has ask before taking them over.
 */
export default function ShortcutField({ action, label, shown, keyBindings, setKeyBindings, getActionName, recordAtStart = false, canAddMore = true, className }: {
  action: KeyboardAction,
  label: string,
  /** This action's bindings to show (a Windows-key twin of a Ctrl one isn't shown on Windows). */
  shown: readonly KeyBinding[],
  keyBindings: readonly KeyBinding[],
  setKeyBindings: (update: (bindings: KeyBinding[]) => KeyBinding[]) => void,
  getActionName: (other: KeyboardAction) => string,
  /** Records a new shortcut straight away (a quick export just added). */
  recordAtStart?: boolean,
  /** The "+" for another shortcut; without it (a tight row), more are added in the Shortcuts tab. */
  canAddMore?: boolean,
  className?: string | undefined,
}) {
  const { t } = useTranslation();
  // Which binding is being recorded: its keys, or '' for a new one.
  const [recording, setRecording] = useState<string | undefined>(recordAtStart ? '' : undefined);
  const [held, setHeld] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{ keys: string, replacing: string, other: KeyBinding }>();
  // Keys held, then let go with no other key: another program (an overlay, a recorder) took that key on its way here.
  const [missed, setMissed] = useState(false);
  const heldRef = useRef<string[]>([]);
  // Every modifier held since none were, and whether a key that isn't one came in meanwhile.
  const pressedRef = useRef(new Set<string>());
  const sawKeyRef = useRef(false);
  const sidesRef = useRef(new Map<string, string>());
  const conflictRef = useRef<HTMLDivElement>(null);

  // The question can open below the visible part of a long list.
  useEffect(() => {
    if (conflict != null) conflictRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [conflict]);

  const stop = useCallback(() => {
    setRecording(undefined);
    setHeld([]);
    heldRef.current = [];
    sidesRef.current = new Map();
  }, []);

  const updateHeld = useCallback((keys: string[]) => {
    heldRef.current = keys;
    keys.forEach((key) => pressedRef.current.add(key));
    setHeld(keys);
  }, []);

  // The hint stays a few seconds after ClipPress has the focus back (an overlay may have taken it).
  useEffect(() => {
    if (!missed) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setMissed(false), missedHintMs);
    };
    if (document.hasFocus()) startTimer();
    window.addEventListener('focus', startTimer);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', startTimer);
    };
  }, [missed]);

  const save = useCallback((keys: string, replacing: string, takeFrom?: KeyBinding) => {
    setKeyBindings((bindings) => [
      ...bindings.filter((binding) => !(binding.action === action && binding.keys === replacing) && binding !== takeFrom && !(takeFrom != null && binding.keys === takeFrom.keys && binding.action === takeFrom.action)),
      { action, keys },
    ]);
  }, [action, setKeyBindings]);

  const commit = useCallback((keys: string, replacing: string) => {
    stop();
    if (keys === replacing) return;
    const other = keyBindings.find((binding) => normalizeBindingKeys(binding.keys) === normalizeBindingKeys(keys));
    if (other != null && other.action === action) return;
    if (other != null) {
      setConflict({ keys, replacing, other });
      return;
    }
    save(keys, replacing);
  }, [action, keyBindings, save, stop]);

  useEffect(() => {
    if (recording == null) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      // The keys are this field's while it records: nothing else in the app reacts to them.
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      setMissed(false);
      if (allModifiers.has(e.code)) {
        sidesRef.current.set(e.code.replace(/(Left|Right)$/, ''), e.code);
        updateHeld(getHeldModifiers(e, sidesRef.current));
        return;
      }
      sawKeyRef.current = true;
      const modifiers = getHeldModifiers(e, sidesRef.current);
      if (e.code === 'Escape' && modifiers.length === 0) {
        stop();
        return;
      }
      // Set the moment the key that isn't a modifier goes down, with whatever modifiers are held.
      const keys = fixKeys([...modifiers, e.code]);
      if (keys.length > 0) commit(keys.join('+'), recording);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const wasHeld = heldRef.current.length > 0;
      updateHeld(getHeldModifiers(e, sidesRef.current));
      if (!wasHeld || heldRef.current.length > 0) return;
      // Shift alone is a hesitation more than a shortcut another program would take.
      if (!sawKeyRef.current && [...pressedRef.current].some((key) => !key.startsWith('Shift'))) setMissed(true);
      pressedRef.current = new Set();
      sawKeyRef.current = false;
    };
    // Leaving with keys held: Alt alone is Alt+Tab, expected; others mean a program took the shortcut (Win+G opens
    // the Game Bar, say).
    const onBlur = () => {
      const keys = heldRef.current;
      if (keys.length > 0 && !(keys.length === 1 && keys[0]!.startsWith('Alt'))) setMissed(true);
      stop();
    };
    // A click anywhere ends recording, when the button comes up: ending it on the way down would remove the element
    // under the pointer mid-press, and the dialog would take that for a click outside it and close.
    const onPointerDown = () => window.addEventListener('pointerup', stop, { capture: true, once: true });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [commit, recording, stop, updateHeld]);

  const start = (keys: string) => {
    setConflict(undefined);
    setMissed(false);
    sidesRef.current = new Map();
    pressedRef.current = new Set();
    sawKeyRef.current = false;
    updateHeld([]);
    setRecording(keys);
  };

  // The modifiers held so far, in the order a shortcut shows them.
  const heldShown = fixKeys([...held, 'KeyA']).filter((key) => key !== 'KeyA');
  const recordingSlot = (
    <span className={[styles['slot'], styles['recordingSlot']].join(' ')} aria-live="polite" data-shortcut-recording="">
      {held.length > 0 ? <Caps keys={heldShown} /> : <span className={styles['prompt']}>{t('Press keys…')}</span>}
    </span>
  );

  return (
    <div className={[styles['field'], ...(className != null ? [className] : [])].join(' ')}>
      <div className={styles['slots']}>
        {shown.map(({ keys }) => (recording === keys ? <Fragment key={keys}>{recordingSlot}</Fragment> : (
          <span key={keys} className={styles['bindingWrap']}>
            <button type="button" className={styles['slot']} onClick={() => start(keys)} aria-label={t('Change the shortcut for {{action}}', { action: label })}>
              <Caps keys={splitKeyboardKeys(keys)} />
            </button>
            <button type="button" className={styles['remove']} onClick={() => setKeyBindings((bindings) => bindings.filter((binding) => !(binding.action === action && binding.keys === keys)))} title={t('Remove shortcut')} aria-label={t('Remove shortcut')}>
              <FiX aria-hidden />
            </button>
          </span>
        )))}
        {recording === '' && recordingSlot}
        {recording !== '' && shown.length === 0 && (
          // Not set: an empty key cap to fill.
          <button type="button" className={[styles['slot'], styles['emptySlot']].join(' ')} onClick={() => start('')} title={t('Set a shortcut')} aria-label={t('Set a shortcut for {{action}}', { action: label })}>
            <span className={styles['emptyCap']} />
          </button>
        )}
        {/* At the end of every row, set or not, so the key caps of all rows line up. */}
        {canAddMore && (
        <button
          type="button"
          className={[styles['slot'], styles['addSlot'], ...(recording != null ? [styles['addSlotHidden']] : [])].join(' ')}
          onClick={() => start('')}
          tabIndex={recording != null ? -1 : undefined}
          title={shown.length > 0 ? t('Add another shortcut') : t('Set a shortcut')}
          aria-label={shown.length > 0 ? t('Add another shortcut for {{action}}', { action: label }) : t('Set a shortcut for {{action}}', { action: label })}
        >
          <FiPlus aria-hidden />
        </button>
        )}
      </div>
      {missed && conflict == null && <div className={styles['missed']} role="status">{t('Another app may be using that shortcut.')}</div>}
      {conflict != null && (
        <div ref={conflictRef} className={styles['conflict']} role="alert">
          <span>{t('Already used by "{{action}}".', { action: getActionName(conflict.other.action) })}</span>
          <button type="button" className={styles['conflictButton']} onClick={() => { save(conflict.keys, conflict.replacing, conflict.other); setConflict(undefined); }}>{t('Replace')}</button>
          <button type="button" className={styles['conflictButton']} onClick={() => setConflict(undefined)}>{t('Cancel')}</button>
        </div>
      )}
    </div>
  );
}
