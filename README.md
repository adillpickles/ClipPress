<div align="center">
  <br>
  <p><img src="src/renderer/src/icon.svg" width="120" alt="ClipPress" /></p>
  <p><b>ClipPress</b></p>
  <p>Fast, lightweight desktop video clipping with built-in size-limited export for shareable clips.</p>
  <br>
  <p align="center"><img src="main_screenshot.jpg" width="600" alt="ClipPress screenshot" /></p>
  <br>
</div>

ClipPress is a desktop video clipping app built for fast, practical export workflows. Open a file, mark `I` and `O`, export, and keep moving.

It keeps the fast clipping workflow people like, while adding a simple built-in size-limited export path so clips can be made ready to share without bouncing through a second app.

## Highlights

- Fast clip selection and export workflow
- Lossless trimming, cutting, rearranging, and merging for supported media
- Built-in size-limited export for shareable MP4 clips
- Track selection, metadata editing, and stream extraction tools
- Keyboard-driven workflow with project save/load support
- Snapshots, frame export, chapters, labels, tags, and timeline tools
- CLI and HTTP API support for automation

## Typical uses

- Clip gameplay, screen recordings, and camera footage quickly
- Export short clips that fit under platform upload limits
- Rough-cut large recordings without a full editing timeline
- Merge compatible segments or files together
- Extract tracks, subtitles, or audio from existing media

## Current scope

ClipPress is designed around fast clipping and export, not full timeline editing or motion graphics work.

- It is great for clipping, trimming, merging, remuxing, and simple shareable exports.
- It is not trying to be a full replacement for a traditional editor for cropping, overlays, transitions, color grading, watermarking, or complex compositing.

## Download and setup

- Use this repository's Releases page for packaged builds when available.
- If you are working from source, see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.
- For installation notes, settings locations, and legacy executable/path details, see [docs/installation.md](docs/installation.md).

## Supported formats

ClipPress uses Chromium's HTML5 media playback support for preview, plus FFmpeg for inspection and export operations. Common containers such as `MP4`, `MOV`, `WebM`, `Matroska`, `OGG`, and `WAV` generally work well, along with common audio and video codecs supported by Chromium and FFmpeg.

If a file does not preview natively, ClipPress can often still work with it through FFmpeg-assisted playback or export workflows. See [docs/troubleshooting.md](docs/troubleshooting.md) and [docs/index.md](docs/index.md) for details.

## Documentation

- [Getting started, FAQ, and usage guide](docs/index.md)
- [Installation and files](docs/installation.md)
- [Troubleshooting, known issues, and limitations](docs/troubleshooting.md)
- [CLI](docs/cli.md)
- [HTTP API](docs/api.md)
- [Batch processing notes](docs/batch.md)
- [Export file name templates](docs/file-name-template.md)
- [Contributing](CONTRIBUTING.md)

## Acknowledgment

ClipPress is built from the open-source [mifi/lossless-cut](https://github.com/mifi/lossless-cut) project. Thanks to that project and its contributors for the foundation this app builds on.

## Attributions

- App icon made by [Dimi Kazak](http://www.flaticon.com/authors/dimi-kazak "Dimi Kazak") from [www.flaticon.com](http://www.flaticon.com "Flaticon") is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0").
- [Lottie animation by Chris Gannon](https://lottiefiles.com/7077-magic-flow).
- Thanks to Adi Abinun and [@abdul-alhasany](https://github.com/mifi/lossless-cut/issues/2561) for UI work.
- Thanks to translators who helped translate the app. [You can help too.](docs/translation.md)

## License

ClipPress is licensed under [GPL-2.0-only](LICENSE).
