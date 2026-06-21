# Audiobook Shelf — Ingestion CLI

Local-only tooling to get audiobooks into your Drive library. This never runs in a browser and never touches your Audible password — both tools below are designed so your credentials stay on your machine.

## ⚠️ Legal note on Audible DRM removal

Removing DRM from `.aax`/`.aaxc` files you've purchased sits in a legal gray area that varies by jurisdiction. In some places, format-shifting personal-use content you've bought is treated as fair use; in others, circumventing DRM is restricted regardless of how you obtained the content (e.g. under anti-circumvention provisions like the US DMCA), even for your own purchases. This script is provided for personal convenience on books you own — you're responsible for checking what applies where you live before using it. If in doubt, consult a lawyer rather than relying on this note.

## 1. One-time setup

```bash
cd ingest
npm install
```

### 1a. Activation bytes (needed once, for `.aax`/`.aaxc` decryption only)

Activation bytes are a small device key tied to your Audible account. You extract these yourself, locally — this script does not log into Audible for you.

Recommended tool: [`mkb79/audible`](https://github.com/mkb79/audible) (Python).

```bash
pip install audible
python3 -c "
import audible
auth = audible.Authenticator.from_login(
    'YOUR_AUDIBLE_EMAIL',
    'YOUR_AUDIBLE_PASSWORD',
    locale='us'  # or your country code: uk, de, fr, etc.
)
print('Activation bytes:', auth.get_activation_bytes())
"
```

This runs entirely on your machine — your email/password go straight to Audible's own login API via the `audible` package, not through this script or Claude. Copy the resulting hex string (e.g. `1a2b3c4d`) — that's your `--activation-bytes` value below. If your Audible account uses 2FA, the package will prompt for the OTP interactively.

### 1b. Google Drive credentials for the CLI

The web app uses a **Web application** OAuth client. This CLI needs a separate **Desktop app** OAuth client (different flow, no browser redirect URI needed):

1. In the same Google Cloud project (`audiobook-shelf`), go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**. Name it `Audiobook Shelf CLI`.
3. Download the JSON and save it as `ingest/credentials.json` (already gitignored).

First run will open a browser for one-time consent; the resulting refresh token is cached locally in `ingest/.token.json` (also gitignored) so you won't need to re-auth every time.

## 2. Decrypting Audible books (.aax / .aaxc)

```bash
npm run ingest-aax -- --input ./my-aax-files --activation-bytes 1a2b3c4d --output ./out
```

For each `.aax`/`.aaxc` file found in `--input`, this:
1. Decrypts to `.m4b` via `ffmpeg` (requires `ffmpeg` on your PATH).
2. Extracts embedded chapter markers and cover art.
3. Uploads the `.m4b` and cover to your Drive `Audiobook Shelf` folder.
4. Appends a book entry to `library.json` on Drive.

## 3. Ingesting plain mp3/m4b (non-Audible, no DRM)

```bash
npm run ingest-plain -- --input ./my-other-books --output ./out
```

Same pipeline minus the decryption step — just extracts metadata/cover and uploads.

## Notes

- `ffmpeg` must be installed and on your PATH (`brew install ffmpeg` / `apt install ffmpeg`).
- Title/author/narrator are read from embedded file tags when present; pass `--title`/`--author`/`--narrator` to override per-run (single-file mode only).
- Re-running on the same input file creates a new book entry rather than updating — dedupe by checking `library.json` first if you're re-ingesting.
