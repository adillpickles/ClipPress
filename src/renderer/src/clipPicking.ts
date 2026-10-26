/**
 * Picking several clips in the Clips panel, as in a file list: Ctrl+click adds or takes away one, Shift+click takes
 * the run from the selected clip to the one clicked, a selection box takes what it touches. Delete removes the picked
 * clips. With none picked, the selected clip is the one Delete takes. (A segment's own `selected` is whether it goes in
 * the export: picking is apart from that.)
 */

export type PickHow = 'one' | 'toggle' | 'range';

/** The picked clips and the selected one after a click on `clickedId`; ids in list order. */
export function pickClip({ ids, picked, currentId, clickedId, how }: {
  ids: readonly string[],
  picked: readonly string[],
  currentId: string | undefined,
  clickedId: string,
  how: PickHow,
}): { picked: string[], currentId: string } {
  if (how === 'one') return { picked: [], currentId: clickedId };
  if (how === 'range') {
    const from = ids.indexOf(currentId ?? clickedId);
    const to = ids.indexOf(clickedId);
    if (from === -1 || to === -1) return { picked: [], currentId: clickedId };
    // The selected clip stays where the run starts, so the next Shift+click runs from it again.
    return { picked: ids.slice(Math.min(from, to), Math.max(from, to) + 1), currentId: currentId ?? clickedId };
  }
  const base = picked.length > 0 ? picked : (currentId != null ? [currentId] : []);
  if (!base.includes(clickedId)) return { picked: ids.filter((id) => base.includes(id) || id === clickedId), currentId: clickedId };
  const rest = base.filter((id) => id !== clickedId);
  // Taken away: another picked clip becomes the selected one, if there's one left.
  if (rest.length === 0) return { picked: [], currentId: clickedId };
  return { picked: ids.filter((id) => rest.includes(id)), currentId: clickedId === currentId ? rest.at(-1)! : currentId ?? rest.at(-1)! };
}

/** The clips a selection box picks: those it touches, added to `before` when Ctrl was held as it started. */
export function pickInBox({ ids, before, touched, additive }: { ids: readonly string[], before: readonly string[], touched: readonly string[], additive: boolean }) {
  return ids.filter((id) => touched.includes(id) || (additive && before.includes(id)));
}

/** What Delete removes: the picked clips still there, else the selected one. */
export function getClipsToRemove({ ids, picked, currentId }: { ids: readonly string[], picked: readonly string[], currentId: string | undefined }) {
  const stillThere = ids.filter((id) => picked.includes(id));
  if (stillThere.length > 0) return stillThere;
  return currentId != null && ids.includes(currentId) ? [currentId] : [];
}
