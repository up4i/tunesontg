# tune — music on Telegram

`tune` is a Telegram bot plus Mini App for turning audio messages into a personal music library. A user sends or forwards music to the bot, organizes it in the Mini App, and listens through a full in-app player without permanently copying the audio from Telegram.

The project is intentionally one small Next.js service. It owns the UI, Telegram webhook, signed Mini App authentication, SQLite database, and Bot API calls.

## What works

- Private audio inbox: accepts Telegram `audio` messages and audio documents
- No copied audio: stores durable Telegram `file_id` references and metadata
- Per-user libraries validated from signed Telegram Mini App `initData`
- Searchable, responsive music UI with Telegram theme/safe-area support
- Playlist creation, add/remove tracks, play, and shuffle
- Full now-playing UI with pause, seek, previous/next, repeat, and queue state
- Telegram album-cover thumbnails when the incoming audio includes one
- Stateless, Range-aware Telegram streaming for seeking without audio storage
- Device/OS playback controls through the browser Media Session API where supported
- Optional native Telegram playback handoff through `sendAudio` / `sendMediaGroup`
- Local demo library for designing and testing without a bot token
- Webhook secret validation and user-scoped database queries

## Playback architecture

Telegram does not expose its native audio player as a Mini App JavaScript API. A Mini App cannot start/pause Telegram's player, inspect its progress, or pass a `file_id` directly to it.

The default experience is therefore a Mini App web-audio player:

1. The bot records a Telegram `file_id`; it never downloads the music.
2. The authenticated library response issues a short-lived, user-and-track-scoped media ticket.
3. The browser requests audio through that signed URL. The backend calls Telegram `getFile` and streams the response without saving it.
4. Byte-range requests are forwarded for seeking. The browser owns play/pause, queue, shuffle, repeat, and progress state.
5. Telegram's direct file URL—and therefore the bot token—never reaches client code.

This avoids permanent audio storage, but playback consumes server bandwidth. Telegram's hosted Bot API currently limits `getFile` downloads to 20 MB. Larger tracks need a local Telegram Bot API server or a separate storage/CDN decision.

The track menu retains **Send to Telegram player** as a low-bandwidth fallback. That copies the audio message into the bot chat for playback in Telegram's native player, but native playback cannot be controlled from the Mini App.

## Run locally

Requirements: Node.js 22+ and npm 12+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `DEV_TELEGRAM_ID` and `NEXT_PUBLIC_DEMO_MODE=true`, the browser gets a visual demo library. Demo tracks cannot be sent to Telegram.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

SQLite creates `data/tunes.db` automatically. It is a good fit for a personal or small single-server instance. Before a multi-instance public launch, move the same schema to managed Postgres and use object storage only if you later decide to host non-Telegram audio.

If you point `DATABASE_PATH` at another directory, create that directory before starting the app.

## Connect a real bot

1. Open [@BotFather](https://t.me/BotFather), run `/newbot`, and copy the token and username.
2. Deploy this app to a public HTTPS origin. Telegram production Mini Apps and webhooks cannot use localhost.
3. Fill `.env.local` locally or equivalent secrets in the host:

```dotenv
TELEGRAM_BOT_TOKEN=123456:replace_me
TELEGRAM_BOT_USERNAME=my_tune_bot
NEXT_PUBLIC_APP_URL=https://music.example.com
TELEGRAM_WEBHOOK_SECRET=use_a_long_random_value
PLAYBACK_SIGNING_SECRET=use_another_long_random_value
DATABASE_PATH=./data/tunes.db
```

4. Configure the webhook, bot commands, and permanent menu button:

```bash
npm run telegram:set-webhook
```

5. In BotFather, optionally configure the same URL as the bot's Main Mini App under **Bot Settings → Configure Mini App**.
6. Send the bot an MP3/M4A audio message, open **My music**, and tap the track to stream it.

Keep `TELEGRAM_BOT_TOKEN` server-only. Never prefix it with `NEXT_PUBLIC_` or place Telegram file download URLs in client code.

## Deploy with Docker

```bash
docker build -t tunes-on-tg .
docker run --rm -p 3000:3000 \
  --env-file .env.local \
  -v tunes-data:/app/data \
  tunes-on-tg
```

Use one running app instance while SQLite is the database. Mount `/app/data` on a persistent volume and terminate TLS at your hosting provider or reverse proxy.

## Project map

```text
src/app/                         Mini App and API route handlers
src/app/api/telegram/webhook/    Telegram update ingestion
src/app/api/play/                Native-player queue handoff
src/app/api/tracks/              Signed audio and artwork streaming
src/components/music-app.tsx     Mobile music product interface
src/lib/auth.ts                  Telegram initData HMAC validation
src/lib/db.ts                    SQLite schema and user-scoped data access
src/lib/playback-ticket.ts       Expiring media URL signatures
src/lib/telegram-media.ts        Range-aware stateless media proxy
src/lib/telegram.ts              Minimal server-only Bot API client
scripts/set-webhook.ts           Bot webhook/menu bootstrap
```

## Sensible next steps

- Metadata editing for documents that arrive without artist/duration tags
- Playlist rename, delete, and drag-to-reorder
- Pagination and Telegram-aware rate limiting for large queues
- Postgres migration before horizontal scaling
- Inline mode for sharing a saved track into another chat
- Admin moderation, abuse controls, quotas, and a privacy policy before a public launch
- Optional short-lived edge caching after measuring streaming bandwidth

Users should only save and share audio they have the right to use. For a public launch, document retention and deletion behavior even though this app stores only Telegram file references.
