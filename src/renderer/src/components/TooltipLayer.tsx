import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import renderKeys from './renderKeys';
import { splitKeyboardKeys } from '../util';
import styles from './TooltipLayer.module.css';

/** Hovering waits this long; moving on to another hint soon after one shows it at once. */
const showDelayMs = 450;
const skipDelayMs = 400;
const margin = 8;
const gap = 6;

/**
 * The app's own tooltip for every hint, in place of the system's: an element's `title` (or `data-tip`) is shown in a
 * small bubble in the app's style, with `data-tip-keys` (a key binding, e.g. `ControlLeft+ArrowUp`) as key caps.
 *
 * A `title` would still make Windows show its own tooltip, so each one is taken over as it reaches the page: its text
 * moves to `data-tip` and the attribute stays, empty (React then still changes or removes it, and that's followed).
 * Its text stays readable to screen readers: as the element's name if the title was its only one, else as its
 * description.
 */
/** Whether the element has a name of its own, so a title only describes it. */
function hasOwnName(el: HTMLElement | SVGElement) {
  if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return true;
  // A form field's text is its value or its options, not its name: a <label> names it.
  if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.labels != null && el.labels.length > 0;
  return (el.textContent ?? '').trim() !== '';
}

function adopt(el: Element) {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
  const title = el.getAttribute('title');
  const { dataset } = el;
  if (title === '') return;
  const aria = dataset['tipAria'];
  if (title == null) {
    // React removed the title: so goes everything that came from it.
    if (dataset['tipAdopted'] == null) return;
    delete dataset['tip'];
    delete dataset['tipAdopted'];
    if (aria === 'label') el.removeAttribute('aria-label');
    if (aria === 'description') el.removeAttribute('aria-description');
    delete dataset['tipAria'];
    return;
  }
  dataset['tip'] = title;
  dataset['tipAdopted'] = '';
  if (aria === 'label' || (aria == null && !hasOwnName(el))) {
    el.setAttribute('aria-label', title);
    dataset['tipAria'] = 'label';
  } else if (aria === 'description' || (aria == null && !el.hasAttribute('aria-description'))) {
    el.setAttribute('aria-description', title);
    dataset['tipAria'] = 'description';
  }
  el.setAttribute('title', '');
}

function adoptTree(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.hasAttribute('title')) adopt(node);
  node.querySelectorAll('[title]').forEach((el) => adopt(el));
}

interface Tip { el: HTMLElement, text: string, keys: string | undefined }

const readTip = (el: HTMLElement): Tip | undefined => {
  const text = el.dataset['tip'];
  return text ? { el, text, keys: el.dataset['tipKeys'] || undefined } : undefined;
};

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip>();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<Tip>();
  useLayoutEffect(() => {
    tipRef.current = tip;
  }, [tip]);

  useEffect(() => {
    // Everything is under the body, popovers and dialogs portalled out of the app too.
    adoptTree(document.body);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes') adopt(record.target as Element);
        else record.addedNodes.forEach((node) => adoptTree(node));
      });
      // The hint showing changed its text, or went.
      const { current } = tipRef;
      if (current == null) return;
      if (!current.el.isConnected) setTip(undefined);
      else if (current.el.dataset['tip'] !== current.text) setTip(readTip(current.el));
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The element being hovered (or focused), whose hint shows now or soon.
    let target: HTMLElement | undefined;
    // Pressed: its hint stays away until the pointer leaves it.
    let pressed: HTMLElement | undefined;
    let hiddenAt = 0;

    const hide = () => {
      clearTimeout(timer);
      if (tipRef.current != null) hiddenAt = Date.now();
      target = undefined;
      setTip(undefined);
    };
    const showFor = (el: HTMLElement, immediately: boolean) => {
      clearTimeout(timer);
      target = el;
      const show = () => setTip(readTip(el));
      if (immediately || tipRef.current != null || Date.now() - hiddenAt < skipDelayMs) show();
      else timer = setTimeout(show, showDelayMs);
    };
    const findTip = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('[data-tip]') ?? undefined : undefined);

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = findTip(e.target);
      if (el === target) return;
      if (pressed != null && el !== pressed) pressed = undefined;
      if (el == null || el === pressed) {
        hide();
        return;
      }
      showFor(el, false);
    };
    const onPointerOut = (e: PointerEvent) => {
      // Out of the window.
      if (e.relatedTarget == null) {
        pressed = undefined;
        hide();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      pressed = findTip(e.target);
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = findTip(e.target);
      if (el != null && el === e.target && el.matches(':focus-visible')) showFor(el, true);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (tipRef.current != null && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) hide();
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('wheel', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Below the element, or above it near the bottom of the window; kept inside the window. Placed straight on the
  // element before it's painted.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (tip == null || bubble == null) return;
    const anchor = tip.el.getBoundingClientRect();
    const { width, height } = bubble.getBoundingClientRect();
    let top = anchor.bottom + gap;
    if (top + height + margin > window.innerHeight) top = Math.max(margin, anchor.top - height - gap);
    const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - margin);
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
    bubble.style.visibility = '';
  }, [tip]);

  if (tip == null) return null;
  return createPortal(
    <div
      ref={bubbleRef}
      role="tooltip"
      aria-hidden
      className={styles['bubble']}
      style={{ top: -9999, left: -9999, visibility: 'hidden' }}
    >
      <span className={styles['text']}>{tip.text}</span>
      {tip.keys != null && <span className={styles['keys']}>{renderKeys(splitKeyboardKeys(tip.keys))}</span>}
    </div>,
    document.getElementById('app-root') ?? document.body,
  );
}
