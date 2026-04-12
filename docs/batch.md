# Batch processing

ClipPress is built for fast interactive clipping, not fully automated batch processing. If you need to repeat the exact same FFmpeg operation across many files, the most practical approach is usually to script that operation directly.

## Set up FFmpeg

Install [FFmpeg](https://ffmpeg.org/) and make sure the `ffmpeg` command works in your terminal or shell.

```bash
ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers
```

## Build your script

Create a script file such as:

- `myscript.sh` on macOS or Linux
- `myscript.ps1` or `myscript.bat` on Windows

If there is a specific operation you already performed in ClipPress, open the "Last FFmpeg commands" view and copy the command from there. That gives you a strong starting point for your script.

## Using AI to help

Large language models can be useful for turning a one-off FFmpeg command into a reusable script.

Be specific:

- say which operating system you are on
- describe the source files clearly
- explain exactly what should happen to each file
- include a working FFmpeg command when you have one

### Example prompt

> I am on macOS. Please help me write a script that, for each `*.mp4` file in a folder, losslessly removes the first 10 seconds and writes the result to a new file in the same folder. I already have FFmpeg installed and available as `ffmpeg`.

### Example using a command copied from ClipPress

> I am on Windows 11. I have this FFmpeg command from ClipPress: `ffmpeg -hide_banner -i "C:\\path\\to\\input.mp4" -map "0:1" -c copy -f adts -y "C:\\path\\to\\output.aac"`. Please help me turn it into a PowerShell script that runs on every `*.mp4` file in `C:\\path\\to\\folder`.

## More ideas

Split files into equal-length segments:

> Write a script that takes a folder of `*.mp4` files and splits each file into an unknown number of files of approximately 299 seconds each.

Batch rotate files to 90 degrees:

> Write a script that takes a folder of `*.mp4` files and losslessly changes the rotation metadata to 90 degrees for each file.
