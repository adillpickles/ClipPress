# Installation and files

## There is no installer

ClipPress is distributed as an extracted app bundle or archive, depending on platform.

- Windows: extract the downloaded `.7z` archive with [7-Zip](https://www.7-zip.org/download.html) and run the executable inside.
- macOS: mount the `.dmg` and drag the app into `Applications`.
- Linux: extract the archive or use the packaged build you downloaded.

If you are building from source instead, see [../CONTRIBUTING.md](../CONTRIBUTING.md).

## Portable app?

ClipPress is not a fully portable app. It stores settings, keyboard shortcuts, logs, and temporary files in the operating system's app-data locations by default.

Current ClipPress builds store app data under the ClipPress app name. Some old fork/upstream builds may still have legacy LosslessCut folders or package identifiers; keep those only if you still need the old settings.

## Settings and temporary files

Settings, keyboard shortcuts, logs, and temporary cache files are stored in your [`appData`](https://www.electronjs.org/docs/api/app#appgetpathname) folder.

| OS | Typical `appData` folder path |
| - | - |
| Windows | `%APPDATA%\\ClipPress` |
| macOS | `~/Library/Application Support/ClipPress` |
| Linux | `$XDG_CONFIG_HOME/ClipPress` or `~/.config/ClipPress` |

App settings and keyboard shortcuts are stored in `config.json` inside the app-data folder.

## Custom `config.json` path

On Windows, if you create a `config.json` file with the contents `{}` next to the current packaged executable (`ClipPress.exe`), ClipPress will read and store settings from that file instead of the default app-data location.

You can also specify a custom folder containing `config.json` with the CLI option `--config-dir`. Other temporary files may still be stored in the default app-data location.

## How to uninstall

Delete the extracted app folder or remove the installed app bundle.

If you also want to remove settings, logs, and caches, delete the app-data folders listed above.

## Unofficial versions

Because ClipPress is open source under GPL, other people may package or redistribute their own builds. Those builds may use different support channels, packaging layouts, or update behavior.
