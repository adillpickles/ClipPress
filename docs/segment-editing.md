# Segment speed and zoom/crop

These features are available in the development branch after Beta 4. The published
Beta 4 installer does not include them.

## Controls

- Press `Ctrl+R` (or right-click a segment → **Speed controls**) to show the
  selected segment's speed bar above the video lane. Drag its right edge outward
  to slow the segment down (amber, spread-out arrows) or inward to speed it up
  (blue, dense arrows). The bar shows the percentage and the new duration while
  you drag. Speeds snap to 100% near normal speed. Press Escape mid-drag to cancel.
- The timeline shows the edit as it plays. A retimed segment takes up its new
  length, and everything after it (other segments, cut gaps, text, waveform)
  ripples left or right to make room, so segments never overlap. While dragging,
  the scale stays fixed; hold the cursor at either edge to scroll the timeline. It
  refits when you let go.
- Double-click the bar's edge to reset to 100%. Click the percentage for presets
  (25%–400%), **Custom speed…**, or **Reset speed to 100%**. The **×** hides the bar
  but keeps the speed, as in Resolve.
- **Change speed…** in the segment menu opens a dialog for an exact percentage.
  Preview and export use the same rate; exported audio keeps its pitch.
- Choose **Zoom / Crop…** from the segment's menu, or click **Zoom / Crop** under
  the preview. Drag a corner to change the frame and drag inside to reposition it.
  The frame keeps the source's aspect ratio. The zoom slider supports 1× to 4×.
- **Reset** restores the full frame. **Done** returns to the cropped preview.
  Arrow keys move or resize a focused frame control; hold Shift for larger steps.
  Escape cancels a gesture, or closes crop controls when no gesture is active.

## Preview, saving, and export

Speed and crop belong to individual segments. A duplicate starts with the same
settings and can then be edited independently. Splitting preserves both settings
in each new piece. Undo/redo records a completed drag as one segment edit. Saved
`.llc` projects include speed and crop, and older projects continue to load.

Separate and merged exports apply the edits. Cropped video scales back to the
displayed source dimensions so different crops can share one output frame. Text
is drawn after cropping and remains positioned in that output frame. Video
rotation is applied before the crop, including rotation stored in display-matrix
metadata. Target-size export budgets use the edited duration and still enforce
the chosen cap; the default is 20 MB.

Applying speed or crop requires encoding. Regular exports support MP4, MOV, and
MKV; target-size exports use MP4. Chapters-only export keeps the original video
and explains that it cannot apply these edits. Unfinished markers and inverted
cut ranges do not offer segment transform controls.

Copy/paste workflow polish remains a separate follow-up. This change keeps the
existing single segment lane and does not add tracks, transitions, or keyframes.

## Text boxes

A text box keeps its font size and grows to fit every line, so multi-line text is
never clipped. Drag the **Text** tab above a selected box to move it, the side
handle to change how wide it wraps, and the corner handle to scale the text up or
down. The preview and the export use the same line wrapping. Projects saved before
this change keep the text size their box height implied.
