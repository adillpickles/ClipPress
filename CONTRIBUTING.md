# Contributing

## Development environment setup

ClipPress is built using Electron.
Make sure you have at least Node v22 (see `packageManager` in `package.json`). Enable Corepack with `corepack enable`. The app uses ffmpeg from PATH when developing.

```bash
git clone <your ClipPress repository URL>
cd ClipPress
corepack enable
yarn
```

Note: `yarn` may take some time to complete.

### Installing `ffmpeg`

Run one of the below commands:
```bash
yarn download-ffmpeg-darwin-x64
yarn download-ffmpeg-darwin-arm64
yarn download-ffmpeg-linux-x64
yarn download-ffmpeg-win32-x64
yarn download-ffmpeg-win32-arm64
```

For Windows, you may have to install [7z](https://www.7-zip.org/download.html), and then put the 7z folder in your `PATH`.

### Running

```bash
yarn dev
```

## Store builds (Mac App Store / Microsoft Store)

ClipPress does not build store packages. The inherited `mas` and `appx`
electron-builder configuration identified the app with the upstream LosslessCut
project's store identity (its Microsoft Store identity name and publisher, and an
Apple provisioning profile belonging to its author), which ClipPress cannot and
should not publish under, so that configuration has been removed.

The `isMasBuild` checks in the code are left in place: they are harmless, and
removing them would be a large change for no benefit.

Re-adding a store target would mean registering ClipPress's own publisher
identity first. Do not copy identifiers from upstream.

## Releasing

Before releasing, consider [Maintainence chores](#maintainence-chores) first.

### Prepare and build new version

- `git checkout master`
- `git merge stores` (in case there's an old unmerged stores hotfix)
- **Manually prepare release notes** from the repository commit history since the last version.
- Create a new file `versions/x.y.z.md` and write the most important highlights from the release notes, but **remove github issue #references**
- `node script/generateVersions.ts && git add versions/*.md src/renderer/src/versions.json && git commit -m 'Update change log'`
- *If Store-only hotfix release*
  - `git checkout stores`
  - `npm version patch`
- *If normal GitHub-first release*
  - `npm version minor && git --no-pager show`
- `git push --follow-tags`
- Wait for build and draft in Github actions

### Release built version

- Open draft in github and add the prepared release notes
- *If GitHub release*
  - Release the draft
- *If Store-only hotfix release*
  - Remove all other artifacts and release the draft as **pre-release**

#### After releasing in GitHub

- *If Stores-only hotfix release*
  - `git checkout master`
  - `git merge stores`
- Bump [snap version](https://snapcraft.io/losslesscut/releases)

### After releasing existing GitHub version in Stores

- `git checkout stores`
- Find the tag just released in the Stores
- Merge this tag (from `master`) into `stores`: `git merge vX.Y.Z`
- `git push`
- `git checkout master`

### More info

For per-platform build/signing setup, see [this article](https://mifi.no/blog/automated-electron-build-with-release-to-mac-app-store-microsoft-store-snapcraft/).

## Translations

`yarn scan-i18n` updates the extracted English strings.

If translation sync is still being handled through the inherited Weblate workflow, prefer merging those updates as dedicated translation PRs instead of mixing them into unrelated code changes.

## Minimum OS version

### MacOS [`LSMinimumSystemVersion`](https://developer.apple.com/documentation/bundleresources/information_property_list/lsminimumsystemversion)

How to check the value:

```bash
yarn pack-mac
cat dist/mac-arm64/ClipPress.app/Contents/Info.plist
```

```xml
<key>LSMinimumSystemVersion</key>
<string>10.13</string>
```

`LSMinimumSystemVersion` can be overridden in `electron-builder` by [`mac.minimumSystemVersion`](https://www.electron.build/configuration/mac.html)

See also `MACOSX_DEPLOYMENT_TARGET` in [ffmpeg-build-script](https://github.com/mifi/ffmpeg-build-script/blob/master/build-ffmpeg).

Links:
- https://support.google.com/chrome/a/answer/7100626
- https://bignerdranch.com/blog/requiring-a-minimum-version-of-os-x-for-your-application/
- [#1386](https://github.com/mifi/lossless-cut/issues/1386)

## Maintainence chores

### Keep dependencies up to date
- FFmpeg: [ffmpeg-build-script](https://github.com/mifi/ffmpeg-build-script), [ffmpeg-builds](https://github.com/mifi/ffmpeg-builds) and [package.json](./package.json) download scripts.
- `electron` and upgrade [electron.vite.config.ts](./electron.vite.config.ts) `target`s.
- `@electron/remote`
- `package.json` / `yarn.lock`

### i18n
```bash
yarn scan-i18n
```

### Regenerate licenses file

```bash
yarn generate-licenses
#cp licenses.txt losslesscut.mifi.no/public/
```
Then deploy.

### Dependabot

Use the repository Dependabot page in GitHub security settings.

## FFmpeg builds

- https://github.com/BtbN/FFmpeg-Builds
- https://www.gyan.dev/ffmpeg/builds/
- https://github.com/m-ab-s/media-autobuild_suite

## Other

- Update `copyrightYear`
