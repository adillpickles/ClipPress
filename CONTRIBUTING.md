# Contributing

## Development setup

ClipPress is an Electron app, developed and built on Windows. You need Node.js 22
or newer (CI uses Node 22) and Corepack, which provides the Yarn version named in
`package.json`'s `packageManager`.

```bash
git clone https://github.com/adillpickles/ClipPress.git
cd ClipPress
corepack enable
yarn
```

`yarn` may take some time to complete.

### FFmpeg

In development, ClipPress runs FFmpeg from `ffmpeg/<platform>-<arch>/lib/` (on
Windows, `ffmpeg/win32-x64/lib/`). Download it with:

```bash
yarn download-ffmpeg-win32-x64
```

This needs [7-Zip](https://www.7-zip.org/download.html)'s `7z` in your `PATH`.

On Linux (for development only; ClipPress ships for Windows), put an FFmpeg 9 `ffmpeg` and `ffprobe` in
`ffmpeg/linux-x64/lib/`, or pick the folder with them under Settings > Custom FFmpeg.

### Running and checking

```bash
yarn dev
```

The **Test** workflow runs `yarn test run`, `yarn tsc`, `yarn lint` and `yarn build`
on every push and pull request; run them before opening one.

## Releasing

Only Windows x64 is built. GitHub Actions builds and publishes a release from its
version tag.

1. On a branch, set `version` in `package.json` (for example `0.1.0-beta.7`).
2. Write the What's new notes in `versions/<version>.md`, run
   `node script/generateVersions.ts`, and commit the updated
   `src/renderer/src/versions.json` with them.
3. Open a pull request to `master` and squash-merge it once its checks pass. The
   **Installer upgrade test** (`.github/workflows/installer-upgrade-test.yml`) runs
   on pull requests that change `package.json`, and must pass. It installs and
   updates the app, so it only ever runs in GitHub's disposable VM; never run it,
   or the installers, on your own PC.
4. Tag the merged commit on `master` and push the tag:

   ```bash
   git tag v<version>
   git push origin v<version>
   ```

   `.github/workflows/build.yml` then builds the installer, the portable EXE,
   `latest.yml` and the blockmap, smoke-tests the packaged app, and publishes them
   as a GitHub release: a pre-release when the version has a suffix such as
   `-beta.7`. The build fails if the tag doesn't match `package.json`.
5. Give the release its title and notes on GitHub.
6. Move `PREVIEW` in `site/src/site.config.ts` to the new release. The website's
   download follows the newest release by itself; `PREVIEW` is its fallback.

[Automatic updates](docs/automatic-updates.md#building-and-publishing) explains the
release files and the update feed.

## Translations

The English text is the key (`t('…')`). After changing UI text, run
`yarn scan-i18n` to update `locales/en/translation.json`.

## Maintenance

- Dependencies: FFmpeg (the [mifi/ffmpeg-builds](https://github.com/mifi/ffmpeg-builds)
  release in `package.json`'s download script), `electron` together with the
  `target`s in [electron.vite.config.ts](./electron.vite.config.ts),
  `@electron/remote`, and `yarn.lock`.
- Licences: `yarn generate-licenses` writes `out/licenses.txt`, which ships with
  the app as `licenses.txt`. `yarn check-licenses` checks the dependencies'
  licences.
- `copyrightYear` in `src/main/common.ts` sets the year in the About window.
