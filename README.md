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

## Installing on iPhone

The app is a PWA (`app/manifest.webmanifest` + `app/sw.js`). To install it as a
standalone app on the home screen:

1. Open the deployed GitHub Pages URL in Safari (not Chrome — Safari is required
   for "Add to Home Screen" on iOS).
2. Tap the Share icon, then **Add to Home Screen**.
3. Launch it from the home screen icon; it opens full-screen with lock-screen
   media controls (play/pause/skip/chapter) via the Media Session API.

iOS Safari has no equivalent of Android's Web Share Target API, so there's no
way to "Share" a downloaded audiobook file into the app from Files/other apps
on iPhone. To add books, use the `ingest/` CLI on a computer (it decrypts
Audible AAX/AAXC and uploads plain mp3/m4b to the same Drive folder the app
reads from).
