# JavaScript expressions

ClipPress supports JavaScript expressions in a few advanced dialogs.

This is a lightweight expression environment with standard [core JavaScript functionality](https://developer.mozilla.org/en-US/docs/Web/JavaScript) available.

## Select segments by expression

You get a global variable named `segment` (type [`Segment`](generated/types.md#segment)) and return `true` or `false`.

Example: select all segments shorter than 5 seconds.

```js
segment.duration < 5
```

## Edit segments by expression

When editing selected segments, you receive a `segment` variable (type [`Segment`](generated/types.md#segment)) and can return a modified segment object.

See the in-app examples for more ideas.

## Output name templates

You can also use JavaScript expressions inside output file name templates, for example:

```txt
${FILENAME.toLowerCase()}
```

See [Export file name template](file-name-template.md).

## Select tracks by expression

To see available variables for a track, open the *Tracks* dialog, then open *Track info* for that track.
