# Voice Notes

An app that **listens**, **saves what was said**, and turns it into **notes and proposals**: a summary, decisions, action items and suggestions.

> **Status:** Phase 0 (foundations) is done. You can sign up and sign in to the web app, and the API, database and storage run locally. Recording and transcription arrive in Phase 1. See [docs/PLAN.md](docs/PLAN.md) for the full roadmap.

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

## CI

GitHub Actions runs `pnpm turbo lint typecheck test` on every push and pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
