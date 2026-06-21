# Audiobook Shelf

A personal audiobook library + player PWA, synced across devices via Google Drive (no backend server).

## Structure

- `app/` — the live web app (vanilla JS, deployed to GitHub Pages)
- `ingest/` — local Node.js CLI for importing audiobooks (Audible DRM removal + plain mp3/m4b ingestion)
- `docs/` — schema and setup docs

## Status

Phase 1 in progress: project structure, Drive auth flow, `library.json` / `progress.json` schema.

See `docs/OAUTH_SETUP.md` for setting up the Google Cloud OAuth client.
See `docs/SCHEMA.md` for the Drive data schema.
