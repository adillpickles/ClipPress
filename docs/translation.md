# Translation

Thanks to everyone who has helped translate ClipPress.

ClipPress currently uses the inherited upstream LosslessCut project in Weblate. You can help translate the app in [Weblate](https://hosted.weblate.org/projects/losslesscut/losslesscut/). Please do not open pull requests with translation files manually. Weblate pushes translation updates back through its normal sync flow.

Master language is English, and the i18n keys are the English strings.

## Testing translations locally

Because Weblate translation updates are not merged immediately, your latest changes may not show up in the next local build automatically. If you want to test a translation locally:

1. Download the translation for your language from Weblate through `Files -> Download translation`.
2. Rename the downloaded file to `translation.json`.
3. Create a folder structure somewhere on your computer that looks like this:

```text
translations/locales/localeCode
```

You can find the available `localeCode` values in [../src/main/locales](../src/main/locales). For example, using `nb_NO`:

```text
/path/to/translations/locales/nb_NO
```

4. Move `translation.json` into that folder:

```text
/path/to/translations/locales/nb_NO/translation.json
```

5. Run ClipPress from the [command line](cli.md) with the special `--locales-path` argument. Depending on the build you are using, the packaged executable may still have a legacy name. The command below shows the current argument format:

```bash
clippress --locales-path /path/to/translations
```

ClipPress will then load your local translation files.

## Maintainer note

Weblate currently [does not allow](https://github.com/WeblateOrg/weblate/issues/7081) pushes directly to the inherited LosslessCut Weblate Git repository (`https://hosted.weblate.org/git/losslesscut/losslesscut/`). If that repo ever falls out of sync with this one, translation updates can become blocked until the branches are realigned.
