# Installation and files

## Windows downloads

The currently published preview through `0.1.0-beta.4` is a single portable
executable for Windows 10/11 x64. The next preview can also ship a per-user Windows
installer with automatic updates; the portable download remains available.

- Windows: download `ClipPress-Windows-x64.exe` from the [Releases page](https://github.com/adillpickles/ClipPress/releases) and run it. FFmpeg is included. There is nothing to extract or install.
- When available, choose `ClipPress-Setup-<version>.exe` for installation and
  automatic updates. It installs for the current user without administrator
  privileges. See [automatic updates](automatic-updates.md) for the two modes.
- The build is unsigned, so Windows SmartScreen may warn before the first run.
- No macOS or Linux builds are published for the preview.

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

On Windows, if you create a `config.json` file with the contents `{}` next to the downloaded executable (`ClipPress-Windows-x64.exe`), ClipPress will read and store settings from that file instead of the default app-data location. For an installed app, use the default app-data folder or a custom directory outside the installation folder so settings survive replacement of installed files.

You can also specify a custom folder containing `config.json` with the CLI option `--config-dir`. Other temporary files may still be stored in the default app-data location.

## How to uninstall

Delete `ClipPress-Windows-x64.exe`.

For an installed copy, use Windows **Settings > Apps > Installed apps > ClipPress >
Uninstall**. Uninstalling preserves your settings by default.

If you also want to remove settings, logs, and caches, delete the app-data folders listed above.

## Unofficial versions

Because ClipPress is open source under GPL, other people may package or redistribute their own builds. Those builds may use different support channels, packaging layouts, or update behavior.
