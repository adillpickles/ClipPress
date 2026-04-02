# Documentation

Please read the documentation before creating an issue. Thank you Ã°Å¸â„¢Â

## FAQ

- **Q:** Is there a keyboard shortcut to do X?
  - **A:** First check the Keyboard shortcuts dialog. If you cannot find your shortcut there, it may not be available yet.
- **Q:** Can ClipPress be automated using a CLI, API, or external post-processing?
  - **A:** ClipPress includes a [basic CLI](cli.md) and a [HTTP API](api.md), but it is still primarily designed for fast interactive clipping rather than full automation pipelines.
- **Q:** I cannot find a particular button or function.
  - **A:** Click the "advanced view" (baby icon) in the bottom left to enable additional functionality.
- **Q:** Where's the "Export options" dialog?
  - **A:** Click the icon next to the export button (bottom right, "advanced view") to toggle whether to show this dialog before each export.
- **Q:** How to *cut away* a middle part of a video?
  - **A:** Click the Yin Yang symbol ("advanced view"). It will invert the segments.
- **Q** What's the difference between repository builds and store or community-packaged builds?
  - **A** Repository builds may move faster and may include newer changes sooner. Store or community-packaged builds can add their own packaging constraints and may trail behind. They should be functionally similar, but platform restrictions can still apply.
- **Q**: What are all these `.llc` files that get created?
  - **A***: They store your segments so that when you exit and reopen ClipPress you can continue where you left off. You can disable project autosave in app settings.

## Commonly requested features

- **Q:** Can ClipPress **crop, resize, stretch, mirror/flip, overlay text/images, watermark, blur, redact, create GIFs, build slideshows, burn subtitles, color grade, add transitions, or do complex audio mixing**?
  - **A:** No. ClipPress is focused on fast clipping, remuxing, and simple export workflows. It now includes a straightforward size-limited export mode for shareable clips, but it is still not intended to be a full general-purpose editing or effects suite.
- **Q:** When will you implement feature X?
  - **A:** There is no guaranteed timeline. Priorities usually go to the work that keeps ClipPress stable and to the requests that are clearly useful to the most people.
- **Q:** Can ClipPress do the same batch conversion operation on multiple files?
  - **A:** Probably not, but [you can probably do it yourself!](batch.md)
- **Q:** Is ClipPress a portable app? Where are application data, settings, and temp files stored?
  - **A:** ClipPress is not a fully portable app. See [Installation and files](installation.md).
- **Q:** Can I export and replace the input file in-place?
  - **A:** No, but you can export and automatically delete the input file.
- **Q:** Can you publish through winget, Flatpak, Docker, or other software managers?
  - **A:** The project does not currently maintain more build systems, but it can still link to externally maintained packaging efforts.
- **Q:** How to sync/shift audio/video tracks?
  - **A:** This is not natively supported. It currently requires a workaround outside the normal clipping flow.
- **Q:** How do I overwrite input file?
  - **A:** That is intentionally not supported by design.
- **Q:** Can ClipPress remember more choices, selections, and settings?
  - **A:** Some settings are already remembered, and more may be added over time.
- **Q:** Does ClipPress allow me to cut or merge multiple files in the same timeline?
  - **A:** No. Multi-file editing still has to be done in multiple steps.

See also [Ã°Å¸â€œÂ Recipe cookbook](recipes.md).

## Troubleshooting

If you have a problem with the app or with a file, please see the [Ã°Å¸Â¤â€ Troubleshooting, known issues and limitations](troubleshooting.md).

## Usage: Typical workflow

- **Drag and drop** a video file into player or use <kbd>Ã¢Å’Ëœ</kbd>/<kbd>CTRL</kbd> + <kbd>O</kbd>.
- <kbd>SPACE</kbd> to play/pause or <kbd>Ã¢â€ Â</kbd> <kbd>Ã¢â€ â€™</kbd> <kbd>,</kbd> <kbd>.</kbd> or mouse/trackpad wheel to seek back/forth.
- Set the start/end times of the current segment by first moving the timeline cursor and then pressing <kbd>I</kbd> to set start time and <kbd>O</kbd> to set end time. You can also press hold <kbd>SHIFT</kbd> while dragging a segment with the mouse to move or resize it
- <kbd>+</kbd> to create a new segment.
- <kbd>B</kbd> to split the segment at the timeline cursor.
- <kbd>BACKSPACE</kbd> to remove cutpoint/segment.
- If you create segments without an end time, it is a [marker](#markers) instead of a segment.
  - Note that when exporting, all segments you create will be **preserved** and exported as new files. You can change this behavior with the **Yin Yang** symbol Ã¢ËœÂ¯Ã¯Â¸Â, in which case the behaviour is inverted and ClipPress will instead **skip** all selected segments and export the parts **between** segments as files.
  - Also note that start times will not be accurate, see [Known issues](troubleshooting.md).
- *(optional)* <kbd>+</kbd> to add another segment at the current cursor time. Then select the segment end time with <kbd>O</kbd>.
- *(optional)* If you want to merge all the selected segments into one file after cutting, change the `Export mode` from `Separate files` to `Merge cuts`.
- *(optional)* If you want to export to a certain output folder, press the `Working dir unset` button (defaults to same folder as source file).
- *(optional)* If you want to change orientation, press the **rotation** button.
- *(optional)* By default, most audio, video and subtitle tracks from the input file will be cut and exported. Press the `Tracks` button to customise and/or add new tracks from other files.
- *(optional)* Select a new output format (remux).
- *(optional)* In the right-hand segments panel, right click a segment for options, or drag-drop to reorder. Segments will appear in this order in the merged output.
- **When done, press the `Export` button (or <kbd>E</kbd>) to show an overview with export options.**
- *(optional)* Adjust any export options.
- *(optional)* Choose **Limit file size** if you want ClipPress to create a shareable MP4 that stays under a target size.
- *(optional)* Change the [Output file name template](file-name-template.md).
- **Then press `Export` again to confirm the export**
- Press the **Camera** button (or <kbd>C</kbd>) if you want to take a JPEG/PNG snapshot from the current time.
- If you want to move the original file to trash, press the **trash** button.
- For best results you may need to trial and error with another output format (Matroska can hold nearly everything), change keyframe cut mode or disable some tracks (see [known issues](troubleshooting.md)).
- Press <kbd>SHIFT</kbd> + <kbd>/</kbd> to view and edit all keyboard & mouse shortcuts.
- **Note:** The original video file will not be modified. Instead, a file is created file in the same directory as the original file with from/to timestamps in the file name.
- See Keyboard shortcuts dialog for more custom actions. (<kbd>SHIFT</kbd> + <kbd>/</kbd>)

## Primer: Video/audio codecs vs. formats

Here's a little primer about video and audio formats for those not familiar. A common mistake when dealing with audio and video files is to confuse *formats*, *codecs*, and *file names*. In short: a file's media format is a *container* that holds one or more *codecs* (audio, video, subtitle) inside it. For example `.mov` is a *container format*, and `H265` or `HEVC` is a *codec*. Some formats support only a few kinds of codecs inside them, while others support almost all codecs. In ClipPress you can view, keep, remove, and edit tracks from the source media.

**Remuxing**: If you change the output format in ClipPress and export a file, you are *remuxing* the tracks and codecs into a different container format. In theory this is lossless, meaning the codec data stays the same even though the container changes.

If you want to reduce the size of a file in ClipPress, you have a few different options:
- Reduce the duration of the file (cut off start/end)
- Remove one or more tracks/streams (e.g. remove an audio track that you don't need)
- Use the built-in size-limited export mode for a simple re-encoded shareable clip

Outside of those options, reducing size generally requires re-encoding.

Here is a great introduction to audio/video: [howvideo.works](https://howvideo.works/).

## Segments

Segments are the first-class citizens of ClipPress. A segment is a time-slice of your source media file, defined by a *start time* and an *end time*. When a segment has no *end time*, it's called a *[marker](#markers)*.
Segments have a segment number (their export order), and can optionally have a label and tags. Segments are be the basis of what gets exported.

### Markers

A segment that has no *end time* is called a *marker*. It has no length and will be excluded from exports, but behaves similarly to segments. Markers are distinctively visualized on the timeline with a vertical line and a number on top. You can convert markers to segments by setting their out-point (<kbd>O</kbd>). This can be done manually or automated with one of the many tools in ClipPress.

## Tracks

Tracks are different from segments, in that they run in parallel. For example, most videos have one video track and one audio track. When cutting, ClipPress cuts all enabled tracks equally, although there are some tracks that [cannot be cut](troubleshooting.md). The Tracks panel is used to selectively enable or disable tracks for export and to edit track or file metadata.

## Import/export projects

ClipPress project files use the `.llc` extension and JSON5 format. They contain information about the segments in your timeline. ClipPress also allows importing and exporting projects in a variety of formats.

### CSV files

- The CSV export/import function takes CSV files with one cut segment on each line. Each line contains three columns: `segment start`, `segment end`, `label`.
- `segment start` and `segment end` are expressed in seconds. `segment end` may be empty, in that case it's a marker.
- Use comma `,` to separate the fields (**not** semicolon `;`)

#### Example `.csv` file

```csv
,56.9568,First segment starting at 0
70,842.33,"Another quoted label"
1234,,Last marker starting at 1234 seconds
```

### TSV files

Same as CSV but `<tab>` instead.

## More

- [Ã°Å¸Â¤â€ Troubleshooting, known issues and limitations](troubleshooting.md)
- [Ã°Å¸â€œÂ Recipe cookbook](recipes.md)
- [Ã°Å¸â€œÂ² Installation](installation.md)
- [Ã¢Å“â€¦ Requirements](requirements.md)
- [Ã°Å¸â€˜Â¨Ã¢â‚¬ÂÃ°Å¸â€™Â» JavaScript expressions](expressions.md)
- [Ã°Å¸Â¦Â¾ Batch processing](batch.md)
- [Ã°Å¸â€œâ€ž Export file name template documentation](file-name-template.md).
- [Ã°Å¸â€™Â» Command line interface (CLI)](cli.md)
- [Ã°Å¸â€¢Â¸Ã¯Â¸Â HTTP API](api.md)
