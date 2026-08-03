# tune — music on Telegram

`tune` is a Telegram bot plus Mini App for turning audio messages into a personal music library. A user sends or forwards music to the bot, organizes it in the Mini App, then sends a track, playlist, or shuffled queue back to Telegram's native audio player.

The project is intentionally one small Next.js service. It owns the UI, Telegram webhook, signed Mini App authentication, SQLite database, and Bot API calls.

## What works

- Private audio inbox: accepts Telegram `audio` messages and audio documents
- No copied audio: stores durable Telegram `file_id` references and metadata
- Per-user libraries validated from signed Telegram Mini App `initData`
- Searchable, responsive music UI with Telegram theme/safe-area support
- Playlist creation, add/remove tracks, play, and shuffle
- Native playback handoff through `sendAudio` / `sendMediaGroup`
- Local demo library for designing and testing without a bot token
- Webhook secret validation and user-scoped database queries

## The Telegram player boundary

Telegram does not expose its native audio player as a Mini App JavaScript API. A Mini App cannot start/pause Telegram's player, inspect its progress, or pass a `file_id` directly to it.

This app takes the server-light approach:

1. The bot records a Telegram `file_id`; it never downloads the music.
2. The Mini App creates and optionally shuffles a queue.
3. The backend sends the selected audio back to that user's bot chat using the stored `file_id`s.
4. Telegram renders those audio messages and plays them in its integrated player. The user taps play there.

That means the backend serves API traffic but not audio bytes. A true player inside the Mini App would require a protected streaming proxy (the direct Telegram file URL contains the bot token and must never reach the browser), plus server bandwidth and separate playback state.

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
DATABASE_PATH=./data/tunes.db
```

4. Configure the webhook, bot commands, and permanent menu button:

```bash
npm run telegram:set-webhook
```

5. In BotFather, optionally configure the same URL as the bot's Main Mini App under **Bot Settings → Configure Mini App**.
6. Send the bot an MP3/M4A audio message, open **My music**, and test the handoff.

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
src/components/music-app.tsx     Mobile music product interface
src/lib/auth.ts                  Telegram initData HMAC validation
src/lib/db.ts                    SQLite schema and user-scoped data access
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
- Optional in-app streaming mode only after making a deliberate bandwidth/storage decision

Users should only save and share audio they have the right to use. For a public launch, document retention and deletion behavior even though this app stores only Telegram file references.
