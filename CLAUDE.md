# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run:** `npm start` (executes `npx tsx src/runner.ts`)
- **Docker:** `docker compose up --build` (app + Redis)
- No build step, linter, or test suite configured.

## Environment Variables

`API_ID`, `API_HASH`, `STRING_SESSION` (Telegram client API credentials), `PROXY` (optional, format `host:port`, SOCKS5), `REDIS_URL` (optional, enables caching).

Use a `.env` file locally (loaded via `@dotenvx/dotenvx`).

## Architecture

Telegram **client API** bot (GramJS via `telegram` package — not the Bot API). Listens to all messages across joined chats, detects TikTok links, downloads videos, and sends them back as replies with emoji reactions for progress status.

### Data Flow

```
Message received → extract TikTok URLs → resolve redirects (cached in Redis)
→ fetch video metadata via TikTok API (cached in Redis) → download .mp4 to downloads/
→ send file to chat → delete local file
```

### Key Files

- `src/runner.ts` — Entry point. Starts Telegram client, registers event handler.
- `src/handlers/handle-tiktok-url-message.ts` — Message handler. Extracts TikTok URLs, orchestrates download+send with retry logic (max 10 retries).
- `src/tiktok.ts` — Download orchestrator. Wraps `lib/tiktok.js` with Redis caching for redirect URLs (24h TTL) and video metadata (10min TTL).
- `src/lib/tiktok.js` — Low-level TikTok scraping (plain JS, forked from n0l3r). Uses TikTok's internal API to get video download URLs. Also has unused interactive CLI functions.
- `src/lib/telegram.ts` — Telegram client setup with optional SOCKS5 proxy, and `sendMessageReaction` helper.
- `src/lib/redis.ts` — Redis client singleton (connects lazily, returns `null` if `REDIS_URL` not set).
- `src/lib/logger.ts` — Re-exports `telegram` package Logger at DEBUG level.
- `src/main.ts` — Legacy entry point (hardcoded values, progress messages instead of reactions). Not actively used.

### Conventions

- ES modules (`"type": "module"` in package.json).
- TypeScript with strict mode, run directly via `tsx` (no compilation step).
- `src/lib/tiktok.js` is plain JavaScript — keep it as JS when modifying.
- Downloaded videos are saved to `downloads/` and deleted after sending.
- Emoji reactions (custom emoji IDs) indicate download progress: downloading, done, or error.

## Deployment

Docker Compose on Dokploy (`dokploy.dustin.one`). Auto-deploys on push to `main`. Environment variables set via Dokploy compose env (not `.env` file in container).
