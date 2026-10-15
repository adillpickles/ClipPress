# Segment speed and zoom/crop

These features are new in `0.1.0-beta.5`. Beta 4 and earlier downloads do not
include them.

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
  (25%–400%), **Custom speed…**, **Remove speed change**, or **Hide speed controls
  (keep speed)**. The **×** on the selected bar removes the speed change, like deleting
  a retime in Resolve.
- **Change speed…** in the segment menu opens a dialog for an exact percentage.
  Preview and export use the same rate; exported audio keeps its pitch.
- Choose **Zoom / Crop…** from the segment's menu, or click **Zoom / Crop** under
  the preview. The crop frame looks like a text box: drag a round corner handle to
  resize, drag inside (or the **Crop** tab, which shows the output size) to move it,
  or scroll over it to zoom. The frame keeps the source's aspect ratio, from 1× to 4×.
- The toolbar over the video has zoom out/in, a zoom slider, **Reset** (full frame)
  and **Done**. Enter finishes, Escape cancels a gesture or closes the controls, and
  arrow keys move or resize a focused handle (Shift for larger steps). The crop
  belongs to the clip, so trimming the clip keeps it.

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
