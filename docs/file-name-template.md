# Export file name template

When exporting segments as files, ClipPress lets you customize output file names with a template. The template is evaluated as a [JavaScript template string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), so you can use JavaScript syntax inside it.

For the technical definition of all available values, see [`FileNameTemplateContext`](generated/types.md#filenametemplatecontext).

The following variables are available:

| Avail. for merge files? | Avail. for cut+merge? | Variable | Type | Output |
| - | - | - | - | - |
| YES | YES | `${FILENAME}` | `string` | Original filename without extension |
| YES | YES | `${FILES}` | `SourceFile[]` | Original source files with metadata you can query in JavaScript |
| YES | YES | `${EXT}` | `string` | Output extension such as `.mp4` or `.mkv` |
| YES | YES | `${EPOCH_MS}` | `number` | Milliseconds since epoch |
| YES | YES | `${EXPORT_COUNT}` | `number` | Number of exports since the current ClipPress launch |
|  | YES | `${FILE_EXPORT_COUNT}` | `number` | Number of exports since the current file was opened |
| YES | YES | `${SEG_LABEL}` | `string` / `string[]` | Segment label or labels |
|  |  | `${SEG_NUM}` | `string` | Segment index as a padded string |
|  |  | `${SEG_NUM_INT}` | `number` | Segment index as an integer |
|  |  | `${SELECTED_SEG_NUM}` | `string` | Selected-segment index as a padded string |
|  |  | `${SELECTED_SEG_NUM_INT}` | `number` | Selected-segment index as an integer |
|  |  | `${SEG_SUFFIX}` | `string` | Label-based suffix or fallback segment suffix |
|  |  | `${CUT_FROM}` | `string` | Segment start in `hh.mm.ss.sss` format |
|  |  | `${CUT_FROM_NUM}` | `number` | Numeric start time |
|  |  | `${CUT_TO}` | `string` | Segment end in `hh.mm.ss.sss` format |
|  |  | `${CUT_TO_NUM}` | `number` | Numeric end time |
|  |  | `${CUT_DURATION}` | `string` | Segment duration in `hh.mm.ss.sss` format |
|  |  | `${SEG_TAGS.XX}` | `object` | Segment tag lookup by tag name |

- Advanced JavaScript variables can be used directly inside `${...}`.
- Some variables remain experimental.

Your file names should always include at least one unique identifier such as `${SEG_NUM}` or `${CUT_FROM}`, and they should end in `${EXT}` so media players can recognize the file type.

Example:

```txt
${FILENAME} - ${SEG_NUM}${EXT}
```

That would produce names like:

- `Beach Trip - 1.mp4`
- `Beach Trip - 2.mp4`
- `Beach Trip - 3.mp4`

If your template produces duplicate names, ClipPress falls back to the default template.

## Padding numbers

If you need to pad a number with leading zeroes, wrap it in JavaScript:

```txt
${String(FILE_EXPORT_COUNT).padStart(2, '0')}
```

If you want more help writing a template, it is often easiest to describe the desired output format and examples to an assistant or teammate who is comfortable with JavaScript template strings.
