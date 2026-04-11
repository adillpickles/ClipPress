# Documentation

Please read the documentation before creating an issue. Thank you.

## FAQ

- **Q:** Is there a keyboard shortcut to do X?
  - **A:** First check the Keyboard Shortcuts dialog. If you cannot find a shortcut there, it may not be available yet.
- **Q:** Can ClipPress be automated using a CLI, API, or external post-processing?
  - **A:** ClipPress includes a [basic CLI](cli.md) and a [HTTP API](api.md), but it is still primarily designed for fast interactive clipping rather than full automation pipelines.
- **Q:** I cannot find a particular button or function.
  - **A:** Switch from Simple mode to Advanced mode in the app header to reveal more functionality.
- **Q:** Where are the export options?
  - **A:** Export opens the export panel as part of the normal flow. Some export behavior can also be adjusted in Settings.
- **Q:** How do I cut away a middle part of a video?
  - **A:** Use segment inversion in Advanced mode if you want to export the gaps instead of the selected segments.
- **Q:** What's the difference between repository builds and store or community-packaged builds?
  - **A:** Repository builds may move faster and may include newer changes sooner. Store or community-packaged builds can add their own packaging constraints and may trail behind.
- **Q:** What are the `.llc` files that get created?
  - **A:** They store your project segments so you can close and reopen ClipPress without losing your work. You can disable project autosave in Settings.

See also the [Recipe cookbook](recipes.md).

## Troubleshooting

If you have a problem with the app or with a file, please see [Troubleshooting, known issues and limitations](troubleshooting.md).

## Typical workflow

- Drag and drop a clip into the app, or press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>O</kbd>.
- Use <kbd>Space</kbd> to play or pause, and use the arrow keys, <kbd>,</kbd>, <kbd>.</kbd>, or the mouse wheel to seek.
- Press <kbd>I</kbd> to mark the start of a clip and <kbd>O</kbd> to mark the end.
- Create more segments if needed. In the right-hand Clips panel you can review, reorder, and export them as separate clips, one merged clip, or both.
- Optionally add a text overlay, tweak audio gain, remove tracks, or switch to a target-file-size export.
- Press <kbd>E</kbd> or click **Export**, review the export panel, then confirm the export.
- Press <kbd>Shift</kbd> + <kbd>/</kbd> to view and edit keyboard shortcuts.

The original source file is never modified. ClipPress always writes a new exported file instead.

## Primer: containers vs. codecs

A media file's format is a *container* that can hold one or more *codecs* inside it. For example, `.mov` is a container format and `H265` / `HEVC` is a codec. Some containers support only a few kinds of codecs, while others support almost all codecs.

In ClipPress, if you change the output format and export a file, you are *remuxing* the existing streams into a different container. In theory that is lossless, because the codec data stays the same even though the wrapper changes.

If you want to reduce file size in ClipPress, your main options are:

- reduce the clip duration
- remove tracks you do not need
- use the built-in target-file-size export mode for a simple re-encoded shareable clip

Outside of those options, reducing size generally requires re-encoding.

## Segments

Segments are the core building block in ClipPress. A segment is a time slice of your source media file defined by a *start time* and an *end time*. When a segment has no end time, it is a *marker*.

Segments have an export order number and can optionally have a label and tags. They define what gets exported.

### Markers

A segment with no end time is a marker. It has no duration and will be excluded from exports, but it still acts as a saved reference point on the timeline. You can convert a marker into a segment by setting an out-point with <kbd>O</kbd>.

## Tracks

Tracks are separate parallel streams in a file, such as video, audio, and subtitles. ClipPress exports all enabled tracks unless you remove them in the Tracks panel. The Tracks panel can also be used to edit metadata and, in Advanced mode, inspect more detailed stream information.

## Import and export projects

ClipPress project files use the `.llc` extension and JSON5 format. They contain your saved segments and related project state. ClipPress can also import and export a variety of timeline/project formats.

### CSV files

- CSV import/export uses one segment per line.
- Each line contains three columns: `segment start`, `segment end`, and `label`.
- `segment start` and `segment end` are expressed in seconds.
- `segment end` may be empty, in which case the entry is a marker.
- Use comma `,` to separate fields, not semicolon `;`.

#### Example `.csv` file

```csv
,56.9568,First segment starting at 0
70,842.33,"Another quoted label"
1234,,Last marker starting at 1234 seconds
```

### TSV files

Same as CSV, but with `<tab>` as the separator.

## More

- [Troubleshooting, known issues and limitations](troubleshooting.md)
- [Recipe cookbook](recipes.md)
- [Installation](installation.md)
- [Requirements](requirements.md)
- [JavaScript expressions](expressions.md)
- [Batch processing](batch.md)
- [Export file name template documentation](file-name-template.md)
- [Command line interface (CLI)](cli.md)
- [HTTP API](api.md)
