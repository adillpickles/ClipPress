# Segment speed and zoom/crop

These features are available in the development branch after Beta 4. The published
Beta 4 installer does not include them.

## Controls

- Right-click a timeline or list segment and choose **Change speed…**. Enter a
  percentage between 25% and 400%; the dialog shows the resulting duration before
  applying it. The speed layer remains visible after applying the change.
- Press `Ctrl+R` to show or hide the selected segment's speed layer. Drag its
  slider to change speed. Preview and export use the same rate; exported audio
  keeps its pitch.
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
