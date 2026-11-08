# JavaScript expressions

A few advanced-mode dialogs take a JavaScript expression. It runs in a sandbox with
JavaScript's core built-ins (`Math`, `String`, `Number`, `Date`, `JSON`, `RegExp`,
`Array`, `Object` and so on), without network or file access. Each dialog lists
examples you can click.

## Select segments by expression

Right-click a segment in the segment list and choose **Select segments by
expression**. The expression runs for each segment with a variable `segment`;
segments for which it returns `true` are selected.

| Property | Type | Meaning |
| - | - | - |
| `segment.index` | `number` | Position in the segment list, starting at 0 |
| `segment.label` | `string` | The segment's label |
| `segment.start` | `number` | Start time in seconds |
| `segment.end` | `number` / `undefined` | End time in seconds; `undefined` for a marker |
| `segment.duration` | `number` | `end` minus `start`, or 0 for a marker |
| `segment.tags` | `object` | The segment's tags, by name |

Example: every segment shorter than 5 seconds.

```js
segment.duration < 5
```

## Edit segments by expression

Right-click a segment and choose **Edit segments by expression**. The expression
runs for each selected segment with the same `segment` variable, and returns an
object with what to change: `label` (a string), `start` and `end` (seconds; `end:
undefined` makes a marker) or `tags` (an object of strings). Anything left out
stays as it is.

Example: widen every selected segment by 5 seconds on each side.

```js
{ start: segment.start - 5, end: segment.end + 5 }
```

## Toggle tracks by expression

In the **Tracks** dialog, **Filter tracks** takes an expression that runs for each
track of the file with a variable `track`. Tracks for which it returns `true` are
switched on or off for the export. `track` is the track as FFprobe describes it;
to see all of its properties, open the track's menu and choose its info item
(**Track 1 info** for the first track).

Example: every audio track.

```js
track.codec_type === 'audio'
```

## File name templates

Templates can use expressions inside `${…}` too, for example
`${FILENAME.toLowerCase()}`. See [Export file name template](file-name-template.md).
