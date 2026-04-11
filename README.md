# ClipPress

ClipPress is a fast open-source clip editor for making shareable clips from gameplay, streams, screen recordings, and other long videos. Open a clip, press `I` and `O`, optionally add text or tweak gain, then export something ready to send in Discord or anywhere else.

> ClipPress is open-source and ad-free. If it saves you time and you want to support continued development and polish, you can [Support ClipPress](https://ko-fi.com/adillpickles).

## Highlights

- Fast clip workflow built around `I` / `O` marking and quick export
- Simple mode for an easy default flow, plus Advanced mode for deeper control
- Plain text overlays for quick callouts and captions
- Per-track audio gain for practical volume adjustments
- Keep-source-quality export and target-file-size export
- Multi-segment export as separate clips, one merged clip, or both
- Modern desktop UI with keyboard shortcuts, project save/load, and track selection

## What ClipPress is for

ClipPress is designed for fast clipping and practical exports, not for full motion graphics or heavy timeline editing.

It works especially well when you want to:

- clip a gameplay moment quickly
- turn a long recording into one or more short shareable exports
- stay under upload size limits without bouncing to another app
- make lightweight text and audio tweaks before exporting

## Built on top of LosslessCut

ClipPress is built on top of [LosslessCut](https://github.com/mifi/lossless-cut) by Mikael Finstad and the LosslessCut contributors. Big thanks for the open-source foundation that made ClipPress possible.

## Installation and development

- Use this repository's Releases page for packaged builds when available.
- For installation notes, app-data locations, and legacy executable/package naming details, see [docs/installation.md](docs/installation.md).
- For local development setup, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Getting started, usage notes, and FAQ](docs/index.md)
- [Installation and files](docs/installation.md)
- [Troubleshooting and known limitations](docs/troubleshooting.md)
- [CLI](docs/cli.md)
- [HTTP API](docs/api.md)
- [Batch processing notes](docs/batch.md)
- [Export file name behavior](docs/file-name-template.md)
- [Translation workflow](docs/translation.md)
- [Contributing](CONTRIBUTING.md)

## Supported formats

ClipPress uses Chromium for preview playback and FFmpeg for inspection and export operations. Common containers such as `MP4`, `MOV`, `WebM`, `Matroska`, `OGG`, and `WAV` generally work well, along with common audio and video codecs supported by Chromium and FFmpeg.

If a file does not preview natively, ClipPress can often still work with it through FFmpeg-assisted playback or export workflows. See [docs/troubleshooting.md](docs/troubleshooting.md) for more detail.

## Credits

- App icon made by [Dimi Kazak](http://www.flaticon.com/authors/dimi-kazak "Dimi Kazak") from [www.flaticon.com](http://www.flaticon.com "Flaticon"), licensed under [CC BY 3.0](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0").
- [Lottie animation by Chris Gannon](https://lottiefiles.com/7077-magic-flow).
- Thanks to Adi Abinun and [@abdul-alhasany](https://github.com/mifi/lossless-cut/issues/2561) for UI work.
- Thanks to everyone who has helped translate the app. [You can help too.](docs/translation.md)

## Screenshot placeholders

Screenshots are intentionally omitted for now while the ClipPress UI settles. Recommended captures to add later:

- Simple mode empty state
- Simple mode editing view with timeline and clips rail
- Simple mode export panel
- Text overlay editing example
- Advanced mode export and settings view

## License

ClipPress is licensed under [GPL-2.0-only](LICENSE).
