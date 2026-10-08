# Voice Notes

An app that **listens**, **saves what was said**, and turns it into **notes and proposals**: a summary, decisions, action items and suggestions.

> **Status:** Phase 1 (web MVP on the free stack) is built: record in the browser, automatic transcript and notes, editing, Markdown export. Deployment files are ready; going online is Task 1.16. See [docs/PLAN.md](docs/PLAN.md) for the full roadmap.

## How it works

Clients only **record** and **display**. All the AI work happens in background workers behind two interfaces, `SpeechToText` and `NotesGenerator`. Switching from cloud APIs to local models later means writing a new adapter, not rewriting the app.

```
Web / Desktop / Mobile ──► API (Fastify) ──► Postgres + pgvector
                               │          ──► S3 storage (audio)
                               └──► Redis queue ──► workers: transcribe → notes
```

## Tech stack

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| API | Node 22+, TypeScript (strict), Fastify, Zod |
| Database | PostgreSQL 16 + pgvector, Knex migrations |
| Auth | Better Auth (email + password) |
| Jobs | Redis + BullMQ *(Phase 1)* |
| Storage | S3-compatible: RustFS locally, Cloudflare R2 in production |
| Web | React, Vite, React Router, TanStack Query |
| Tests | Vitest |

## Getting started

**Prerequisites:** Node 22+ and Docker.

```bash
# 1. pnpm (the version is pinned in package.json, Corepack picks it up)
corepack enable pnpm

# 2. Dependencies
pnpm install

# 3. Environment
cp .env.example .env
#    then set BETTER_AUTH_SECRET in .env, e.g. to the output of: openssl rand -base64 32
#    AI keys are optional to start the app; the free stack needs GROQ_API_KEY (console.groq.com)

# 4. Postgres, Redis and S3 storage
docker compose up -d

# 5. Database tables (app tables, then auth tables)
pnpm --filter @vn/api knex migrate:latest
pnpm --filter @vn/api auth:migrate

# 6. Start API + web (turbo builds @vn/shared first)
pnpm dev
```

Then open http://localhost:5173 and create an account.

### Local services

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:5173 | |
| API | http://localhost:3000 | `GET /api/health` → `{"ok":true}` |
| Postgres | `localhost:5433` | Port 5433, so it doesn't clash with a locally installed Postgres. User/password: `app`/`app` |
| Redis | `localhost:6379` | |
| S3 API | http://localhost:9000 | Bucket `recordings` |
| S3 console | http://localhost:9001/rustfs/console/ | Login: `minio` / `minio12345` |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the API (with auto-reload) and the web app |
| `pnpm turbo lint typecheck test` | All checks, the same ones CI runs |
| `pnpm build` | Build every package |
| `pnpm format` | Format the code with Prettier |
| `pnpm --filter <pkg> <script>` | Run a script in one package (`@vn/api`, `@vn/shared`, `web`) |
| `pnpm --filter @vn/api knex migrate:latest` | Apply database migrations (`migrate:rollback` undoes the last batch) |
| `pnpm --filter @vn/api auth:migrate` | Create or update Better Auth's tables |

Turborepo caches task results in `.turbo/`. Add `--force` to run a task again without the cache.

## Project structure

```
apps/
  api/          Fastify API: config, auth, database, migrations
  web/          React app: pages, router, API and auth clients
packages/
  shared/       Zod schemas and types shared by the API and clients
docs/PLAN.md    Implementation plan, worked through task by task
```

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET, POST` | `/api/auth/*` | — | Better Auth (sign up, sign in, sign out, session) |
| `GET` | `/api/me` | ✓ | Current user's id |

## Deploy (free: Oracle Cloud + Caddy + DuckDNS + Cloudflare R2)

Step by step in [docs/PLAN.md](docs/PLAN.md), Task 1.16. On the server, with `.env` made from [.env.production.example](.env.production.example):

```bash
./scripts/deploy.sh      # pull, build web + images, migrate, start; Caddy gets the HTTPS certificate
./scripts/backup.sh      # Postgres dump → R2; run it daily from cron
```

## CI

GitHub Actions runs `pnpm turbo lint typecheck test` on every push and pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

The API tests put their jobs under their own Redis prefix (`QUEUE_PREFIX=test` in the `test` script), so they can run while the dev worker is running.

## Phase 1 acceptance test

Run this checklist again before each release. Use test recordings of your own voice: the free stack has no privacy guarantee.

| # | Check | How | Last result (2026-10-07, local, free stack) |
|---|---|---|---|
| 1 | 5 minutes of English → transcript and notes, no manual step | Chrome → New recording → Meeting → talk for 5+ minutes → Stop and save | ✅ 5:22 meeting; notes ready 10 s after saving |
| 2 | Lesson mode gives concepts + review questions; memo mode gives ideas | Record a short lesson and a short memo | ✅ lesson: 6 concepts, 7 review questions; memo: ideas filled |
| 3 | Proposals are specific to the content, not generic advice | Read the proposals of the meeting | ✅ e.g. "a walking-route map from the Leisure Center for the website" |
| 4 | A network drop during recording loses no audio | While recording, turn the network off for 20 s, then for 60 s (DevTools → Network → Offline, or Wi-Fi off) | ✅ all 25 turns in the transcript, also those said while offline. A 20 s drop recovers by itself; after a 60 s drop, Stop shows "Some audio could not be uploaded" and **Try again** finishes the upload |
| 5 | A recording longer than 60 minutes completes (map → reduce) | Record or upload 60+ minutes | ✅ 61.6 min: transcript in 57 s, notes in 4.3 min (5+ calls, 60 s apart), first attempt, decisions from item 1 to item 40 |
| 6 | Another user can't open your recording by guessing the URL | Sign in as a second user and open the first user's `/recordings/<id>` | ✅ every route returns 404 (401 signed out); the page says "This recording does not exist or was deleted." |
| 7 | `pnpm turbo lint typecheck test` is green | Run it; the dev worker may keep running | ✅ 9/9 tasks |
| 8 | All of the above with `STT_PROVIDER=groq` and `NOTES_PROVIDER=groq`, total cost $0 | Check `.env` | ✅ |
| 9 | Online at `https://<name>.duckdns.org`, recording works from a phone | Task 1.16 | ⏳ waits for the server |

The 2026-10-07 run used macOS text-to-speech voices instead of a person. Checks 1 and 4 played the speech into Chrome as the microphone, so the app's own recorder, uploader and retries were used. Checks 2 and 5 uploaded the audio through the API in 10 s chunks, like the browser.

Testing locally: Chrome's DevTools **Offline** also cuts the Vite dev server's connection, and after a long outage Vite reloads the page, which ends the recording. That only happens with `pnpm dev`; the built app has no Vite client.
