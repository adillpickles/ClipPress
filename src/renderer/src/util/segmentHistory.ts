// Shape of the history object returned by react-use's `useStateWithHistory`.
// `history` is the live array the hook mutates, so emptying it here really does
// discard the entries; `go` moves the cursor and pushes the entry into state.
export interface SegmentHistoryLike<T> {
  history: T[][],
  go: (position: number) => void,
}

/**
 * Drops every entry from the segment history and leaves a single empty one.
 *
 * Overwriting only `history[0]` leaves the forward entries in place, so redo could
 * resurrect the previous file's segments after a new file was opened. It also fails
 * to reset state when the history has grown past its capacity, because the hook
 * slices the array and index 0 is no longer the initial entry.
 */
export function resetSegmentHistory<T>(historyState: SegmentHistoryLike<T>) {
  const { history } = historyState;
  history.length = 0;
  history.push([]);
  historyState.go(0);
}
