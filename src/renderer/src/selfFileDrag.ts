// A file dragged out of ClipPress (an exported clip) passes over its own window too: that isn't a file to open.
let dragging = false;

export function isSelfFileDrag() {
  return dragging;
}

/** Runs a file drag started here. On Windows, Electron's startDrag returns once the file is dropped or the drag ends. */
export async function runSelfFileDrag(drag: () => Promise<void>) {
  dragging = true;
  try {
    await drag();
  } finally {
    dragging = false;
  }
}
