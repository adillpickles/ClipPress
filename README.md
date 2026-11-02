# ClipPress

ClipPress is a fast open-source clip editor for turning long recordings into clean, shareable clips. It is built for the simple workflow most people actually want: open a recording, mark `I` and `O`, optionally add text or change the volume, then export something ready to send in Discord or anywhere else.

Website: [clippress.app](https://www.clippress.app)

[![Support ClipPress](https://img.shields.io/badge/Support%20ClipPress-Ko--fi-ff5e5b?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/adillpickles)

ClipPress is open-source and ad-free. If it helps you make better clips or saves you time, consider tipping any amount to support development.

## Highlights

- Fast `I` / `O` clip workflow for quick exports
- A simple editor by default; the classic editor with frame-by-frame tools is in Settings > General > Advanced mode
- Text on the video for quick callouts and captions
- Volume for the whole audio track or a single clip
- Speed for each clip, with audio that keeps its pitch
- Zoom and crop for each clip, right on the preview
- Export in the original quality, or under a file size you pick (20 MB by default)
- Automatic GPU acceleration on NVIDIA, AMD and Intel graphics, with CPU fallback ([details](docs/gpu-exports.md))
- Several clips export as one file per clip, one merged file, or both
- Edits save automatically; keyboard shortcuts throughout
- Windows installer with automatic or ask-first updates; a portable EXE as well

## Requirements

Windows 10 or 11, 64-bit.

## Speed and zoom/crop

Press `Ctrl+R`, or right-click a clip and choose **Speed**, to show the clip's
speed strip. Drag its right edge outward to slow the clip down or inward to speed
it up; everything after the clip moves to fit. Click the percentage for presets or
**Custom speed…**. Exported audio keeps its pitch.

Select a clip and click **Zoom / Crop** under the preview, or choose **Zoom /
Crop…** from its right-click menu. Drag a corner to crop, drag inside the frame to
move it, or scroll to zoom. **Reset** brings back the full picture and **Done**
closes the controls. See [clip speed and zoom/crop](docs/segment-editing.md) for
details.

## App updates

The installer keeps ClipPress up to date. In **Settings > Updates**, **When an
update is found** can be **Download it (recommended)** or **Ask me first**.
Updates install when you close ClipPress and take effect on the next launch. See
[automatic updates](docs/automatic-updates.md).

## Built on top of LosslessCut

ClipPress is built on top of [LosslessCut](https://github.com/mifi/lossless-cut) by Mikael Finstad and the LosslessCut contributors. Big thanks for the open-source foundation that made ClipPress possible.

## Download / develop

- Downloads: the installer and the portable EXE are on the [Releases page](https://github.com/adillpickles/ClipPress/releases) and at [clippress.app](https://www.clippress.app)
- Installation notes: [docs/installation.md](docs/installation.md)
- Local development: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

ClipPress is licensed under [GPL-2.0-only](LICENSE).
