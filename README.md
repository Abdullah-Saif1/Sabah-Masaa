# Sabah & Masaa

Morning and evening Islamic adhkar (أذكار الصباح والمساء) — Arabic text, English
translation, transliteration, tap-to-count recitation tracking, and optional
sync across devices via a passcode + MongoDB.

## Structure

- `public/index.html` — the whole app: markup, CSS, and JS in one file, with
  the Amiri/Lora/Manrope fonts inlined as base64 so it renders correctly with
  no external requests. **Generated** — don't edit directly.
- `scripts/index.template.html` — the actual source to edit. Has
  `__AMIRI_400__`-style placeholders where the fonts get inlined.
- `scripts/build.js` — inlines `assets/fonts/*.woff2` into the template to
  produce `public/index.html`. Run after editing the template:
  ```
  npm run build-html
  ```
- `scripts/gen-icons.js` — regenerates the PWA icons in `public/icons/`
  (dependency-free PNG encoder — no ImageMagick needed).
- `public/manifest.json`, `public/sw.js` — PWA manifest + offline app-shell
  service worker (registered by index.html).
- `api/progress.js` — Vercel serverless function backing the "Sync across
  devices" panel: `GET /api/progress?code=XXXX` / `POST /api/progress`.
- `lib/mongodb.js` — shared MongoDB connection helper.
- `scripts/init-db.js` — one-time: adds a TTL index so synced progress
  auto-expires 90 days after its last update.

## Local setup

```
npm install
```

Create `.env.local` (gitignored) with your MongoDB connection string:

```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sabah_masaa
```

Then:

```
npm run dev        # vercel dev — serves public/ + api/ together
npm run init-db    # optional, once: sets up the TTL index
```

## Deploy

```
vercel --prod
```

Make sure `MONGODB_URI` is set as an environment variable on the Vercel
project (Production + Preview) — see `vercel env add MONGODB_URI`.

## How sync works

There's no login. The first device that taps "Create a new code" gets a
short code (e.g. `7F3-K9Q2`); entering that same code on another device
loads and then keeps saving to the same record. The code itself is the only
secret — anyone with it can read or overwrite that progress, which is an
acceptable tradeoff for a personal recitation counter but worth knowing.
Only today's tap-counters and display settings are stored, keyed by date —
nothing else about you is collected, and a document quietly expires if left
untouched for 90 days.
