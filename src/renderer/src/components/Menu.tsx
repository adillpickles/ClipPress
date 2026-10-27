import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import renderKeys from './renderKeys';
import { confirmLockMs } from './ConfirmButton';
import { splitKeyboardKeys } from '../util';
import styles from './Menu.module.css';

/**
 * The app's own menu, used for the title bar's menus, every right-click menu and the speed menu, in place of the
 * system's. Items take the same shape as Electron's menu templates, so a template can be shown as it is.
 */
export interface MenuEntry {
  label?: string | undefined,
  type?: 'normal' | 'separator' | 'checkbox' | 'radio' | 'submenu' | undefined,
  checked?: boolean | undefined,
  enabled?: boolean | undefined,
  visible?: boolean | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  click?: ((...args: any[]) => void) | undefined,
  submenu?: MenuEntry[] | undefined,
  /** An app key binding (`ControlLeft+KeyZ`), shown as key caps. */
  keys?: string | undefined,
  /** An Electron accelerator (`CmdOrCtrl+O`), shown as key caps. */
  accelerator?: string | undefined,
  /** Shown in red when highlighted (an action that throws work away). */
  danger?: boolean | undefined,
  /**
   * Asked first, in place: a click turns the item into this question, locked for a second (a soft red fills it), and
   * a second click does it ("Really start over?").
   */
  confirm?: string | undefined,
  /** A text field's own action (cut, copy, paste…), done on the field that had focus. */
  role?: string | undefined,
}

export interface OpenMenuOptions {
  items: readonly MenuEntry[],
  /** Where: a point (a right-click), or under an element (a menu button). */
  at: { x: number, y: number } | HTMLElement,
  label?: string | undefined,
  onClose?: (() => void) | undefined,
  /** Opened from the keyboard: the first item is highlighted at once. */
  keyboard?: boolean | undefined,
  /** Left or Right on a menu without a submenu there: the title bar moves on to the next menu. */
  onNavigate?: ((direction: -1 | 1) => void) | undefined,
  /**
   * The pointer outside the menu (where clicks only close it, as with a system menu): the title bar opens the menu of
   * a button it's over. True if it was handled (a press then doesn't close the menu).
   */
  onOutsidePointer?: ((event: { x: number, y: number, type: 'move' | 'down' }) => boolean) | undefined,
}

let host: ((options: OpenMenuOptions | undefined) => void) | undefined;

export function openMenu(options: OpenMenuOptions) {
  host?.(options);
}

export function closeMenu() {
  host?.(undefined);
}

const isMac = process.platform === 'darwin';
const margin = 6;
const submenuDelayMs = 140;
const editRoles = ['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'selectAll'] as const;
type EditRole = typeof editRoles[number];
const isEditRole = (role: string | undefined): role is EditRole => editRoles.includes(role as EditRole);

const visibleItems = (items: readonly MenuEntry[]) => items.filter((item) => item.visible !== false);
const isSeparator = (item: MenuEntry) => item.type === 'separator';
const isEnabled = (item: MenuEntry) => !isSeparator(item) && item.enabled !== false;
const hasSubmenu = (item: MenuEntry) => item.submenu != null && visibleItems(item.submenu).length > 0;

/** Menu labels escape `&` as `&&`, and may mark an access key with one `&`. */
const cleanLabel = (label: string | undefined) => (label ?? '').replaceAll('&&', '\u0000').replaceAll('&', '').replaceAll('\u0000', '&');

/** An Electron accelerator as key names: `CmdOrCtrl+Shift+Z` is `Ctrl`, `Shift`, `Z` here. */
export function getAcceleratorKeyNames(accelerator: string) {
  const names: Record<string, string> = {
    commandorcontrol: isMac ? '⌘' : 'Ctrl',
    cmdorctrl: isMac ? '⌘' : 'Ctrl',
    command: '⌘',
    cmd: '⌘',
    control: 'Ctrl',
    ctrl: 'Ctrl',
    alt: isMac ? '⌥' : 'Alt',
    option: '⌥',
    shift: 'Shift',
    super: isMac ? '⌘' : 'Win',
    meta: isMac ? '⌘' : 'Win',
    plus: '+',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    return: 'Enter',
    escape: 'Esc',
  };
  return accelerator.split('+').filter((part) => part !== '').map((part) => names[part.toLowerCase()] ?? part);
}

function Keys({ item }: { item: MenuEntry }) {
  if (item.keys != null) return <span className={styles['keys']}>{renderKeys(splitKeyboardKeys(item.keys))}</span>;
  if (item.accelerator == null) return null;
  return (
    <span className={styles['keys']}>
      {getAcceleratorKeyNames(item.accelerator).map((name, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={i}>
          {i > 0 && <span className={styles['plus']}>+</span>}
          <kbd>{name}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

interface PanelState {
  items: readonly MenuEntry[],
  /** The highlighted item (an index into `items`). */
  active: number | undefined,
  /** The item whose submenu is open. */
  open: number | undefined,
  /** Where it opens: a point, or beside a parent item. */
  anchor: { x: number, y: number } | DOMRect,
  /** A submenu opens beside its parent item, a menu below its button or at the point. */
  beside: boolean,
}

/** Where a menu goes: beside its parent item, under its button, or at the point; kept inside the window. */
function getPanelPosition({ width, height }: { width: number, height: number }, anchor: PanelState['anchor'], beside: boolean) {
  let left: number;
  let top: number;
  if (anchor instanceof DOMRect && beside) {
    // To the right of its item, or the left when there's no room; lined up with the item.
    left = anchor.right - 4 + width + margin <= window.innerWidth ? anchor.right - 4 : anchor.left - width + 4;
    top = anchor.top - 5;
  } else if (anchor instanceof DOMRect) {
    // Under its button, or above it near the bottom.
    left = anchor.left;
    top = anchor.bottom + 4 + height + margin <= window.innerHeight ? anchor.bottom + 4 : anchor.top - height - 4;
  } else {
    // At the point, flipped to stay in the window.
    left = anchor.x + width + margin <= window.innerWidth ? anchor.x : anchor.x - width;
    top = anchor.y + height + margin <= window.innerHeight ? anchor.y : anchor.y - height;
  }
  return {
    left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
  };
}

function MenuPanel({ panel, level, label, takeFocus, confirming, onHover, onActivate, panelRef }: {
  panel: PanelState,
  level: number,
  label: string | undefined,
  /** The item asking its question, and whether it can be clicked yet. */
  confirming: { index: number, armed: boolean } | undefined,
  /** The highlighted item gets focus; not when a text field opened the menu (it would end editing there). */
  takeFocus: boolean,
  onHover: (panelLevel: number, index: number | undefined) => void,
  onActivate: (panelLevel: number, index: number) => void,
  panelRef: (el: HTMLDivElement | null) => void,
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) return;
    const { left, top } = getPanelPosition(el.getBoundingClientRect(), panel.anchor, panel.beside);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = '';
  }, [panel.anchor, panel.beside, panel.items]);

  // The highlighted item has focus, so the keyboard and screen readers follow it.
  useEffect(() => {
    if (!takeFocus) return;
    if (panel.active == null) {
      ref.current?.focus({ preventScroll: true });
      return;
    }
    ref.current?.querySelector<HTMLElement>(`[data-index="${panel.active}"]`)?.focus({ preventScroll: true });
  }, [panel.active, takeFocus]);

  const anyChecks = panel.items.some((item) => item.type === 'checkbox' || item.type === 'radio');

  return (
    <div
      ref={(el) => {
        ref.current = el;
        panelRef(el);
      }}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={styles['menu']}
      style={{ top: -9999, left: -9999, visibility: 'hidden' }}
      onPointerLeave={() => onHover(level, undefined)}
      onContextMenu={(e) => e.preventDefault()}
      // A click doesn't move focus: a text field that opened the menu keeps it for its edit actions.
      onMouseDown={(e) => e.preventDefault()}
    >
      {panel.items.map((item, index) => {
        if (isSeparator(item)) {
          // eslint-disable-next-line react/no-array-index-key
          return <div key={index} role="separator" className={styles['separator']} />;
        }
        const enabled = isEnabled(item);
        const submenu = hasSubmenu(item);
        const checkable = item.type === 'checkbox' || item.type === 'radio';
        let role = 'menuitem';
        if (item.type === 'checkbox') role = 'menuitemcheckbox';
        else if (item.type === 'radio') role = 'menuitemradio';
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            role={role}
            data-index={index}
            tabIndex={-1}
            aria-disabled={!enabled || undefined}
            aria-checked={checkable ? item.checked === true : undefined}
            aria-haspopup={submenu ? 'menu' : undefined}
            aria-expanded={submenu ? panel.open === index : undefined}
            className={[
              styles['item'],
              ...(panel.active === index ? [styles['itemActive']] : []),
              ...(!enabled ? [styles['itemDisabled']] : []),
              ...(item.danger ? [styles['itemDanger']] : []),
              ...(item.confirm != null ? [styles['itemConfirm']] : []),
            ].join(' ')}
            data-confirm={confirming?.index === index ? (confirming.armed ? 'armed' : 'locked') : undefined}
            onPointerMove={() => {
              if (panel.active !== index) onHover(level, enabled ? index : undefined);
            }}
            onClick={() => {
              if (enabled) onActivate(level, index);
            }}
          >
            {anyChecks && <span className={styles['check']}>{checkable && item.checked && <FiCheck aria-hidden />}</span>}
            {item.confirm != null ? (
              // Both in one cell, so the menu doesn't change width when the item asks.
              <span className={[styles['label'], styles['confirmLabels']].join(' ')}>
                <span aria-hidden={confirming?.index === index || undefined}>{cleanLabel(item.label)}</span>
                <span aria-hidden={confirming?.index !== index || undefined}>{item.confirm}</span>
              </span>
            ) : <span className={styles['label']}>{cleanLabel(item.label)}</span>}
            <Keys item={item} />
            {submenu && <FiChevronRight aria-hidden className={styles['chevron']} />}
          </div>
        );
      })}
    </div>
  );
}

/** Input types that hold text a user can select and edit. */
const textInputTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

function getEditableField(target: EventTarget | null) {
  if (!(target instanceof Element)) return undefined;
  const field = target.closest<HTMLElement>('input, textarea, [contenteditable=""], [contenteditable="true"]');
  if (field == null) return undefined;
  if (field instanceof HTMLInputElement && !textInputTypes.has(field.type)) return undefined;
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.disabled) return undefined;
  return field;
}

const fieldHasSelection = (field: HTMLElement) => {
  try {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.selectionStart != null && field.selectionStart !== field.selectionEnd;
  } catch {
    // Inputs like type=number say nothing about their selection.
  }
  return (window.getSelection()?.toString() ?? '') !== '';
};

/** Mounted once: shows the menu opened with openMenu(), and a text field's or a selection's own menu on right-click. */
export default function MenuHost({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<OpenMenuOptions>();
  const [takeFocus, setTakeFocus] = useState(true);
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [confirming, setConfirming] = useState<{ level: number, index: number, armed: boolean }>();
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();
  const confirmingRef = useRef(confirming);
  const panelEls = useRef<(HTMLDivElement | null)[]>([]);
  const submenuTimer = useRef<ReturnType<typeof setTimeout>>();
  // What had focus before the menu opened: it gets it back (a text field, for its edit actions).
  const returnFocus = useRef<HTMLElement | null>(null);
  const optionsRef = useRef<OpenMenuOptions>();
  const panelsRef = useRef<PanelState[]>([]);
  useLayoutEffect(() => {
    optionsRef.current = options;
    panelsRef.current = panels;
    confirmingRef.current = confirming;
  }, [confirming, options, panels]);

  const close = useCallback((restoreFocus = true) => {
    clearTimeout(submenuTimer.current);
    clearTimeout(confirmTimer.current);
    setConfirming(undefined);
    const { current } = optionsRef;
    if (current == null) return;
    optionsRef.current = undefined;
    setOptions(undefined);
    setPanels([]);
    const target = returnFocus.current;
    returnFocus.current = null;
    // Opened from the keyboard, focus goes back to what opened it; a text field never lost it. Opened with the mouse, the
    // page gets it (the app's shortcuts only work from there), as after a click on any button.
    if (restoreFocus && current.keyboard && target?.isConnected) target.focus({ preventScroll: true });
    else if (getEditableField(target) == null && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    current.onClose?.();
  }, []);

  useEffect(() => {
    host = (next) => {
      if (next == null) {
        close();
        return;
      }
      // One menu at a time: another one opening replaces it (its owner hears that it closed).
      const previous = optionsRef.current;
      if (previous != null) previous.onClose?.();
      else returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      clearTimeout(submenuTimer.current);
      clearTimeout(confirmTimer.current);
      setConfirming(undefined);
      const items = visibleItems(next.items);
      const anchor = next.at instanceof HTMLElement ? next.at.getBoundingClientRect() : next.at;
      const first = items.findIndex((item) => isEnabled(item));
      optionsRef.current = next;
      setOptions(next);
      // Typing in a field: it keeps focus while its menu is open (the keyboard works the menu all the same).
      setTakeFocus(next.keyboard === true || getEditableField(returnFocus.current) == null);
      setPanels([{ items, active: next.keyboard && first !== -1 ? first : undefined, open: undefined, anchor, beside: false }]);
    };
    return () => {
      host = undefined;
    };
  }, [close]);

  const openSubmenu = useCallback((level: number, index: number, highlightFirst: boolean) => {
    setPanels((current) => {
      const parent = current[level];
      const item = parent?.items[index];
      const rect = panelEls.current[level]?.querySelector(`[data-index="${index}"]`)?.getBoundingClientRect();
      if (parent == null || item?.submenu == null || rect == null) return current;
      const items = visibleItems(item.submenu);
      const first = items.findIndex((entry) => isEnabled(entry));
      return [...current.slice(0, level), { ...parent, active: index, open: index }, { items, active: highlightFirst && first !== -1 ? first : undefined, open: undefined, anchor: rect, beside: true }];
    });
  }, []);

  const onHover = useCallback((level: number, index: number | undefined) => {
    clearTimeout(submenuTimer.current);
    setPanels((current) => {
      const panel = current[level];
      if (panel == null) return current;
      // Leaving a menu for its open submenu keeps that item highlighted.
      if (index == null && panel.open != null) return current;
      return current.map((p, i) => (i === level ? { ...p, active: index } : p));
    });
    if (index == null) return;
    const item = panelsRef.current[level]?.items[index];
    const panel = panelsRef.current[level];
    if (item != null && hasSubmenu(item)) {
      if (panel?.open !== index) submenuTimer.current = setTimeout(() => openSubmenu(level, index, false), submenuDelayMs);
    } else if (panel?.open != null) {
      // On another item: its submenu goes after a moment (time to cross over to it).
      submenuTimer.current = setTimeout(() => setPanels((current) => current.slice(0, level + 1).map((p, i) => (i === level ? { ...p, open: undefined } : p))), submenuDelayMs);
    }
  }, [openSubmenu]);

  const activate = useCallback((level: number, index: number) => {
    const item = panelsRef.current[level]?.items[index];
    if (item == null || !isEnabled(item)) return;
    if (hasSubmenu(item)) {
      openSubmenu(level, index, false);
      return;
    }
    if (item.confirm != null) {
      const { current } = confirmingRef;
      if (current?.level !== level || current.index !== index) {
        clearTimeout(confirmTimer.current);
        setConfirming({ level, index, armed: false });
        confirmTimer.current = setTimeout(() => setConfirming((c) => (c?.level === level && c.index === index ? { ...c, armed: true } : c)), confirmLockMs);
        return;
      }
      // Still locked: a double-click doesn't do it.
      if (!current.armed) return;
    }
    const field = returnFocus.current;
    close();
    // After the menu has gone and focus is back, as a system menu does it.
    setTimeout(() => {
      if (item.click != null) {
        item.click();
      } else if (isEditRole(item.role)) {
        field?.focus({ preventScroll: true });
        window.require('@electron/remote').getCurrentWebContents()[item.role]();
      }
    }, 0);
  }, [close, openSubmenu]);

  // Right-clicking a text field (or selected text) where nothing else has a menu: its edit actions.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const field = getEditableField(e.target);
      let items: MenuEntry[];
      if (field != null) {
        const readOnly = (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.readOnly;
        const selected = fieldHasSelection(field);
        items = [
          { label: t('Undo'), role: 'undo', accelerator: 'CmdOrCtrl+Z', enabled: !readOnly },
          { label: t('Redo'), role: 'redo', accelerator: isMac ? 'Shift+CmdOrCtrl+Z' : 'Ctrl+Y', enabled: !readOnly },
          { type: 'separator' },
          { label: t('Cut'), role: 'cut', accelerator: 'CmdOrCtrl+X', enabled: selected && !readOnly },
          { label: t('Copy'), role: 'copy', accelerator: 'CmdOrCtrl+C', enabled: selected },
          { label: t('Paste'), role: 'paste', accelerator: 'CmdOrCtrl+V', enabled: !readOnly },
          { type: 'separator' },
          { label: t('Select All'), role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        ];
      } else if ((window.getSelection()?.toString() ?? '').trim() !== '') {
        items = [
          { label: t('Copy'), role: 'copy', accelerator: 'CmdOrCtrl+C' },
          { type: 'separator' },
          { label: t('Select All'), role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        ];
      } else {
        return;
      }
      e.preventDefault();
      if (field != null && document.activeElement !== field) field.focus({ preventScroll: true });
      openMenu({ items, at: { x: e.clientX, y: e.clientY } });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [t]);

  // The keyboard drives the deepest open menu, and nothing else while a menu is open.
  useEffect(() => {
    if (options == null) return undefined;
    const move = (panel: PanelState, from: number | undefined, step: 1 | -1) => {
      const { items } = panel;
      for (let n = 1; n <= items.length; n += 1) {
        const i = ((((from ?? (step === 1 ? -1 : items.length)) + step * n) % items.length) + items.length) % items.length;
        if (isEnabled(items[i]!)) return i;
      }
      return from;
    };
    const setActive = (level: number, active: number | undefined) => setPanels((current) => current.map((p, i) => (i === level ? { ...p, active } : p)));
    const onKeyDown = (e: KeyboardEvent) => {
      const { current } = panelsRef;
      const level = current.length - 1;
      const panel = current[level];
      if (panel == null) return;
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        close();
        return;
      }
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      switch (e.key) {
        case 'Escape': {
          if (level > 0) setPanels(current.slice(0, level).map((p, i) => (i === level - 1 ? { ...p, open: undefined } : p)));
          else close();
          break;
        }
        case 'ArrowDown': {
          setActive(level, move(panel, panel.active, 1));
          break;
        }
        case 'ArrowUp': {
          setActive(level, move(panel, panel.active, -1));
          break;
        }
        case 'Home': {
          setActive(level, move(panel, undefined, 1));
          break;
        }
        case 'End': {
          setActive(level, move(panel, undefined, -1));
          break;
        }
        case 'ArrowRight': {
          const item = panel.active != null ? panel.items[panel.active] : undefined;
          if (item != null && hasSubmenu(item) && isEnabled(item)) openSubmenu(level, panel.active!, true);
          else optionsRef.current?.onNavigate?.(1);
          break;
        }
        case 'ArrowLeft': {
          if (level > 0) setPanels(current.slice(0, level).map((p, i) => (i === level - 1 ? { ...p, open: undefined } : p)));
          else optionsRef.current?.onNavigate?.(-1);
          break;
        }
        case 'Enter':
        case ' ': {
          if (panel.active != null) activate(level, panel.active);
          break;
        }
        default: {
          // A letter goes to the next item starting with it.
          if (e.key.length === 1) {
            const letter = e.key.toLocaleLowerCase();
            const start = panel.active ?? -1;
            for (let n = 1; n <= panel.items.length; n += 1) {
              const i = (start + n) % panel.items.length;
              const item = panel.items[i]!;
              if (isEnabled(item) && cleanLabel(item.label).toLocaleLowerCase().startsWith(letter)) {
                setActive(level, i);
                break;
              }
            }
          }
        }
      }
    };
    const onBlur = () => close(false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [activate, close, openSubmenu, options]);

  return (
    <>
      {children}
      {options != null && createPortal(
        // Covers the window: a click outside the menu closes it and does nothing else, as with a system menu.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className={styles['layer']}
          data-app-menu=""
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            if (!optionsRef.current?.onOutsidePointer?.({ x: e.clientX, y: e.clientY, type: 'down' })) close(false);
          }}
          onPointerMove={(e) => {
            if (e.target === e.currentTarget) optionsRef.current?.onOutsidePointer?.({ x: e.clientX, y: e.clientY, type: 'move' });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (e.target === e.currentTarget) close(false);
          }}
          onWheel={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          {panels.map((panel, level) => (
            <MenuPanel
              // eslint-disable-next-line react/no-array-index-key
              key={level}
              panel={panel}
              level={level}
              label={level === 0 ? options.label : undefined}
              takeFocus={takeFocus}
              confirming={confirming?.level === level ? confirming : undefined}
              onHover={onHover}
              onActivate={activate}
              panelRef={(el) => {
                panelEls.current[level] = el;
              }}
            />
          ))}
        </div>,
        document.getElementById('app-root') ?? document.body,
      )}
    </>
  );
}
