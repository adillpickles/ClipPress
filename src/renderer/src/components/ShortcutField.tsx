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

/**
 * An action's shortcuts as key caps that can be changed: click one (or the empty slot) and press the new keys. Each key
 * shows the moment it's pressed, drawn pressed in ClipPress blue; letting go saves it. Escape cancels, ✕ removes it,
 * and keys another action has ask before taking them over.
 */
export default function ShortcutField({ action, label, shown, keyBindings, setKeyBindings, getActionName }: {
  action: KeyboardAction,
  label: string,
  /** This action's bindings to show (a Windows-key twin of a Ctrl one isn't shown on Windows). */
  shown: readonly KeyBinding[],
  keyBindings: readonly KeyBinding[],
  setKeyBindings: (update: (bindings: KeyBinding[]) => KeyBinding[]) => void,
  getActionName: (other: KeyboardAction) => string,
}) {
  const { t } = useTranslation();
  // Which binding is being recorded: its keys, or '' for a new one.
  const [recording, setRecording] = useState<string>();
  const [held, setHeld] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{ keys: string, replacing: string, other: KeyBinding }>();
  const peakRef = useRef<string[]>([]);
  const heldRef = useRef(new Set<string>());
  const conflictRef = useRef<HTMLDivElement>(null);

  // The question can open below the visible part of a long list.
  useEffect(() => {
    if (conflict != null) conflictRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [conflict]);

  const stop = useCallback(() => {
    setRecording(undefined);
    setHeld([]);
    peakRef.current = [];
    heldRef.current = new Set();
  }, []);

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
      if (e.code === 'Escape' && heldRef.current.size === 0) {
        stop();
        return;
      }
      heldRef.current.add(e.code);
      const keys = [...heldRef.current];
      setHeld(keys);
      const valid = fixKeys(keys);
      if (valid.length > 0) peakRef.current = valid;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      heldRef.current.delete(e.code);
      setHeld([...heldRef.current]);
      // All let go: the most complete combination pressed is the shortcut (only modifiers isn't one: keep listening).
      if (heldRef.current.size === 0 && peakRef.current.length > 0) commit(peakRef.current.join('+'), recording);
    };
    const onPointerDown = () => stop();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', stop);
    };
  }, [commit, recording, stop]);

  const start = (keys: string) => {
    setConflict(undefined);
    peakRef.current = [];
    heldRef.current = new Set();
    setHeld([]);
    setRecording(keys);
  };

  // Shown while recording: the keys held now, in binding order where they make one (modifiers first).
  const heldShown = fixKeys(held).length > 0 ? fixKeys(held) : [...held].sort((a, b) => Number(!allModifiers.has(a)) - Number(!allModifiers.has(b)));

  return (
    <div className={styles['field']}>
      <div className={styles['slots']}>
        {shown.map(({ keys }) => (recording === keys ? (
          <span key={keys} className={[styles['slot'], styles['recordingSlot']].join(' ')} aria-live="polite">
            {held.length > 0 ? <Caps keys={heldShown} /> : <span className={styles['prompt']}>{t('Press keys…')}</span>}
          </span>
        ) : (
          <span key={keys} className={styles['bindingWrap']}>
            <button type="button" className={styles['slot']} onClick={() => start(keys)} aria-label={t('Change the shortcut for {{action}}', { action: label })}>
              <Caps keys={splitKeyboardKeys(keys)} />
            </button>
            <button type="button" className={styles['remove']} onClick={() => setKeyBindings((bindings) => bindings.filter((binding) => !(binding.action === action && binding.keys === keys)))} title={t('Remove shortcut')} aria-label={t('Remove shortcut')}>
              <FiX aria-hidden />
            </button>
          </span>
        )))}
        {recording === '' ? (
          <span className={[styles['slot'], styles['recordingSlot']].join(' ')} aria-live="polite">
            {held.length > 0 ? <Caps keys={heldShown} /> : <span className={styles['prompt']}>{t('Press keys…')}</span>}
          </span>
        ) : (
          <button
            type="button"
            className={[styles['slot'], styles['emptySlot'], ...(shown.length > 0 ? [styles['addSlot']] : [])].join(' ')}
            onClick={() => start('')}
            title={shown.length > 0 ? t('Add another shortcut') : t('Set a shortcut')}
            aria-label={t('Set a shortcut for {{action}}', { action: label })}
          >
            {shown.length > 0 ? <FiPlus aria-hidden /> : <span className={styles['emptyCap']} />}
          </button>
        )}
      </div>
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
