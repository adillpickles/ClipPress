/**
 * With Chromium's customizable select, an open dropdown list is part of the page, so Escape (which closes
 * the list) also reaches the page's key handlers: Radix dialogs and the export sheet would close too. This
 * stops such an Escape from propagating before anything else sees it; the list still closes, because that
 * is the select's own default action and nothing calls preventDefault.
 */
export function isEscapeOnOpenSelect(e: Pick<KeyboardEvent, 'key' | 'target'>) {
  if (e.key !== 'Escape' || !(e.target instanceof Element)) return false;
  const select = e.target.closest('select');
  if (select == null) return false;
  // While the list is open, focus is on one of its options.
  if (e.target instanceof HTMLOptionElement) return true;
  try {
    return select.matches(':open');
  } catch {
    return false;
  }
}

export function installSelectEscapeGuard(target: Window = window) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isEscapeOnOpenSelect(e)) e.stopPropagation();
  };
  // Window capture runs before the document-level listeners Radix uses.
  target.addEventListener('keydown', onKeyDown, { capture: true });
  return () => target.removeEventListener('keydown', onKeyDown, { capture: true });
}
