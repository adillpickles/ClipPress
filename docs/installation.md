# Installation and files

## There is no installer

ClipPress is distributed as an extracted app bundle or archive, depending on platform.

- Windows: extract the downloaded `.7z` archive with [7-Zip](https://www.7-zip.org/download.html) and run the executable inside.
- macOS: mount the `.dmg` and drag the app into `Applications`.
- Linux: extract the archive or use the packaged build you downloaded.

If you are building from source instead, see [../CONTRIBUTING.md](../CONTRIBUTING.md).

## Portable app?

ClipPress is not a fully portable app. It stores settings, keyboard shortcuts, logs, and temporary files in the operating system's app-data locations by default.

Because this pass keeps internal package identifiers unchanged, some current folders and executable names still use legacy `LosslessCut` naming. That is expected in the current build layout.

## Settings and temporary files

Settings, keyboard shortcuts, logs, and temporary cache files are stored in your [`appData`](https://www.electronjs.org/docs/api/app#appgetpathname) folder.

| OS | `appData` folder path | Notes |
| - | - | - |
| Windows | `%APPDATA%\\LosslessCut` | Current legacy app-data folder name |
| Windows (MS Store version) | `C:\\Users\\%USERNAME%\\AppData\\Local\\Packages\\57275mifi.no.LosslessCut_eg8x93dt4dxje\\LocalCache\\Roaming\\LosslessCut` | Current legacy package identifier |
| macOS | `~/Library/Application Support/LosslessCut` | Current legacy app-data folder name |
| macOS (App Store version) | `~/Library/Containers/no.mifi.losslesscut/Data/Library/Application Support/LosslessCut` | Current legacy container identifier |
| Linux | `$XDG_CONFIG_HOME/LosslessCut` or `~/.config/LosslessCut` | Current legacy app-data folder name |

App settings and keyboard shortcuts are stored in `config.json` inside the app-data folder.

## Custom `config.json` path

On Windows, if you create a `config.json` file with the contents `{}` next to the current packaged executable (which may still be named `LosslessCut.exe`), ClipPress will read and store settings from that file instead of the default app-data location.

You can also specify a custom folder containing `config.json` with the CLI option `--config-dir`. Other temporary files may still be stored in the default app-data location.

## How to uninstall

Delete the extracted app folder or remove the installed app bundle.

If you also want to remove settings, logs, and caches, delete the app-data folders listed above.

## Unofficial versions

Because ClipPress is open source under GPL, other people may package or redistribute their own builds. Those builds may use different support channels, packaging layouts, or update behavior.
