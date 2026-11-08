# Clip speed, zoom/crop and text

## Speed

- Press `Ctrl+R`, or right-click a clip and choose **Speed**, to show the clip's
  speed strip. Drag its right edge outward to slow the clip down (the strip turns
  amber) or inward to speed it up. The strip shows the percentage and the new
  length while you drag. Speeds snap to 100% near normal speed. Press Escape
  mid-drag to cancel.
- The timeline shows the edit as it plays. A retimed clip takes up its new length,
  and everything after it (other clips, gaps, text, waveform) moves to make room,
  so clips never overlap. While dragging, the scale stays fixed; hold the cursor at
  either edge to scroll the timeline. It refits when you let go.
- Click the percentage, or right-click the strip, for presets (25%–400%),
  **Custom speed…**, **Remove speed change**, or **Hide speed controls (keep
  speed)**. Double-click the strip for an exact percentage.
- Preview and export use the same speed; exported audio keeps its pitch.

In advanced mode the speed bar has its own row above the segments. Right-click a
segment for **Speed controls** or **Change speed…**; double-click the bar's edge to
reset to 100%, and the **×** on the selected bar removes the speed change.

## Zoom and crop

- Click **Zoom / Crop** under the preview, or choose **Zoom / Crop…** from the
  clip's right-click menu. Drag a corner handle to resize the frame, drag inside
  it to move it, or scroll over it to zoom. The label on the frame shows the output
  size. The frame keeps the recording's aspect ratio, from 1× to 16×.
- The toolbar over the video has zoom out/in, a zoom slider, **Reset** (full
  picture) and **Done**. Enter finishes, Escape cancels a drag or closes the
  controls, and arrow keys move or resize a focused handle (Shift for larger
  steps). The crop belongs to the clip, so trimming the clip keeps it.

## Saving and export

Speed and crop belong to each clip. A duplicate starts with the same settings and
can then be changed on its own, and splitting a clip keeps both settings in each
piece. Undo treats a finished drag as one step. Saved projects keep speed and crop,
and older projects still load.

Separate and merged exports apply the edits. Cropped video scales back to the
recording's size, so clips with different crops can share one output frame. Text
is drawn after cropping. Rotation is applied before the crop. A **Fit a file
size** export plans for the edited length and still stays under the size you pick
(20 MB by default).

Speed and crop need re-encoding. With them, an **Original quality** export can be
MP4, MOV or MKV; a **Fit a file size** export is MP4. In advanced mode, a chapters-only
export keeps the original video, and markers and inverted cut ranges don't offer
speed or crop controls.

## Text boxes

A text box keeps its font size and grows to fit every line, so multi-line text is
never clipped. Drag the box to move it (it snaps to the centre), a side handle to
change how wide it wraps, and a corner handle to make the text bigger or smaller.
Double-click a box to type in it. The preview and the export wrap lines the same
way.
