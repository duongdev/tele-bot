# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run:** `npm start` (executes `npx tsx src/runner.ts`)
- **Docker:** `docker compose up --build` (app + Cobalt + Redis)
- No build step, linter, or test suite configured.

## Environment Variables

`API_ID`, `API_HASH`, `STRING_SESSION` (Telegram client API credentials), `PROXY` (optional, format `host:port`, SOCKS5), `REDIS_URL` (optional, enables caching), `COBALT_API_URL` (Cobalt instance URL, defaults to `http://cobalt:9000`), `COBALT_API_KEY` (optional, for authenticated Cobalt instances).

Use a `.env` file locally (loaded via `@dotenvx/dotenvx`).

## Architecture

Telegram **client API** bot (GramJS via `telegram` package — not the Bot API). Listens to all messages across joined chats, detects media URLs from supported platforms (TikTok, Instagram, Twitter/X, YouTube), downloads media via a self-hosted [Cobalt](https://github.com/imputnet/cobalt) instance, and sends files back as replies with emoji reactions for progress status.

### Data Flow

```
Message received → extract media URLs (multi-platform regex)
→ POST to Cobalt API (cached in Redis, 5min TTL)
→ download file from tunnel/redirect URL → send file to chat → delete local file
```

### Key Files

- `src/runner.ts` — Entry point. Starts Telegram client, registers event handler.
- `src/handlers/handle-media-url-message.ts` — Message handler. Extracts media URLs from supported platforms, orchestrates download+send with retry logic (max 5 retries).
- `src/lib/cobalt.ts` — Cobalt API client. Calls Cobalt API, caches responses in Redis, downloads files. Handles tunnel/redirect (single file) and picker (multi-item) responses.
- `src/config/supported-services.ts` — URL pattern registry for supported platforms. `extractMediaUrls()` returns matched URLs from message text.
- `src/lib/telegram.ts` — Telegram client setup with optional SOCKS5 proxy, and `sendMessageReaction` helper.
- `src/lib/redis.ts` — Redis client singleton (connects lazily, returns `null` if `REDIS_URL` not set).
- `src/lib/logger.ts` — Re-exports `telegram` package Logger at DEBUG level.

### Conventions

- ES modules (`"type": "module"` in package.json).
- TypeScript with strict mode, run directly via `tsx` (no compilation step).
- Downloaded media files are saved to `downloads/` and deleted after sending.
- Emoji reactions (custom emoji IDs) indicate download progress: downloading, done, or error.
- Adding a new platform: add an entry to `SUPPORTED_SERVICES` in `src/config/supported-services.ts`.

## Deployment

Docker Compose on Dokploy (`dokploy.dustin.one`). Three services: app, cobalt, redis. Auto-deploys on push to `main`. Environment variables set via Dokploy compose env (not `.env` file in container).
