# Drive Data Schema

All data lives in a single dedicated Drive folder (created on first login via the `drive.file` scope, which means the app can only see files it itself created — it cannot browse the rest of your Drive).

## Folder layout

```
Audiobook Shelf/              (Drive folder, app-created)
  library.json
  progress.json
  covers/
    <bookId>.jpg
  audio/
    <bookId>.m4b | .mp3
```

## library.json

```json
{
  "version": 1,
  "books": [
    {
      "id": "uuid-v4",
      "title": "string",
      "author": "string",
      "narrator": "string",
      "coverFileId": "drive file id of cover image",
      "audioFileId": "drive file id of audio file",
      "fileName": "original file name, for reference",
      "durationSec": 12345.6,
      "chapters": [
        { "title": "Chapter 1", "startSec": 0 }
      ],
      "addedAt": "ISO 8601 timestamp"
    }
  ]
}
```

## progress.json

One entry per book. Single file (not per-book files) to keep round trips low — it's small even for a large library.

```json
{
  "version": 1,
  "progress": {
    "<bookId>": {
      "positionSec": 1234.5,
      "status": "not-started" | "in-progress" | "finished",
      "lastPlayedAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp"
    }
  }
}
```

`updatedAt` is the conflict-resolution field: on write, the client re-reads `progress.json`'s current `updatedAt` for that book and only overwrites if its local timestamp is newer (last-write-wins). Drive's file `etag`/`modifiedTime` is not used for this since it reflects the whole-file write, not the per-book value.

## Sync behavior

- On load, the app fetches `progress.json` fresh from Drive.
- Writes are debounced: at most once every 10-15s during playback, plus immediately on pause/visibilitychange/unload.
- If offline, writes queue in `localStorage`; flushed on reconnect (`online` event), merged with last-write-wins by `updatedAt`.
