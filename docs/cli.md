# Command line interface (CLI)

ClipPress includes a basic CLI for automation and scripting. See also the [HTTP API](api.md).

## Current executable names

This rebrand pass does not rename packaged executables. In current builds, the CLI examples may still use legacy executable names such as `LosslessCut`, `LosslessCut.exe`, or `LosslessCut.app`.

```bash
LosslessCut [options] [files]
```

If the executable is available in your `PATH`, you can call it directly. Otherwise run it from the extracted app folder:

```bash
# First navigate to the folder containing the app
cd /path/to/directory/containing/app

# Linux
./LosslessCut arguments

# Windows
./LosslessCut.exe arguments

# macOS
./LosslessCut.app/Contents/MacOS/LosslessCut arguments
```

## Open one or more files

```bash
LosslessCut file1.mp4 file2.mkv
```

## Override settings

See the current config keys in [../src/main/configStore.ts](../src/main/configStore.ts). Incorrect values can break your configuration, so use this carefully. JSON and JSON5 are both supported.

```bash
LosslessCut --settings-json '{captureFormat:"jpeg", "keyframeCut":true}'
```

### Override FFmpeg/FFprobe path

```bash
LosslessCut --settings-json '{customFfPath:"/path/to/folder/containing/ffmpeg_and_ffprobe"}'
```

## Other options

- `--locales-path` Customize the locale path
- `--disable-networking` Turn off network requests
- `--http-api` Start the [HTTP API](api.md), optionally with a port (default `8080`)
- `--keyboard-action` Run a keyboard action
- `--config-dir` Path to the directory that contains `config.json`

## Controlling a running instance

If you enable "Allow multiple instances" in settings, you can send commands to a running instance from the outside. This is experimental and currently supports opening files and triggering keyboard actions.

### Open files in a running instance

```bash
LosslessCut file1.mp4 file2.mkv
```

### Keyboard actions

The command returns immediately. If you want to chain multiple actions, you may need a short delay between them. If you need to wait for completion, use the [HTTP API](api.md) instead.

```bash
# Open a file in an already running instance
LosslessCut file.mp4
sleep 3

# Export the currently opened file
LosslessCut --keyboard-action export
```

```bash
LosslessCut --keyboard-action goToTimecodeDirect '{"time": "12.23"}'
```

The list of available keyboard actions can be found in the app's Keyboard Shortcuts dialog.
