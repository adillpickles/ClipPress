# ClipPress

ClipPress is a fast open-source clip editor for turning long recordings into clean, shareable clips. It is built for the simple workflow most people actually want: open a clip, mark `I` and `O`, optionally add text or tweak gain, then export something ready to send in Discord or anywhere else.

[![Support ClipPress](https://img.shields.io/badge/Support%20ClipPress-Ko--fi-ff5e5b?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/adillpickles)

ClipPress is open-source and ad-free. If it helps you make better clips or saves you time, consider tipping any amount to support development.

## Highlights

- Fast `I` / `O` clip workflow for quick exports
- Simple mode for the default path, Advanced mode for deeper control
- Text overlays for lightweight callouts and captions
- Per-track audio gain for practical volume fixes
- Per-segment speed controls with pitch-preserving audio
- Per-segment zoom and crop using preview handles
- Keep-source-quality export and target-file-size export
- Multi-segment export as separate clips, one merged clip, or both
- Modern desktop UI with keyboard shortcuts and project save/load

## Speed and zoom/crop

Right-click a timeline segment and choose **Change speed…**, or press `Ctrl+R`
to show its speed layer. The dialog shows the edited duration; drag the layer's
slider for quick adjustments.

Select a segment and click **Zoom / Crop**, or use its right-click menu. Drag a
corner to crop, drag inside the frame to reposition, or use the zoom slider.
**Reset** restores the full frame and **Done** returns to the cropped preview.
Each segment keeps its own speed and crop in saved projects and undo history.
These edits apply to separate and merged exports; target-size exports default to
20 MB. See [segment editing notes](docs/segment-editing.md) for details.

## Built on top of LosslessCut

ClipPress is built on top of [LosslessCut](https://github.com/mifi/lossless-cut) by Mikael Finstad and the LosslessCut contributors. Big thanks for the open-source foundation that made ClipPress possible.

## Install / develop

- Packaged builds: use this repository's Releases page when builds are available
- Installation notes: [docs/installation.md](docs/installation.md)
- Local development: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

ClipPress is licensed under [GPL-2.0-only](LICENSE).
