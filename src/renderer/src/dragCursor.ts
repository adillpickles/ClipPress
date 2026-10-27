// One cursor for the whole window while a drag runs: the dragged edge moves with the pointer, so the pointer keeps
// landing just outside the small handle that owns the cursor (and the clip, the lane or the playhead's cursor shows).
let current: symbol | undefined;

/** Shows `cursor` everywhere until the returned release is called (a later hold replaces an earlier one). */
export default function holdDragCursor(cursor: string) {
  const root = document.documentElement;
  const token = Symbol('drag-cursor');
  current = token;
  root.style.setProperty('--cp-drag-cursor', cursor);
  root.dataset['dragCursor'] = '';
  return () => {
    if (current !== token) return;
    current = undefined;
    delete root.dataset['dragCursor'];
    root.style.removeProperty('--cp-drag-cursor');
  };
}
