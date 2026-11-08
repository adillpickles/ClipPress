# Export file name template

In advanced mode you can choose how exported files are named with a *template*:
click the output file name in the export options to edit it. The template is a
[JavaScript template string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals),
so you can use JavaScript inside `${…}` (see [JavaScript expressions](expressions.md)).

## Variables

**Separate files** can use every variable. The merged file of **Merge cuts** (or
**Merge & Separate**) and **Merge/concatenate files** can use those marked ✅.

| Merge cuts | Merge files | Variable | Type | Output |
| - | - | - | - | - |
| ✅ | ✅ | `${FILENAME}` | `string` | The original file name without its extension (`Beach Trip` for `Beach Trip.mp4`). When merging files, the first file's name. |
| ✅ | ✅ | `${FILES}` | `SourceFile[]` | The original file(s), each with `name`, `path`, `size` (bytes) and `atime`, `mtime`, `ctime`, `birthtime` (milliseconds since 1970). When merging files, only the first file has the size and times unless **Check compatibility** is on. Example: `${new Date(FILES[0].mtime).toISOString().slice(0, 10)}` |
| ✅ | ✅ | `${EXT}` | `string` | The output extension, such as `.mp4` or `.mkv`. |
| ✅ | ✅ | `${EPOCH_MS}` | `number` | Milliseconds since 1970: a new value for every export, so an export never takes an earlier one's name. |
| ✅ | ✅ | `${EXPORT_COUNT}` | `number` | Exports since ClipPress started, counting from 1. Merging files doesn't count up, so two merges in a row get the same number. |
| ✅ | | `${FILE_EXPORT_COUNT}` | `number` | Exports since the current file was opened, counting from 1. |
| ✅ | ✅ | `${SEG_LABEL}` | `string` / `string[]` | The segment's label. For Merge cuts, an array of every segment's label: `${SEG_LABEL.filter(label => label).join(',')}`. When merging files, each file's name. |
| | | `${SEG_NUM}` | `string` | The segment's number, padded with zeros to the same width for all (`01` … `42`). |
| | | `${SEG_NUM_INT}` | `number` | The segment's number as a number, for arithmetic: `${SEG_NUM_INT + 100}`. |
| | | `${SELECTED_SEG_NUM}` | `string` | Like `SEG_NUM`, but counting only the exported segments. |
| | | `${SELECTED_SEG_NUM_INT}` | `number` | Like `SEG_NUM_INT`, but counting only the exported segments. |
| | | `${SEG_SUFFIX}` | `string` | `-` and the label if the segment has one (`-Getting Lunch`); otherwise `-seg` and its number when exporting several (`-seg1`); otherwise empty. |
| | | `${CUT_FROM}` | `string` | The segment's start, in the timeline's time format with `.` for `:` (`00.00.27.184`). |
| | | `${CUT_FROM_NUM}` | `number` | The segment's start in seconds. |
| | | `${CUT_TO}` | `string` | The segment's end, like `CUT_FROM`. |
| | | `${CUT_TO_NUM}` | `number` | The segment's end in seconds. |
| | | `${CUT_DURATION}` | `string` | The segment's length, like `CUT_FROM`. |
| | | `${SEG_TAGS.XX}` | `object` | A segment tag by name: a tag called `foo` is `${SEG_TAGS.foo}` (or `${SEG_TAGS.FOO}`). A missing tag gives `undefined`; `${SEG_TAGS.foo ?? ''}` avoids that. |

The technical definitions are in [`src/common/userTypes.ts`](../src/common/userTypes.ts).

## Rules

- With several segments, every name needs something unique, such as `${SEG_NUM}` or `${CUT_FROM}`. Names
  should end in `${EXT}` so players recognise the file. `${FILENAME} - ${SEG_NUM}${EXT}` gives `Beach Trip - 1.mp4`,
  `Beach Trip - 2.mp4`, `Beach Trip - 3.mp4`.
- If the template gives duplicate or invalid names, ClipPress uses the default template instead.
- A name that would land on the file being exported is changed, so the original is never overwritten.
- **Sanitize file names** (on by default) replaces special characters in labels and tags with `_`. With it
  off, a name can contain `\` or `/` to make subfolders, but never leave the output folder.

## Padding numbers

`SEG_NUM` and `SELECTED_SEG_NUM` follow **Minimum numeric padded length**. To pad another number, use
JavaScript, for example two digits with leading zeros:

```txt
${String(FILE_EXPORT_COUNT).padStart(2, '0')}
```
