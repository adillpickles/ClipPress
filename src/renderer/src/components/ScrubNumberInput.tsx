import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';

import styles from './ScrubNumberInput.module.css';

/** Pixels of dragging per step. */
const pxPerStep = 3;
/** A press that moves less than this is a click: it puts the caret in the field to type. */
const clickSlopPx = 3;

/**
 * A number field that is also a scrubber, as in Figma or Blender: press anywhere on it and drag up to raise the value,
 * down to lower it, in `step`s (`fineStep` with Shift); click without dragging to type. While dragging, the pointer is
 * locked, so the drag never runs out of screen. Arrow keys step too.
 */
export default function ScrubNumberInput({ id, value, onChange, min, max, step, fineStep = 1, unit, label, title, invalid = false, autoFocus = false, style }: {
  id?: string,
  value: string,
  onChange: (newValue: string) => void,
  min: number,
  max: number,
  step: number,
  fineStep?: number,
  unit?: string,
  label: string,
  title?: string,
  invalid?: boolean,
  autoFocus?: boolean,
  style?: CSSProperties,
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startValue: number, distance: number, moved: boolean, pointerId: number, lastY: number }>();
  const [scrubbing, setScrubbing] = useState(false);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const numeric = () => {
    const n = Number(value);
    return Number.isFinite(n) ? n : clamp(100);
  };
  // On the step grid (fine steps with Shift), so dragging lands on round values.
  const onGrid = (v: number, grid: number) => clamp(Math.round(v / grid) * grid);

  // Even while typing in it: a press that drags scrubs, one that doesn't selects the number to type over (a short
  // number has no use for placing the caret by mouse or selecting part of it).
  const onPointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startValue: numeric(), distance: 0, moved: false, pointerId: e.pointerId, lastY: e.clientY };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLInputElement>) => {
    const drag = dragRef.current;
    if (drag == null) return;
    // Up is more: screen y grows downwards. Locked, the pointer stays put and only says how far it moved.
    const locked = document.pointerLockElement === e.currentTarget;
    drag.distance -= locked ? e.movementY : e.clientY - drag.lastY;
    drag.lastY = e.clientY;
    if (!drag.moved) {
      if (Math.abs(drag.distance) < clickSlopPx) return;
      drag.moved = true;
      setScrubbing(true);
      // Locked, the pointer can't hit the screen's edge; without it (refused), dragging still works up to the edge.
      // The lock comes a moment later: one that arrives after letting go is let go of at once.
      const element = e.currentTarget;
      element.requestPointerLock?.()?.then?.(() => {
        if (dragRef.current !== drag && document.pointerLockElement === element) document.exitPointerLock();
      }, () => undefined);
    }
    const grid = e.shiftKey ? fineStep : step;
    onChange(String(onGrid(drag.startValue + (drag.distance / pxPerStep) * fineStep, grid)));
  };

  const endDrag = (e: ReactPointerEvent<HTMLInputElement>) => {
    const drag = dragRef.current;
    if (drag == null) return;
    dragRef.current = undefined;
    if (e.currentTarget.hasPointerCapture(drag.pointerId)) e.currentTarget.releasePointerCapture(drag.pointerId);
    if (document.pointerLockElement === e.currentTarget) document.exitPointerLock();
    setScrubbing(false);
    if (!drag.moved) {
      // A click: type into it, all of it selected.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const grid = e.shiftKey ? fineStep : step;
    const direction = e.key === 'ArrowUp' ? 1 : -1;
    // From an off-grid value, the first step lands on the grid.
    const current = numeric();
    const next = onGrid(current + direction * grid, grid);
    onChange(String(next === current ? clamp(current + direction * grid) : next));
  };

  return (
    <span className={[styles['field'], ...(scrubbing ? [styles['scrubbing']] : []), ...(invalid ? [styles['invalid']] : [])].join(' ')} style={style}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        className={styles['input']}
        value={value}
        onChange={(e) => onChange(e.target.value.replaceAll(/[^\d.]/g, ''))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        // Tabbed to (or focused as the dialog opens): typing replaces the number.
        onFocus={(e) => e.currentTarget.select()}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={invalid}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number.isFinite(Number(value)) ? Number(value) : undefined}
        title={title}
        maxLength={String(max).length + 2}
        spellCheck={false}
      />
      {unit != null && <span className={styles['unit']} aria-hidden>{unit}</span>}
    </span>
  );
}
