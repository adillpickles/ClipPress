# Automatic updates

ClipPress's Windows x64 installer can download and install newer GitHub releases.
The portable EXE remains available and provides a link to the release download.
Existing portable builds require one manual installation of the first version
with this updater; an older EXE cannot acquire an updater on its own.

## Settings

In **Settings > App updates**, choose either:

- **Automatic (recommended)**: check after the editor is ready, download in the
  background, and install on a normal exit. The next launch uses the new version.
- **Ask before downloading**: show a small update notice first. **Download update**
  approves the download and installation on a normal exit.

Turn off **Check automatically** to use only **Help > Check for updates**.
Previously disabled update checking stays disabled after upgrading. Turning
checking off or switching to Ask pauses installation of an already downloaded
automatic update; **Install when I close ClipPress** approves it again.

The check starts eight seconds after the renderer is ready, once per session. It
does not delay opening the editor. There is no forced restart or automatic reopen
after installation. A failed check or download leaves the current version usable.
Incomplete downloads and downloads that fail SHA-512 verification cannot install.
Beta builds accept newer beta or stable releases; stable builds exclude betas.
Older versions are never installed automatically.

Automatic installation is limited to the Windows x64 installer in single-instance
mode. Development, offline sessions, other platforms, and portable copies do not
run an installer. Restart after changing the multiple-instance setting.

## Release notes

The What's new dialog includes only nonempty ClipPress notes newer than the
previously seen version and no newer than the running version. The current
version is saved directly by the main process. Relaunching the same version does
not show the dialog again, and missing notes do not produce an empty dialog.

## Building and publishing

`yarn pack-win` builds and audits these files without publishing them:

- `ClipPress-Setup-<version>.exe`: per-user NSIS installer, no elevation required.
- `ClipPress-Setup-<version>.exe.blockmap`: differential-download metadata.
- `ClipPress-Windows-x64.exe`: the existing portable download.
- `latest.yml`: installer version, filename, size, and SHA-512 checksum.

GitHub selects beta releases by their prerelease tags. Its updater falls back to
the release's `latest.yml` if a beta-specific feed is absent. A stable installation
uses GitHub's latest stable release. Do not remove assets from published releases
that installed copies may still use.

The build verifies the installer against its feed and rejects a release tag that
does not match `package.json`. A `v*` tag triggers the existing release workflow,
which publishes the installer, portable EXE, feed, and blockmap together. Tags with
a prerelease suffix are published as prereleases. Merging a PR does not publish.

Before the next preview release:

1. Complete manual editing/export QA and the update checks below.
2. Set the intended package version and add matching notes in `versions/`.
3. Build with `yarn pack-win`; keep the generated assets together.
4. Publish the matching tag only after QA approval, then test discovery from the
   previous installed version against the real GitHub feed.
5. Update the website download links to offer the installer and portable EXE.

Windows builds currently use the project's existing unsigned packaging. SHA-512
verification checks the release artifact; it does not substitute for publisher
identity. If signing is added, configure the same publisher across releases and
retain electron-updater's default signature verification.

The updater and NSIS behavior follow the [electron-builder auto-update guide](https://www.electron.build/v26/docs/features/auto-update/).

## Manual QA

- Install, launch, and confirm the editor opens before the update check.
- In Automatic mode, keep editing while an update downloads. Close normally and
  reopen; confirm the new version and retained settings/projects.
- In Ask mode, confirm no installer downloads before **Download update**.
- Disable automatic checking and confirm it stays off after a restart.
- Turn checking off with a downloaded update waiting; confirm installation pauses.
- Disconnect during a check/download, reconnect, and use **Try again**.
- After upgrading, confirm populated What's new notes appear once. Relaunch and
  confirm the dialog stays closed.
- Launch the portable EXE and confirm it offers a release link instead of trying
  to install over itself.
