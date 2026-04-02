# HTTP API

ClipPress can be controlled through an HTTP API when it is started with `--http-api`. The API is experimental and may change.

See also the [CLI](cli.md).

## Enabling the API

Current packaged binaries may still use legacy executable names, so examples below continue to use `LosslessCut`:

```bash
LosslessCut --http-api
```

## Action endpoint: `POST /api/action/:action`

Run a keyboard shortcut action, similar to the `--keyboard-action` CLI option. Unlike the CLI, many actions wait for completion before the HTTP request returns.

See [available keyboard actions](cli.md#keyboard-actions).

### Example actions

Export the currently opened file:

```bash
curl -X POST http://localhost:8080/api/action/export
```

Seek to a time:

```bash
curl -X POST http://localhost:8080/api/action/goToTimecodeDirect --json '{"time": "09:11"}'
```

Open one or more files:

```bash
curl -X POST http://localhost:8080/api/action/openFiles --json '["/path/to/file.mp4"]'
```

### Batch example

Start the app with the HTTP API enabled:

```bash
LosslessCut --http-api
```

Then run a script in another terminal:

```bash
for PROJECT in /path/to/folder/with/projects/*.llc
    LosslessCut $PROJECT
    sleep 5
    curl -X POST http://localhost:8080/api/action/export
    curl -X POST http://localhost:8080/api/action/closeCurrentFile
done
```

## Await-event endpoint

This endpoint waits until a specific event occurs in the app.

### Event: `export-start`

Emitted when export starts. Returns JSON like `{ path: string }`.

### Event: `export-complete`

Emitted when export completes, whether successful or failed. On success it returns JSON like `{ paths: string[] }`.

### Example

Run a follow-up command after each completed export:

```bash
while true; do
  echo 'Do something with exported file path:' $(curl -s -X POST http://localhost:8080/api/await-event/export-complete | jq -r '.paths[0]')
done
```
