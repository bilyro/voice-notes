# Voice Notes App — Implementation Plan

An app that **listens**, **saves what was said**, and turns it into **notes and proposals** (summary, decisions, action items, suggestions).

> How to use this plan: work top to bottom. Every task has **Files**, **Steps**, **Verify**, and a **Commit** message. Don't start a task until the previous task's *Verify* passes. Tick the checkboxes as you go.

---

## 1. Decisions (agreed)

| Question | Decision |
|---|---|
| Platforms | Web, Desktop (Electron), Mobile (Expo / React Native) |
| Use cases | Meetings/calls, lessons/lectures, personal voice memos (all three) |
| Processing | Cloud APIs first, local (offline) processing added later |
| Cost | **Free stack first ($0)**: Groq free tier for speech + notes, everything self-hosted on one free server. **Paid stack second** (Phase 1b): OpenAI speech-to-text + Claude notes. Switching = 2 env variables |
| Languages | **English only for now**: speech-to-text is forced to `en` and notes are written in English. Ukrainian, auto-detect and a notes-language setting come later (Phase 2) |
| Build order | Backend + Web first → Desktop → Mobile → Live mode → Local processing |
| Business model | **Closed-source SaaS**: private GitHub repo, proprietary code (no open-source license), users pay a subscription. Portfolio = public landing page + demo video + case study; give interviewers read access to the repo on request |
| UI design | Approved: clean white, minimal, Instrument Sans, red only for recording. Spec in `docs/DESIGN.md`, mockups in `docs/design/screens/` |

**Main rule:** clients only *record* and *display*. All intelligence runs in background workers behind two interfaces (`SpeechToText`, `NotesGenerator`). Switching cloud → local later = writing a new adapter, not rewriting the app.

---

## 2. Architecture

```mermaid
flowchart TD
  W[Web app<br/>browser mic] --> API
  D[Desktop app<br/>Electron, mic + system audio] --> API
  M[Mobile app<br/>Expo, offline queue] --> API
  API[API server<br/>Fastify + TypeScript + auth] --> Q[Job queue<br/>Redis + BullMQ]
  API --> S3[(Object storage<br/>audio files)]
  API --> PG[(PostgreSQL + pgvector)]
  Q --> T[Transcribe worker<br/>SpeechToText adapter]
  Q --> N[Notes worker<br/>NotesGenerator adapter]
  T --> PG
  T --> S3
  N --> PG
```

**Recording lifecycle (status field):**

```
recording → uploaded → transcribing → summarizing → ready
                                   ↘ failed (error stored, retry possible)
```

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | One repo, shared types across 4 apps |
| API | Node 22+ + TypeScript 6.0 + Fastify 5 | Fast, good TS support, easy raw-body handling for audio. TS is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet |
| Architecture | Controller → Service → Repository | Clean layers, easy to test |
| DB access | Knex (migrations + query builder) | Explicit SQL, simple repositories |
| Validation | Zod (shared between API and clients) | One schema = types + runtime checks |
| DB | PostgreSQL 16 + pgvector | Data + semantic search in one place |
| Jobs | Redis + BullMQ | Retries, backoff, progress, separate worker process |
| Audio storage | S3-compatible: **RustFS locally**, **Cloudflare R2 in production** | Cheap, swappable, same code in both places. MinIO no longer publishes Docker images, so local dev uses RustFS (MinIO-compatible); production uses managed R2 (10 GB free) |
| Audio tools | ffmpeg (in worker) | Join chunks, normalize to mono 16 kHz |
| Auth | Better Auth (email + password to start) | Self-hosted, TS-first |
| Web | React + Vite + React Router + TanStack Query | Simple, fast dev loop |
| UI design | `docs/DESIGN.md` (tokens, components, rules) + reference mockups in `docs/design/screens/` | Approved design; every screen follows it |
| Speech-to-text | One OpenAI-compatible adapter. **Free:** Groq `whisper-large-v3-turbo`. **Paid:** OpenAI `whisper-1` | Both return segment timestamps (`verbose_json`); only base URL + model change. Swap later for a provider with diarization |
| Notes LLM | **Free:** Groq open model (`openai/gpt-oss-120b`) via JSON mode. **Paid:** Claude via `@anthropic-ai/sdk` (forced tool use) | Both behind `NotesGenerator`; shared chunking logic |
| Free hosting | Oracle Cloud Always Free Arm VM + Docker Compose + Caddy (HTTPS) + DuckDNS (free domain) | Whole stack on one $0 server |
| Tests | Vitest | Fast, TS-native |
| Later | Electron, Expo, whisper.cpp, Ollama | Phases 3–6 |

> Before locking the STT provider: record 3–4 real English samples (a call, a lecture, a memo) and compare 2–3 providers on accuracy, speaker labels and price per minute. Keep the winner behind the adapter. Repeat with Ukrainian samples when Ukrainian is added.

---

## 4. Repository layout

```
voice-notes/
├─ CLAUDE.md                    # rules for Claude Code
├─ LICENSE                      # proprietary (closed SaaS)
├─ docs/
│  ├─ PLAN.md                   # this plan
│  ├─ DESIGN.md                 # design spec
│  └─ design/screens/           # reference mockups (.dc.html, not production code)
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ docker-compose.yml
├─ docker-compose.prod.yml      # free server deployment (Task 1.16)
├─ Caddyfile                    # HTTPS + routing on the server (Task 1.16)
├─ .env.example
├─ .github/workflows/ci.yml
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ index.ts
│        ├─ schemas/recording.ts
│        ├─ schemas/transcript.ts
│        ├─ schemas/notes.ts
│        ├─ notes-to-markdown.ts       # Task 1.14
│        └─ api-client.ts              # later (Phase 4), when mobile needs it
└─ apps/
   ├─ api/
   │  ├─ Dockerfile                   # one image for API + worker (Task 1.16)
   │  ├─ knexfile.ts
   │  ├─ migrations/
   │  ├─ scripts/                     # auth-migrate.ts, try-stt.ts, try-notes.ts
   │  └─ src/
   │     ├─ server.ts            # HTTP entry
   │     ├─ worker.ts            # BullMQ worker entry (separate process)
   │     ├─ config.ts
   │     ├─ db.ts
   │     ├─ auth.ts
   │     ├─ plugins/require-user.ts
   │     ├─ modules/recordings/
   │     │  ├─ recordings.controller.ts
   │     │  ├─ recordings.service.ts
   │     │  └─ recordings.repository.ts
   │     ├─ storage/storage.service.ts
   │     ├─ queue/queues.ts
   │     ├─ jobs/transcribe.job.ts
   │     ├─ jobs/notes.job.ts
   │     ├─ jobs/mark-failed.ts
   │     ├─ audio/prepare-audio.ts
   │     ├─ ai/providers.ts                  # the ONLY place that picks adapters
   │     ├─ ai/stt/speech-to-text.ts         # interface
   │     ├─ ai/stt/openai-compatible-stt.ts  # Groq (free) + OpenAI (paid)
   │     ├─ ai/stt/fake-stt.ts               # for tests
   │     ├─ ai/notes/notes-generator.ts      # interface
   │     ├─ ai/notes/chunked-notes.ts        # shared map → reduce logic
   │     ├─ ai/notes/groq-notes.ts           # free adapter
   │     ├─ ai/notes/claude-notes.ts         # paid adapter
   │     ├─ ai/notes/prompts.ts
   │     └─ ai/notes/fake-notes.ts           # for tests
   └─ web/
      └─ src/
         ├─ main.tsx
         ├─ router.tsx
         ├─ lib/api.ts
         ├─ lib/auth-client.ts
         ├─ styles/{tokens,base}.css         # design tokens (docs/DESIGN.md)
         ├─ recorder/use-recorder.ts
         ├─ recorder/chunk-uploader.ts
         ├─ pages/{LoginPage,SignUpPage}.tsx
         ├─ pages/RecordPage.tsx
         ├─ pages/RecordingsPage.tsx
         ├─ pages/RecordingDetailPage.tsx
         └─ components/{RequireAuth,AppShell,Sidebar,Button,AudioPlayer,Tabs,Transcript,NotesEditor}.tsx
```

---

## 5. Cost strategy — free first, paid later

You build and test everything on a **$0 stack**, then switch the AI parts to **paid APIs** when you start recording other people or need better quality. Hosting stays free in both stages. Prices below were checked in October 2026 — free tiers change often (Oracle halved its free VM in 2026), so re-check each provider's pricing page before you rely on it.

### Stage 1 — Free stack (Phases 0–1)

| Part | Free choice | Free limits (Oct 2026) |
|---|---|---|
| Development | Your computer + `docker-compose.yml` | none |
| Server | Oracle Cloud Always Free, Arm VM `VM.Standard.A1.Flex` | 2 OCPU, 12 GB RAM, 200 GB disk; creating the VM often fails with "out of capacity" — retry |
| Postgres, Redis | Self-hosted in Docker on that VM (Postgres + pgvector, Redis) | limited only by the VM |
| Audio storage | Cloudflare R2 | 10 GB storage free (≈ 900 hours of audio at 24 kbps), free egress; Cloudflare may ask for a payment method to enable R2 (verification only) |
| Domain + HTTPS | DuckDNS subdomain + Caddy (automatic HTTPS) | free; HTTPS is required for the browser microphone |
| Speech-to-text | Groq `whisper-large-v3-turbo` | ~8 h of audio/day, 2,000 requests/day, 25 MB per file |
| Notes LLM | Groq `openai/gpt-oss-120b` | small tokens-per-minute and tokens-per-day limits → long recordings are processed in small chunks with pauses (a 1-hour recording takes a few minutes) |

⚠️ **Privacy rule for the free stage:** Groq's free tier gives no data-privacy guarantees. Use it only for **test recordings of your own voice** (or people who explicitly agreed). Real meetings and classes wait for Stage 2.

### Stage 2 — Paid stack (Phase 1b)

| Part | Paid choice | Price (Oct 2026) |
|---|---|---|
| Server, DB, storage | unchanged (Oracle free VM + R2) | $0 (R2 above 10 GB: $0.015 per GB-month) |
| Speech-to-text | OpenAI `whisper-1` | $0.006 / min = $0.36 / hour |
| Notes LLM | Claude Haiku 4.5 (cheapest) or Claude Sonnet 5.5 (better) | ≈ $0.02–0.05 per 1-hour recording |

Why `whisper-1` and not the cheaper `gpt-4o-mini-transcribe` ($0.003/min): the gpt-4o transcribe models return only plain text/JSON without segment timestamps, and the app needs timestamps for click-to-seek. In Phase 2, `gpt-4o-transcribe-diarize` (same $0.006/min) is the candidate for speaker labels.

**Rough monthly cost:** 20 hours of recordings ≈ **$8** (20 × $0.36 + notes). Always set `MONTHLY_MINUTES_LIMIT` and a spend limit in the OpenAI and Anthropic consoles.

### When to switch from free to paid
- you want to record other people (meetings, classes),
- you hit Groq's daily limits,
- notes quality from the free model is not good enough for you (compare on the same recordings — Task 1b.3).

---

## 6. Phase 0 — Foundations (≈1 week)

**Goal:** the web app logs in and calls a typed `/health` endpoint; DB, Redis and storage run locally.

> Tasks 0.1–0.8 are written **as built**. Changes decided after they were built are collected in Task 0.9.

### Task 0.1 — Create the monorepo
- [x] **Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.prettierrc`, `eslint.config.js`
- [x] **Steps:**

```bash
mkdir voice-notes && cd voice-notes && git init
pnpm init
pnpm add -Dw turbo typescript@~6.0 prettier eslint typescript-eslint vitest
mkdir -p apps packages
```

> `pnpm init` adds `"packageManager": "pnpm@<version>"`, which Turborepo requires and CI reads. Run `corepack enable pnpm` once so the `pnpm` binary is on PATH; turbo calls it directly.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev":       { "cache": false, "persistent": true },
    "lint":      {},
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] }
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  }
}
```

- [x] **Verify:** `pnpm turbo lint` runs without errors (nothing to lint yet is fine).
- [x] **Commit:** `chore: init monorepo with pnpm + turbo`

### Task 0.2 — Local infrastructure with Docker Compose
- [x] **Files:** `docker-compose.yml`, `.env.example`

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: voice_notes
    ports: ["5433:5432"]   # 5433 on the host: avoids clashing with a locally installed Postgres
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7
    ports: ["6379:6379"]

  # S3-compatible storage. MinIO stopped publishing Docker images, so we use RustFS
  # (MinIO-compatible). Credentials match S3_ACCESS_KEY / S3_SECRET_KEY in .env.example.
  s3:
    image: rustfs/rustfs:latest
    environment:
      RUSTFS_ACCESS_KEY: minio
      RUSTFS_SECRET_KEY: minio12345
      RUSTFS_CONSOLE_ENABLE: "true"
    ports: ["9000:9000", "9001:9001"]
    volumes: [s3data:/data]

  createbucket:
    image: amazon/aws-cli
    depends_on: [s3]
    environment:
      AWS_ACCESS_KEY_ID: minio
      AWS_SECRET_ACCESS_KEY: minio12345
      AWS_DEFAULT_REGION: us-east-1
    entrypoint: >
      /bin/sh -c "until aws --endpoint-url http://s3:9000 s3 ls >/dev/null 2>&1; do sleep 1; done &&
      (aws --endpoint-url http://s3:9000 s3api head-bucket --bucket recordings 2>/dev/null ||
      aws --endpoint-url http://s3:9000 s3 mb s3://recordings)"

volumes:
  pgdata:
  s3data:
```

```bash
# .env.example
DATABASE_URL=postgres://app:app@localhost:5433/voice_notes
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=recordings
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio12345
BETTER_AUTH_SECRET=change-me-to-a-long-random-string
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:5173
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NOTES_MODEL=claude-sonnet-5-5
MONTHLY_MINUTES_LIMIT=600
```

- [x] **Verify:** `docker compose up -d` → RustFS console at `http://localhost:9001/rustfs/console/` (login `minio` / `minio12345`) shows bucket `recordings`; `docker compose exec postgres psql -U app voice_notes -c "select 1"` works.
- [x] **Commit:** `chore: add docker compose for postgres, redis, minio`

> Postgres is exposed on host port **5433**, so it doesn't clash with a locally installed Postgres on 5432. Inside Docker it still listens on 5432.

### Task 0.3 — Shared package (schemas + types)
- [x] **Files:** `packages/shared/package.json`, `packages/shared/src/schemas/*.ts`, `packages/shared/src/index.ts`
- [x] **Steps:** `pnpm --filter @vn/shared add zod` (Zod v4)

```ts
// packages/shared/src/schemas/recording.ts
import { z } from "zod";

export const RecordingMode = z.enum(["meeting", "lesson", "memo"]);
export const RecordingStatus = z.enum([
  "recording", "uploaded", "transcribing", "summarizing", "ready", "failed",
]);
export const LanguageCode = z.enum(["uk", "en", "auto"]);

export const CreateRecordingInput = z.object({
  title: z.string().min(1).max(200).optional(),
  mode: RecordingMode,
  language: LanguageCode.default("auto"),
  mimeType: z.string(),                     // e.g. "audio/webm;codecs=opus"
  source: z.enum(["web", "desktop", "mobile"]),
});

export const Recording = z.object({
  id: z.uuid(),
  title: z.string(),
  mode: RecordingMode,
  language: LanguageCode,
  status: RecordingStatus,
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export type Recording = z.infer<typeof Recording>;
export type CreateRecordingInput = z.infer<typeof CreateRecordingInput>;
export type RecordingMode = z.infer<typeof RecordingMode>;
```

```ts
// packages/shared/src/schemas/transcript.ts
import { z } from "zod";

export const Segment = z.object({
  startMs: z.number().int(),
  endMs: z.number().int(),
  speaker: z.string().nullable(),   // null until diarization (Phase 2)
  text: z.string(),
});
export type Segment = z.infer<typeof Segment>;
```

```ts
// packages/shared/src/schemas/notes.ts
import { z } from "zod";

export const ActionItem = z.object({
  text: z.string(),
  owner: z.string().nullable(),
  dueDate: z.string().nullable(),          // as said, e.g. "next Friday"
});

export const Notes = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(ActionItem),
  proposals: z.array(z.string()),          // AI suggestions / next steps
  openQuestions: z.array(z.string()),
  // mode-specific extras (empty arrays when not relevant)
  concepts: z.array(z.object({ term: z.string(), explanation: z.string() })),
  reviewQuestions: z.array(z.string()),
  ideas: z.array(z.string()),
});
export type Notes = z.infer<typeof Notes>;
```

- [x] **Verify:** `pnpm --filter @vn/shared build` produces `dist/` with `.d.ts` files.
- [x] **Commit:** `feat(shared): add recording, transcript and notes schemas`

### Task 0.4 — API skeleton + config
- [x] **Files:** `apps/api/package.json`, `apps/api/src/config.ts`, `apps/api/src/server.ts`
- [x] **Steps:** `pnpm --filter @vn/api add fastify @fastify/cors zod dotenv "@vn/shared@workspace:*"` and `-D tsx @types/node`
  (`workspace:*` is required: pnpm doesn't link workspace packages automatically and would look for `@vn/shared` on npm)
- [x] **Scripts:** `"dev": "DOTENV_PATH=../../.env tsx watch src/server.ts"`. `.env` lives at the repo root, but `dotenv/config` reads from the process's working directory (`apps/api`). dotenv 18 renamed `DOTENV_CONFIG_PATH` to `DOTENV_PATH`.

```ts
// apps/api/src/config.ts
import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  WEB_ORIGIN: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NOTES_MODEL: z.string().default("claude-sonnet-5-5"),
  MONTHLY_MINUTES_LIMIT: z.coerce.number().default(600),
});

export const config = Env.parse(process.env); // crash early if env is wrong
```

```ts
// apps/api/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });

  app.get("/health", async () => ({ ok: true }));

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    // Fastify 5.12 types `err` as unknown: anything can be thrown, so narrow before reading fields
    const status =
      err instanceof Error && "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    reply.status(status).send({ error: status === 500 ? "Internal error" : message });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
```

- [x] **Verify:** `pnpm --filter @vn/api dev` then `curl localhost:3000/health` → `{"ok":true}`
- [x] **Commit:** `feat(api): fastify skeleton with typed config and health route`

### Task 0.5 — Database + migrations
- [x] **Files:** `apps/api/knexfile.ts`, `apps/api/src/db.ts`, `apps/api/migrations/001_init.ts`
- [x] **Steps:** `pnpm --filter @vn/api add knex pg`
- [x] **Notes (as built):** `src/db.ts` exports `knexConfig` + `db`, and `knexfile.ts` just re-exports the config. The `knex` script runs the CLI under tsx (`DOTENV_PATH=../../.env NODE_OPTIONS="--import tsx" knex`), because Node's built-in TS support doesn't map `./x.js` imports to `x.ts`. `tsconfig` includes `migrations/`, `scripts/` and `knexfile.ts`.

```ts
// apps/api/migrations/001_init.ts
import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.raw("create extension if not exists vector");
  await knex.raw("create extension if not exists pgcrypto");

  await knex.schema.createTable("recordings", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("user_id").notNullable().index();          // id from Better Auth
    t.text("title").notNullable().defaultTo("Untitled recording");
    t.text("mode").notNullable();                     // meeting | lesson | memo
    t.text("language").notNullable().defaultTo("auto");
    t.text("status").notNullable().defaultTo("recording");
    t.text("source").notNullable();
    t.text("mime_type").notNullable();
    t.integer("chunk_count").notNullable().defaultTo(0);
    t.integer("duration_ms");
    t.text("audio_key");                              // normalized file in S3
    t.text("error");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("transcript_segments", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.integer("start_ms").notNullable();
    t.integer("end_ms").notNullable();
    t.text("speaker");
    t.text("text").notNullable();
    t.specificType("embedding", "vector(1536)");      // filled in Phase 2
  });

  await knex.schema.createTable("notes", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.integer("version").notNullable().defaultTo(1);
    t.jsonb("content").notNullable();
    t.boolean("edited_by_user").notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("action_items", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.text("user_id").notNullable().index();
    t.text("text").notNullable();
    t.text("owner");
    t.text("due_date");
    t.boolean("done").notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTable("action_items");
  await knex.schema.dropTable("notes");
  await knex.schema.dropTable("transcript_segments");
  await knex.schema.dropTable("recordings");
}
```

- [x] **Verify:** `pnpm --filter @vn/api knex migrate:latest` then `\dt` in psql shows the 4 tables. `migrate:rollback` + `migrate:latest` works again.
- [x] **Commit:** `feat(api): initial database schema`

> The embedding dimension (1536) depends on the embedding model you pick in Phase 2 — change it then with a new migration.

### Task 0.6 — Authentication
- [x] **Files:** `apps/api/src/auth.ts`, `apps/api/src/plugins/require-user.ts`
- [x] **Steps:** install Better Auth and follow its official Fastify integration guide (mount its handler under `/api/auth/*`, run its migration). Enable email + password only for now.
- [x] **As built:** `pnpm --filter @vn/api add better-auth` + `-D @types/pg`. Tables are created with `pnpm --filter @vn/api auth:migrate` (`scripts/auth-migrate.ts`, which uses `getMigrations` from `better-auth/db/migration`): `user`, `session`, `account` (holds password hashes) and `verification`. `config.ts` validates `BETTER_AUTH_SECRET` (min 32 chars) and `BETTER_AUTH_URL`. `trustedOrigins: [WEB_ORIGIN]`. The protected test route is `GET /me` → `{ userId }`.
- **A fresh database needs both migrations:** `knex migrate:latest` (app tables) and `auth:migrate` (auth tables).

```ts
// apps/api/src/plugins/require-user.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

declare module "fastify" {
  interface FastifyRequest { userId: string }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return reply.status(401).send({ error: "Unauthorized" });
  req.userId = session.user.id;
}
```

- [x] **Verify:** sign up + sign in via curl or the web app; a test route with `preHandler: requireUser` returns 401 without a cookie and 200 with one.
- [x] **Commit:** `feat(api): email/password auth with Better Auth`

### Task 0.7 — Web skeleton
- [x] **Files:** `apps/web/*` (Vite React TS template), `src/router.tsx`, `src/lib/api.ts`, login + sign-up pages
- [x] **Steps:**

```bash
pnpm create vite apps/web --template react-ts
pnpm --filter web add react-router @tanstack/react-query better-auth "@vn/shared@workspace:*"
```

```ts
// apps/web/src/lib/api.ts
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

> **As built:** React Router **v8**: import `RouterProvider` from `react-router/dom` and everything else from `react-router` (`react-router-dom` no longer exists). create-vite now ships **oxlint** (kept: it checks React's rules of hooks). Auth uses `createAuthClient` from `better-auth/react` (`lib/auth-client.ts`). A `RequireAuth` layout route guards pages. After sign-in/sign-up, `await useSession().refetch()` **before** `navigate()`, otherwise the guard sees the stale signed-out session and bounces back to `/login`.

- [x] **Verify:** open `http://localhost:5173`, sign up, land on an empty "Recordings" page; page shows the result of `/health`.
- [x] **Commit:** `feat(web): vite react skeleton with auth pages`

### Task 0.8 — CI
- [x] **Files:** `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6          # version comes from "packageManager" in package.json
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck test
```

> The v4 actions run on Node 20, which GitHub has deprecated, so we use the current majors. pnpm 12 **fails** a CI install when a dependency's build script was skipped without an explicit decision, so `pnpm-workspace.yaml` lists `allowBuilds: { esbuild: false }`. Add an entry there for each new package with a build script.

- [x] **Verify:** push to GitHub → green check.
- [x] **Commit:** `ci: lint, typecheck, test on every push`

### Task 0.9 — Catch-up: align Phase 0 with decisions made after it was built
Phase 0 was built before these decisions: free stack first, closed SaaS, the approved design, and `@vn/shared` being imported by the apps. This task brings the existing code in line. One session; skip any item that is already true.

- [x] **Turbo:** in `turbo.json`, `dev` gets `"dependsOn": ["^build"]`, so `pnpm dev` on a fresh clone builds `@vn/shared` before the apps import it.
- [x] **Repo (closed SaaS):** the GitHub repo is **Private**. Add `LICENSE` with `Copyright (c) 2026 <your full name>. All rights reserved.` and the proprietary notice (no MIT). `.gitignore` ignores `.env` and `.env.*` but not `.env.example`. Run `git log --all --oneline -- .env`: it must print nothing. If a real key was ever committed, revoke it in the provider's console.
- [x] **`.env.example`:** **replace** the existing `OPENAI_API_KEY=`, `ANTHROPIC_API_KEY=` and `NOTES_MODEL=` lines with this block, so no key appears twice. It also makes Haiku the paid-stage default. Make the same change in your local `.env`.

```bash
# --- AI providers: FREE stack by default (Stage 1) ---
STT_PROVIDER=groq                 # groq (free) | openai (paid)
NOTES_PROVIDER=groq               # groq (free) | claude (paid)
GROQ_API_KEY=                     # console.groq.com, no card needed
GROQ_NOTES_MODEL=openai/gpt-oss-120b
GROQ_NOTES_MAX_CHARS=16000        # small chunks because free-tier tokens/minute are low
# --- paid stack only (Stage 2, Phase 1b) ---
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NOTES_MODEL=claude-haiku-4-5
```

- [x] **`config.ts`:** add these fields to `Env` and export the Groq URL. Do **not** require any AI key here: the API server must start without them (the worker checks keys in Task 1.6).

```ts
  STT_PROVIDER: z.enum(["groq", "openai"]).default("groq"),
  NOTES_PROVIDER: z.enum(["groq", "claude"]).default("groq"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_NOTES_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_NOTES_MAX_CHARS: z.coerce.number().default(16_000),
  NOTES_MODEL: z.string().default("claude-haiku-4-5"),   // replaces the old default
```

```ts
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";   // Groq is OpenAI-compatible
```

- [x] **All API routes under `/api`** (decided for the free deploy, Task 1.16; done now so dev and production use the same paths and Phase 1 routes are written under it from the start):
  - `server.ts`: register app routes inside `app.register(async (api) => { ... }, { prefix: "/api" })`, so `/health` → `/api/health` and `/me` → `/api/me`. Keep `registerAuthRoutes(app)` **outside** that plugin: its route is already `/api/auth/*`, and inside it would become `/api/api/auth/*`.
  - `apps/web/src/lib/api.ts`: default `BASE` becomes `"http://localhost:3000/api"`; production builds set `VITE_API_URL=/api`.
  - `apps/web/src/lib/auth-client.ts`: **don't** pass `VITE_API_URL` to Better Auth. It appends `/api/auth` itself and rejects relative URLs like `/api` ("Invalid base URL"). Use the API origin in dev, and leave `baseURL` out in production, which makes it use `window.location.origin`:

```ts
export const authClient = createAuthClient({
  // dev: API on another port; production: same origin (Caddy routes /api/* to the API)
  baseURL: import.meta.env.DEV ? "http://localhost:3000" : undefined,
});
```

- [x] **Design (Task 0.7 was built before the design existed):** read `docs/DESIGN.md`. Load Instrument Sans (400/500/600/700) in `apps/web/index.html`; create `src/styles/tokens.css` (DESIGN.md section 2) and `src/styles/base.css` (font, colors, `:focus-visible` outline); build `AppShell` + `Sidebar` like the reference screens (only Recordings and New recording visible for now); restyle sign-in / sign-up with the tokens (centered 400px column, h1, two inputs, black primary button).
- [x] **Verify:** with an `.env` that has **no AI keys**, `docker compose up -d && pnpm dev` starts API + web from a clean `packages/shared/dist`; `curl localhost:3000/api/health` → `{"ok":true}` and sign-up / sign-in still work; the web app shows the sidebar shell and an empty Recordings page; at phone width the sidebar stacks on top; Tab shows a visible focus outline; `pnpm turbo lint typecheck test` is green.
- [x] **Commit:** `chore: align phase 0 with current plan (turbo, license, config, design)`

### ✅ Phase 0 done when
- [ ] `docker compose up -d && pnpm dev` starts API + web
- [ ] Sign up / sign in works
- [ ] CI is green

---

## 7. Phase 1 — Web MVP on the free stack (≈3 weeks)

**Goal:** record in the browser → audio uploads in chunks → transcript → notes & proposals appear automatically → you can edit and export them. Everything runs on the free stack ($0) and goes online in Task 1.16.

### Task 1.0 — English-only language field
- [x] **Files:** `packages/shared/src/schemas/recording.ts`, `apps/api/migrations/002_english_only.ts`
- [x] **Why:** we support English only for now (Section 1), but Task 0.3/0.5 built `uk | en | auto` with default `auto`. We keep the `language` field, so adding Ukrainian later is an enum change plus UI, but restrict it to `en`.

```ts
// packages/shared/src/schemas/recording.ts (changes)
export const LanguageCode = z.enum(["en"]);           // add "uk" / "auto" in Phase 2
export type LanguageCode = z.infer<typeof LanguageCode>;
// in CreateRecordingInput:
  language: LanguageCode.default("en"),
```

```ts
// apps/api/migrations/002_english_only.ts
import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex("recordings").whereNot("language", "en").update({ language: "en" });
  await knex.raw("alter table recordings alter column language set default 'en'");
}

export async function down(knex: Knex) {
  await knex.raw("alter table recordings alter column language set default 'auto'");
}
```

- [x] **Verify:** `pnpm turbo typecheck` is green; `knex migrate:latest` then `\d recordings` shows `language ... default 'en'`; `migrate:rollback` + `migrate:latest` works.
- [x] **Commit:** `feat: restrict recording language to English for now`

### Task 1.1 — Storage service
- [x] **Files:** `apps/api/src/storage/storage.service.ts`
- [x] **Steps:** `pnpm --filter @vn/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

```ts
// apps/api/src/storage/storage.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { config } from "../config.js";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,                        // needed for RustFS/MinIO, also works with R2
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
});

export const storage = {
  put: (key: string, body: Buffer, contentType: string) =>
    s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: contentType })),

  async getStream(key: string): Promise<Readable> {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return res.Body as Readable;
  },

  signedUrl: (key: string, seconds = 3600) =>
    getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), { expiresIn: seconds }),

  async deletePrefix(prefix: string) {
    // one list call returns at most 1000 keys (~2.7 h of 10 s chunks), so page through
    let token: string | undefined;
    do {
      const list = await s3.send(new ListObjectsV2Command({ Bucket: config.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: config.S3_BUCKET, Delete: { Objects: objects } }));
      token = list.NextContinuationToken;
    } while (token);
  },
};

export const keys = {
  chunk: (recId: string, i: number) => `recordings/${recId}/chunks/${String(i).padStart(5, "0")}`,
  audio: (recId: string) => `recordings/${recId}/audio.ogg`,
  prefix: (recId: string) => `recordings/${recId}/`,
};
```

- [x] **CI needs the services too.** This is the first test that talks to them, and CI has no Postgres, Redis or S3, so it would go red. Give Postgres a healthcheck in `docker-compose.yml`, so `--wait` waits until it accepts connections:

```yaml
  postgres:
    # ...existing settings...
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d voice_notes"]
      interval: 2s
      retries: 30
```

  and add these steps to `.github/workflows/ci.yml`, before `pnpm turbo lint typecheck test`:

```yaml
      - run: cp .env.example .env                     # config.ts needs the variables; no AI keys required
      - run: docker compose up -d --wait postgres redis s3
      - run: docker compose run --rm createbucket     # finishes once the bucket exists
      - run: pnpm --filter @vn/api knex migrate:latest && pnpm --filter @vn/api auth:migrate
```

- [x] **Verify:** a small Vitest integration test puts a buffer, reads it back, deletes the prefix (runs against local RustFS); CI is green with the new steps.
- [x] **Commit:** `feat(api): s3 storage service`

### Task 1.2 — Recordings repository + service + controller
- [x] **Files:** `apps/api/src/modules/recordings/*`
- [x] **Endpoints** (registered inside the `/api` prefix from Task 0.9, so `/recordings` is served at `/api/recordings`; all use `preHandler: requireUser` and check `recording.user_id === req.userId`):

| Method | Path | Does |
|---|---|---|
| `POST` | `/recordings` | Create recording (status `recording`), returns `{ id }` |
| `PUT` | `/recordings/:id/chunks/:index` | Store one raw audio chunk (body = bytes). Only while status is `recording`, else 409 |
| `POST` | `/recordings/:id/finish` | Body `{ chunkCount, durationMs }` → status `uploaded`, enqueue `transcribe` job |
| `GET` | `/recordings` | List (newest first) |
| `GET` | `/recordings/:id` | Recording + segments + latest notes |
| `GET` | `/recordings/:id/audio` | `{ url }` signed URL for the player |
| `PUT` | `/recordings/:id/notes` | Save user-edited notes (new version, `edited_by_user = true`) |
| `POST` | `/recordings/:id/retry` | Re-enqueue from the failed step |
| `DELETE` | `/recordings/:id` | Delete DB rows + all audio under the prefix |

```ts
// apps/api/src/modules/recordings/recordings.controller.ts (excerpt)
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateRecordingInput } from "@vn/shared";
import { requireUser } from "../../plugins/require-user.js";
import { RecordingsService } from "./recordings.service.js";

export async function recordingsController(app: FastifyInstance, service: RecordingsService) {
  // accept raw audio bytes for chunk uploads
  app.addContentTypeParser(
    ["application/octet-stream", "audio/webm", "audio/mp4", "audio/ogg"],
    { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post("/recordings", { preHandler: requireUser }, async (req, reply) => {
    const input = CreateRecordingInput.parse(req.body);
    const rec = await service.create(req.userId, input);
    return reply.status(201).send({ id: rec.id });
  });

  app.put("/recordings/:id/chunks/:index", { preHandler: requireUser }, async (req, reply) => {
    const { id, index } = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0) }).parse(req.params);
    await service.saveChunk(req.userId, id, index, req.body as Buffer);
    return reply.status(204).send();
  });

  app.post("/recordings/:id/finish", { preHandler: requireUser }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const body = z.object({ chunkCount: z.number().int().min(1), durationMs: z.number().int() }).parse(req.body);
    await service.finish(req.userId, id, body);
    return { ok: true };
  });

  // ...GET list, GET one, GET audio, PUT notes, POST retry, DELETE
}
```

```ts
// apps/api/src/modules/recordings/recordings.service.ts (excerpt)
export class RecordingsService {
  constructor(private repo: RecordingsRepository, private queues: Queues) {}

  async finish(userId: string, id: string, body: { chunkCount: number; durationMs: number }) {
    const rec = await this.repo.getOwned(userId, id);               // throws 404 if not owner
    if (rec.status !== "recording") throw httpError(409, "Already finished");
    await this.checkMonthlyLimit(userId, body.durationMs);          // cost guard
    await this.repo.update(id, { status: "uploaded", chunk_count: body.chunkCount, duration_ms: body.durationMs });
    await this.queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });
  }
}
```

- [x] **Verify:** Vitest tests with `app.inject()`: create → upload 2 chunks → finish → status is `uploaded`; another user gets 404 for the same id.
- [x] **Commit:** `feat(api): recordings endpoints with chunked upload`

### Task 1.3 — Queues and worker process
- [x] **Files:** `apps/api/src/queue/queues.ts`, `apps/api/src/worker.ts`, `apps/api/src/jobs/mark-failed.ts`
- [x] **Steps:** `pnpm --filter @vn/api add bullmq ioredis`, and add the script `"worker": "DOTENV_PATH=../../.env tsx watch src/worker.ts"`

> **Job ids:** BullMQ throws `Custom Id cannot contain :`, so use `transcribe-<id>` / `notes-<id>`. Also, `add()` with an id that **already exists** (including a kept failed job) is silently ignored. See retry in Task 1.15.

```ts
// apps/api/src/queue/queues.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

const defaults = { attempts: 3, backoff: { type: "exponential" as const, delay: 10_000 }, removeOnComplete: 100 };

export const queues = {
  transcribe: new Queue<{ recordingId: string }>("transcribe", { connection, defaultJobOptions: defaults }),
  notes: new Queue<{ recordingId: string }>("notes", { connection, defaultJobOptions: defaults }),
};
export type Queues = typeof queues;
```

```ts
// apps/api/src/worker.ts
import { Worker } from "bullmq";
import { connection } from "./queue/queues.js";
import { transcribeJob } from "./jobs/transcribe.job.js";
import { notesJob } from "./jobs/notes.job.js";
import { markFailed } from "./jobs/mark-failed.js";

const opts = { connection, concurrency: 2 };

for (const w of [
  new Worker("transcribe", (job) => transcribeJob(job.data.recordingId), opts),
  new Worker("notes", (job) => notesJob(job.data.recordingId), opts),
]) {
  w.on("failed", async (job, err) => {
    // only mark failed after the last retry
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) await markFailed(job.data.recordingId, err.message);
  });
}
console.log("Worker started");
```

```ts
// apps/api/src/jobs/mark-failed.ts
import { repo } from "../modules/recordings/recordings.repository.js";

export const markFailed = (recordingId: string, error: string) =>
  repo.update(recordingId, { status: "failed", error });
```

- [x] **Verify:** `pnpm --filter @vn/api worker` starts; finishing a recording shows a job in Redis (`redis-cli keys 'bull:*'`).
- [x] **Commit:** `feat(api): bullmq queues and worker entrypoint`

### Task 1.4 — Audio preparation (join chunks + normalize)
- [x] **Files:** `apps/api/src/audio/prepare-audio.ts`
- [x] **Steps:** install ffmpeg on your machine / in the worker Docker image. Join chunks **in order**, then convert to mono 16 kHz Opus (small files, and whisper.cpp will need 16 kHz later anyway).

```ts
// apps/api/src/audio/prepare-audio.ts
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { storage, keys } from "../storage/storage.service.js";

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err}`))));
  });
}

/** Returns the local path of the normalized file and uploads it to storage. */
export async function prepareAudio(recordingId: string, chunkCount: number) {
  const dir = await mkdtemp(join(tmpdir(), `rec-${recordingId}-`));
  const raw = join(dir, "raw");
  const out = join(dir, "audio.ogg");

  const file = createWriteStream(raw);
  for (let i = 0; i < chunkCount; i++) {
    await pipeline(await storage.getStream(keys.chunk(recordingId, i)), file, { end: false });
  }
  file.end();
  await new Promise((r) => file.on("finish", r));

  await ffmpeg(["-i", raw, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", out]);
  await storage.put(keys.audio(recordingId), await readFile(out), "audio/ogg");
  return { localPath: out, dir };
}
```

- [x] **Verify:** test with 3 real chunks recorded in Chrome → `audio.ogg` plays fully in VLC, no gaps.
- [x] **Commit:** `feat(api): join and normalize audio with ffmpeg`

> ⚠️ Safari records `audio/mp4` instead of webm. Test concatenation there early; if fragments don't join cleanly, upload the whole recording as one chunk on stop for Safari only.

### Task 1.5 — Speech-to-text interface + one adapter for free (Groq) and paid (OpenAI)
- [x] **Files:** `ai/stt/speech-to-text.ts`, `ai/stt/openai-compatible-stt.ts`, `ai/stt/fake-stt.ts`
- [x] Create a free Groq account at console.groq.com and an API key → `GROQ_API_KEY` in `.env`.
- [x] **Steps:** `pnpm --filter @vn/api add openai` (used for both Groq and OpenAI), and add the script `"tsx": "DOTENV_PATH=../../.env tsx"` to `apps/api/package.json`. Then `pnpm --filter @vn/api tsx scripts/<file>.ts` loads the root `.env`, just as the `knex` script does. Without it, `try-stt.ts` / `try-notes.ts` start without `GROQ_API_KEY` and fail.

```ts
// apps/api/src/ai/stt/speech-to-text.ts
import type { LanguageCode, Segment } from "@vn/shared";

export interface TranscribeOptions {
  language: LanguageCode;            // "en" only for now (Task 1.0)
  diarize: boolean;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(localPath: string, opts: TranscribeOptions): Promise<{ segments: Segment[]; language?: string }>;
}
```

```ts
// apps/api/src/ai/stt/openai-compatible-stt.ts
// Groq's API is OpenAI-compatible, so ONE class serves the free and the paid provider.
import fs from "node:fs";
import type OpenAI from "openai";
import type { SpeechToText, TranscribeOptions } from "./speech-to-text.js";

export class OpenAiCompatibleStt implements SpeechToText {
  constructor(
    readonly name: string,
    private client: OpenAI,
    private model: string,   // "whisper-large-v3-turbo" (Groq, free) | "whisper-1" (OpenAI, paid)
  ) {}

  async transcribe(localPath: string, opts: TranscribeOptions) {
    const res = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(localPath),
      model: this.model,
      response_format: "verbose_json",         // segment timestamps, needed for click-to-seek
      timestamp_granularities: ["segment"],
      language: opts.language,                 // forcing the language beats auto-detect on accuracy
    });
    const segments = (res.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speaker: null,                         // no diarization yet
      text: s.text.trim(),
    }));
    return { segments, language: res.language };
  }
}
```

```ts
// apps/api/src/ai/stt/fake-stt.ts — used in tests, no network
export class FakeStt implements SpeechToText {
  readonly name = "fake";
  async transcribe() {
    return { segments: [
      { startMs: 0, endMs: 4000, speaker: null, text: "Today we are going over the lesson plan." },
      { startMs: 4000, endMs: 9000, speaker: null, text: "Olena will prepare the quiz by Friday." },
    ] };
  }
}
```

- [x] **Verify:** with `STT_PROVIDER=groq`, a script `pnpm --filter @vn/api tsx scripts/try-stt.ts sample.ogg` prints English segments with timestamps ($0).
- [x] **Commit:** `feat(api): openai-compatible speech-to-text adapter (groq free / openai paid)`

> Why `whisper-1` for the paid stage and not the cheaper gpt-4o transcribe models: those return only text/JSON without segment timestamps, and the app needs timestamps. File size limit: both Groq (free tier) and OpenAI accept files up to 25 MB. At 24 kbps Opus that is ~2 hours. For longer recordings, split with ffmpeg (`-f segment -segment_time 1800`) and offset the timestamps.

### Task 1.6 — Transcribe job
- [x] **Files:** `apps/api/src/jobs/transcribe.job.ts`, `apps/api/src/ai/providers.ts`

```ts
// apps/api/src/ai/providers.ts — the ONLY place that picks adapters
import OpenAI from "openai";
import { config, GROQ_BASE_URL } from "../config.js";
import { OpenAiCompatibleStt } from "./stt/openai-compatible-stt.js";
import type { SpeechToText } from "./stt/speech-to-text.js";
import { GroqNotes } from "./notes/groq-notes.js";
import { ClaudeNotes } from "./notes/claude-notes.js";
import type { NotesGenerator } from "./notes/notes-generator.js";

// Only the worker imports this file: fail fast there if a selected provider has no API key.
const keyFor = { groq: "GROQ_API_KEY", openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY" } as const;
for (const provider of new Set([config.STT_PROVIDER, config.NOTES_PROVIDER])) {
  if (!config[keyFor[provider]]) throw new Error(`${keyFor[provider]} is required because a provider is set to "${provider}"`);
}

export const stt: SpeechToText =
  config.STT_PROVIDER === "openai"
    ? new OpenAiCompatibleStt("openai-whisper-1", new OpenAI({ apiKey: config.OPENAI_API_KEY }), "whisper-1")
    : new OpenAiCompatibleStt("groq-whisper-large-v3-turbo",
        new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: GROQ_BASE_URL }), "whisper-large-v3-turbo");

export const notesGenerator: NotesGenerator =
  config.NOTES_PROVIDER === "claude" ? new ClaudeNotes() : new GroqNotes();

// Phase 6: add WhisperCppStt / OllamaNotes here
```

```ts
// apps/api/src/jobs/transcribe.job.ts
import { rm } from "node:fs/promises";
import { prepareAudio } from "../audio/prepare-audio.js";
import { stt } from "../ai/providers.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import { queues } from "../queue/queues.js";
import { keys } from "../storage/storage.service.js";

export async function transcribeJob(recordingId: string) {
  const rec = await repo.getById(recordingId);
  await repo.update(recordingId, { status: "transcribing", error: null });

  const { localPath, dir } = await prepareAudio(recordingId, rec.chunk_count);
  try {
    const { segments } = await stt.transcribe(localPath, { language: rec.language, diarize: false });
    await repo.replaceSegments(recordingId, segments);       // delete + insert in one transaction
    await repo.update(recordingId, { audio_key: keys.audio(recordingId) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await queues.notes.add("notes", { recordingId }, { jobId: `notes-${recordingId}` });
}
```

- [x] **Tests never import the real `ai/providers.ts`:** it throws without AI keys, and CI has none. Mock it in every job test (an async factory, because `vi.mock` is hoisted above the imports):

```ts
vi.mock("../ai/providers.js", async () => ({
  stt: new (await import("../ai/stt/fake-stt.js")).FakeStt(),
  notesGenerator: new (await import("../ai/notes/fake-notes.js")).FakeNotes(),
}));
```

- [x] **Verify:** integration test with `FakeStt` (mocked as above) → after the job, 2 segments in DB and a `notes` job queued. `replaceSegments` makes the job safe to retry. Starting the worker without `GROQ_API_KEY` fails with a clear message; the API server still starts.
- [x] **Commit:** `feat(api): transcribe job`

### Task 1.7 — Notes prompts per mode
- [x] **Files:** `apps/api/src/ai/notes/prompts.ts`

```ts
// apps/api/src/ai/notes/prompts.ts
import type { RecordingMode } from "@vn/shared";

const base = `
You turn transcripts into clear, faithful notes.
Rules:
- Write all notes in English.
- Only state what was actually said. If something is unclear, put it in openQuestions.
- actionItems: concrete tasks that someone said they or another person will do. Keep owner/dueDate null if not said.
- proposals: your own useful suggestions or next steps based on the content (max 5). Make them specific.
- Leave arrays empty when nothing fits. Never invent names, dates or numbers.`;

const modeRules: Record<RecordingMode, string> = {
  meeting: "This is a meeting or call. Focus on decisions, owners, deadlines and blockers.",
  lesson:  "This is a lesson or lecture. Fill concepts (term + short explanation) and 3–7 reviewQuestions to check understanding.",
  memo:    "This is a personal voice memo. Fill ideas and turn intentions into actionItems with owner = null.",
};

export const systemPrompt = (mode: RecordingMode) => `${base}\n\n${modeRules[mode]}`;
// Phase 2 (Ukrainian): add a notesLanguage parameter back here and in NotesGenerator.generate
```

- [x] **Commit:** `feat(api): notes prompts per recording mode`

### Task 1.8 — NotesGenerator: shared chunking + free (Groq) and paid (Claude) adapters
- [x] **Files:** `ai/notes/notes-generator.ts`, `ai/notes/chunked-notes.ts`, `ai/notes/groq-notes.ts`, `ai/notes/claude-notes.ts`, `ai/notes/fake-notes.ts`, `queue/queues.ts` (notes retry settings, see the rate-limit note below)
- [x] **Steps:** `pnpm --filter @vn/api add @anthropic-ai/sdk` (the `openai` package from Task 1.5 is reused for Groq)
- [x] Build `chunked-notes.ts` + `groq-notes.ts` **now**; `claude-notes.ts` can be written now but is only switched on in Phase 1b.

```ts
// apps/api/src/ai/notes/notes-generator.ts
import type { Notes, RecordingMode, Segment } from "@vn/shared";

export interface NotesGenerator {
  readonly name: string;
  generate(segments: Segment[], mode: RecordingMode): Promise<Notes>;
}

/** "[12:05] Speaker 1: text" — timestamps help the model and let us link back later */
export function formatTranscript(segments: Segment[]) {
  return segments.map((s) => {
    const t = new Date(s.startMs).toISOString().slice(11, 19);
    return `[${t}]${s.speaker ? ` ${s.speaker}:` : ""} ${s.text}`;
  }).join("\n");
}
```

```ts
// apps/api/src/ai/notes/chunked-notes.ts — map → reduce shared by all adapters
import type { Notes, RecordingMode, Segment } from "@vn/shared";
import { formatTranscript, type NotesGenerator } from "./notes-generator.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MERGE_PROMPT = "Merge these partial notes from consecutive parts of ONE recording. Remove duplicates.\n\n";

export abstract class ChunkedNotesGenerator implements NotesGenerator {
  abstract readonly name: string;
  protected abstract readonly maxCharsPerCall: number;
  protected abstract readonly pauseBetweenCallsMs: number;   // respects per-minute rate limits
  protected abstract callModel(mode: RecordingMode, content: string): Promise<Notes>;

  async generate(segments: Segment[], mode: RecordingMode): Promise<Notes> {
    // one call at a time, with a pause between calls, so we never burst over rate limits
    let calls = 0;
    const call = async (content: string) => {
      if (calls++ > 0) await sleep(this.pauseBetweenCallsMs);
      return this.callModel(mode, content);
    };

    const text = formatTranscript(segments);
    if (text.length <= this.maxCharsPerCall) return call(text);

    // MAP: notes for each part
    let notes: Notes[] = [];
    for (const part of splitByChars(text, this.maxCharsPerCall)) notes.push(await call(part));

    // REDUCE: merge in batches that fit one call, repeating until one result is left.
    // (Merging everything at once could exceed the per-call / per-minute limit on long recordings.)
    while (notes.length > 1) {
      const merged: Notes[] = [];
      for (const batch of batchForMerge(notes, this.maxCharsPerCall)) {
        merged.push(batch.length === 1 ? batch[0]! : await call(MERGE_PROMPT + JSON.stringify(batch)));
      }
      notes = merged;
    }
    return notes[0]!;
  }
}

/**
 * Groups partial notes so each merge call stays within `max` chars. Every batch except the
 * last has at least 2 items, so each round shrinks the list and the loop always ends
 * (a pair of very large notes may go over `max`; progress matters more).
 */
export function batchForMerge(items: Notes[], max: number) {
  const batches: Notes[][] = [];
  let cur: Notes[] = [];
  let size = 0;
  for (const item of items) {
    const len = JSON.stringify(item).length;
    if (cur.length >= 2 && size + len > max) { batches.push(cur); cur = []; size = 0; }
    cur.push(item);
    size += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function splitByChars(text: string, max: number) {
  const parts: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length > max && cur) { parts.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur) parts.push(cur);
  return parts;
}
```

```ts
// apps/api/src/ai/notes/groq-notes.ts — FREE stage
import OpenAI from "openai";
import { z } from "zod";
import { Notes, type RecordingMode } from "@vn/shared";
import { config, GROQ_BASE_URL } from "../../config.js";
import { ChunkedNotesGenerator } from "./chunked-notes.js";
import { systemPrompt } from "./prompts.js";

const schemaText = JSON.stringify(z.toJSONSchema(Notes));

export class GroqNotes extends ChunkedNotesGenerator {
  readonly name = "groq";
  protected readonly maxCharsPerCall = config.GROQ_NOTES_MAX_CHARS;  // ≈ 4k tokens per call
  protected readonly pauseBetweenCallsMs = 60_000;                   // free tier: low tokens/minute
  private client = new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: GROQ_BASE_URL });

  protected async callModel(mode: RecordingMode, content: string): Promise<Notes> {
    const res = await this.client.chat.completions.create({
      model: config.GROQ_NOTES_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt(mode)}\n\nReply with ONLY a JSON object that matches this JSON Schema:\n${schemaText}` },
        { role: "user", content },
      ],
    });
    const choice = res.choices[0];
    // a cut-off answer is invalid JSON: fail clearly instead of a confusing parse error
    if (choice?.finish_reason === "length") throw new Error("Notes were cut off (length)");
    return Notes.parse(JSON.parse(choice?.message.content ?? ""));   // invalid → throws → BullMQ retries
  }
}
```

```ts
// apps/api/src/ai/notes/claude-notes.ts — PAID stage (Phase 1b)
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Notes, type RecordingMode } from "@vn/shared";
import { config } from "../../config.js";
import { ChunkedNotesGenerator } from "./chunked-notes.js";
import { systemPrompt } from "./prompts.js";

export class ClaudeNotes extends ChunkedNotesGenerator {
  readonly name = "claude";
  protected readonly maxCharsPerCall = 60_000;   // big context, no need for small chunks
  protected readonly pauseBetweenCallsMs = 0;
  private client = new Anthropic();              // reads ANTHROPIC_API_KEY

  protected async callModel(mode: RecordingMode, content: string): Promise<Notes> {
    const res = await this.client.messages.create({
      model: config.NOTES_MODEL,
      max_tokens: 8192,                     // notes for a long lecture can exceed 4096 tokens
      system: systemPrompt(mode),
      tools: [{
        name: "save_notes",
        description: "Save the structured notes for this recording.",
        input_schema: z.toJSONSchema(Notes) as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: "save_notes" },   // force structured output
      messages: [{ role: "user", content }],
    });
    // a cut-off tool call is invalid JSON: fail clearly instead of a confusing Zod error
    if (res.stop_reason === "max_tokens") throw new Error("Notes were cut off (max_tokens)");
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new Error("Model returned no notes");
    return Notes.parse(block.input);                      // runtime check, retried by BullMQ if invalid
  }
}
```

> **Rate limits (free stage):** if Groq returns HTTP 429, the job fails and BullMQ retries it. Change the `notes` queue in `queue/queues.ts` (Task 1.3) so retries wait a full minute:
>
> ```ts
> notes: new Queue<{ recordingId: string }>("notes", {
>   connection,
>   defaultJobOptions: { ...defaults, attempts: 5, backoff: { type: "fixed", delay: 60_000 } },
> }),
> ```
>
> A retry runs the whole job again, including map calls that already succeeded. That's fine at $0, but it uses up daily quota. Check your real limits at console.groq.com (Settings → Limits) and tune `GROQ_NOTES_MAX_CHARS`.

- [x] **As built:** the long-transcript test failed with the code above: on the free tier (8k tokens/minute) `gpt-oss-120b`'s hidden reasoning counts as output, so the merge call ran out of tokens (`json_validate_failed` / `finish_reason: length`). `GroqNotes` now sends `reasoning_effort: "low"` (reasoning went from 400–1,500 to under 150 tokens per call) and `response_format: { type: "json_schema", json_schema: { name: "notes", strict: true, schema } }` instead of `json_object` + the schema in the prompt; `Notes.parse` stays as a runtime check. `MERGE_PROMPT` also asks for one title/summary for the whole recording and repeats the rules (max 5 proposals), because the first merge returned "Merged …" as the title and 15 proposals. `providers.ts` now exports `notesGenerator`, and `FakeNotes` returns a fixed `Notes` object. `try-notes.ts` takes a `.txt` transcript (one segment per line) or an audio file.
- [x] **Verify:** unit tests: `splitByChars` (never cuts a line, no empty parts); `batchForMerge` (batches stay under `max` when possible, every batch but the last has ≥ 2 items); `generate` with a fake `callModel` on a long transcript ends with exactly one result. Manual script `try-notes.ts` with `NOTES_PROVIDER=groq` on a real English transcript (short and > 20 minutes) → valid `Notes` JSON ($0).
- [x] **Commit:** `feat(api): notes generators with shared chunking (groq free, claude paid)`

> Check the current model names and SDK details in the official docs (https://docs.claude.com/en/api/overview) when you switch to Claude; the model is configurable via `NOTES_MODEL`.

### Task 1.9 — Notes job
- [x] **Files:** `apps/api/src/jobs/notes.job.ts`

```ts
// apps/api/src/jobs/notes.job.ts
import { notesGenerator } from "../ai/providers.js";
import { repo } from "../modules/recordings/recordings.repository.js";

export async function notesJob(recordingId: string) {
  const rec = await repo.getById(recordingId);
  await repo.update(recordingId, { status: "summarizing" });

  const segments = await repo.getSegments(recordingId);
  if (segments.length === 0) {
    return repo.update(recordingId, { status: "failed", error: "No speech detected" });
  }

  const notes = await notesGenerator.generate(segments, rec.mode);

  await repo.transaction(async (trx) => {
    await trx.insertNotes(recordingId, notes);                       // version = last + 1
    await trx.replaceActionItems(recordingId, rec.user_id, notes.actionItems);
    await trx.update(recordingId, {
      status: "ready",
      title: rec.title === "Untitled recording" ? notes.title : rec.title,
    });
  });
}
```

- [x] **Verify:** full pipeline test with `FakeStt` + `FakeNotes` (providers mocked as in Task 1.6): create → chunks → finish → run both jobs → status `ready`, notes row exists, action items saved.
- [x] **Commit:** `feat(api): notes job saves notes and action items`

### Task 1.10 — Browser recorder hook + chunk uploader
- [x] **Files:** `apps/web/src/recorder/use-recorder.ts`, `apps/web/src/recorder/chunk-uploader.ts`

```ts
// apps/web/src/recorder/chunk-uploader.ts
import { api } from "../lib/api";

/** Uploads chunks one by one, in order, with retries. */
export class ChunkUploader {
  private chain: Promise<void> = Promise.resolve();
  private failed = false;
  count = 0;

  constructor(private recordingId: string, private mimeType: string) {}

  enqueue(blob: Blob, index: number) {
    this.count = Math.max(this.count, index + 1);
    this.chain = this.chain.then(() => this.upload(blob, index));
  }

  private async upload(blob: Blob, index: number, attempt = 1): Promise<void> {
    try {
      await api(`/recordings/${this.recordingId}/chunks/${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
    } catch {
      // give up on this chunk but keep the chain alive for the next ones; flush() reports it
      if (attempt >= 5) { this.failed = true; return; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return this.upload(blob, index, attempt + 1);
    }
  }

  async flush() {
    await this.chain;
    if (this.failed) throw new Error("Some audio failed to upload");
  }
}
```

```ts
// apps/web/src/recorder/use-recorder.ts
import { useRef, useState } from "react";

const CHUNK_MS = 10_000;

export function pickMimeType() {
  for (const t of ["audio/webm;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function useRecorder(onChunk: (blob: Blob, index: number) => void) {
  const recRef = useRef<MediaRecorder | null>(null);
  const indexRef = useRef(0);
  const startedAt = useRef(0);
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const rec = new MediaRecorder(stream, { mimeType: pickMimeType(), audioBitsPerSecond: 32_000 });
    indexRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size > 0) onChunk(e.data, indexRef.current++); };
    rec.start(CHUNK_MS);                       // emits a chunk every 10 s
    startedAt.current = Date.now();
    recRef.current = rec;
    setState("recording");
  }

  function pause()  { recRef.current?.pause();  setState("paused"); }
  function resume() { recRef.current?.resume(); setState("recording"); }

  /** Resolves after the last chunk has been emitted. Returns approximate duration. */
  function stop(): Promise<number> {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) return resolve(0);
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        resolve(Date.now() - startedAt.current);
      };
      rec.stop();
    });
  }

  return { state, start, pause, resume, stop };
}
```

- [x] **As built:** `ChunkUploader` takes only `recordingId` (the `mimeType` parameter was never used, and Task 1.11 calls `new ChunkUploader(id)`), and declares its field explicitly because the web tsconfig has `erasableSyntaxOnly` (no `constructor(private …)`). `server.ts` registers CORS with `methods: ["GET", "HEAD", "POST", "PUT", "DELETE"]`: `@fastify/cors` 11 allows only GET/HEAD/POST by default, so in dev (web :5173 → API :3000) the browser blocked every chunk `PUT` at the preflight. Production is same-origin behind Caddy.
- [x] **Verify:** record 35 s → 4 chunks uploaded (check the RustFS console). Turn Wi-Fi off for 15 s mid-recording → chunks still arrive after reconnect.
- [x] **Commit:** `feat(web): media recorder hook with ordered chunk uploads`

> Duration from `Date.now()` includes paused time — subtract pauses if you add a visible timer. Stretch goal: keep un-uploaded chunks in IndexedDB so a closed tab doesn't lose audio.

### Task 1.11 — Record page
- [x] **Files:** `apps/web/src/pages/RecordPage.tsx`, `components/SegmentedControl.tsx`, `components/RecordButton.tsx`, `components/InfoNote.tsx`, `apps/api/src/server.ts`
- [x] **Design:** before recording = `docs/design/screens/NewRecording.dc.html`; while recording = `docs/design/screens/PhoneRecording.dc.html` (same layout, centered in the content column on desktop).
- [x] **Steps:** segmented control Meeting / Lesson / Voice memo with the one-line hint of what the notes focus on, optional title, microphone select with input-level bar, no language selector (English only), Free plan info note (Task 1b.5 text, shown only when `freeMode` is true, see below), big red record button + consent reminder ("Tell everyone they are being recorded"). While recording: "Recording" badge, big timer, waveform, "Saved up to mm:ss", Pause and Stop and save buttons.
- [x] **Free mode flag:** the web app can't read the server's `.env`, so the API exposes it: `GET /api/app-config` (with `requireUser`) → `{ freeMode: config.STT_PROVIDER === "groq" || config.NOTES_PROVIDER === "groq" }`. The Record page loads it with `useQuery`.
- [x] Flow on **Record**: `POST /recordings` → create `ChunkUploader(id)` → `start()`.
- [x] Flow on **Stop**: `stop()` → `uploader.flush()` → `POST /recordings/:id/finish { chunkCount, durationMs }` → navigate to the detail page.
- [x] **As built:** the Free plan note uses the mockup's text ("Free plan: recordings are processed by a free service with no privacy guarantee. Record only your own voice for testing."). The recorder files from Task 1.10 grew what this page needs: `start(deviceId)`, the live `stream`, a pause-aware `elapsed()` (also used for `durationMs`), and `ChunkUploader(id, onUploaded)` with an `uploaded` count ("Saved up to") and `retryFailed()` for **Try again**. `recorder/use-audio-level.ts` feeds the input meter and the waveform. Because the detail page is Task 1.13, `/recordings/:id` is a placeholder (`RecordingDetailPage.tsx`: title + live status) that 1.13 replaces. On a phone the stacked sidebar pushes Pause / Stop below the fold; the phone mockup has no sidebar.
- [x] **Verify:** record → stop → redirected to detail page showing status `uploaded` → `transcribing`.
- [x] **Commit:** `feat(web): record page`

### Task 1.12 — Recordings list with live status
- [x] **Files:** `apps/web/src/pages/RecordingsPage.tsx`
- [x] **Design:** `docs/design/screens/Recordings.dc.html`.

```ts
const { data } = useQuery({
  queryKey: ["recordings"],
  queryFn: () => api<Recording[]>("/recordings"),
  // poll only while something is still processing
  refetchInterval: (q) =>
    q.state.data?.some((r) => !["ready", "failed"].includes(r.status)) ? 3000 : false,
});
```

- [x] Rows: icon tile per mode, title, "Mode, duration", status (ready / processing with progress bar / failed with **Try again**), date; grouped by "This week" / "Last week" / month. Filter pills by mode work now (client-side). The search field and minutes meter come later (Phase 2, Task 1b.4).
- [x] Empty state: "No recordings yet" + **New recording** button.
- [x] **As built:** `FilterPills`, `ProgressBar` and `StatusLabel` are components (DESIGN.md section 5), so the detail page can reuse them. Polling runs only while a recording is `uploaded` / `transcribing` / `summarizing`: a never-finished `recording` row (closed tab) would otherwise poll forever; it shows "Not finished". Ready rows say "Notes ready" (the mockup's "3 action items" needs a count from the API, Phase 2). Failed rows show plain words ("No speech found in the audio", otherwise "Processing failed") instead of the stored error. **Try again** calls `POST /retry`; until Task 1.15 removes the old BullMQ job, the re-queued job may be ignored.
- [x] **Commit:** `feat(web): recordings list with status polling`

### Task 1.13 — Recording detail page
- [x] **Files:** `RecordingDetailPage.tsx`, `components/AudioPlayer.tsx`, `components/Tabs.tsx`, `components/Transcript.tsx`, `components/NotesEditor.tsx`, `components/TimestampLink.tsx`
- [x] **Design:** `docs/design/screens/RecordingDetail.dc.html`: title + meta chips, action buttons, capsule audio player, then **Notes / Transcript tabs**. Notes order: summary, action items, decisions, suggested next steps (= `proposals`, grey box with the assistant label), open questions, AI disclaimer line. Lesson / memo extra sections and key points use the Decisions style.
- [x] **Steps:**
  - [x] `AudioPlayer`: gets a signed URL from `GET /recordings/:id/audio`, exposes `seek(ms)` via a ref.
  - [x] `Transcript`: list of segments with timestamps; click a line → `player.seek(startMs)`; highlight the line that is playing (`timeupdate` event).
  - [x] `NotesEditor`: sections Summary, Key points, Decisions, Action items (checkboxes), Proposals, Open questions (+ Concepts / Review questions for lessons, Ideas for memos). Inline editing, **Save** → `PUT /recordings/:id/notes`. The API also replaces `action_items` from the saved notes, the same way the notes job does, so edits show up in the Phase 2 action-items page.
  - [x] Processing state: show a progress step (Uploaded → Transcribing → Writing notes → Ready).
- [x] **As built:** action-item checkboxes are saved: `@vn/shared` has `SavedNotes` (= `Notes` with `done` per action item, default false), used only for notes a person saves, so the AI's strict `Notes` schema is unchanged. Ticking a box saves a new notes version at once; `PUT /notes` saves the version and replaces `action_items` (with `done`) in one transaction. **Edit notes** sits in the action-button row (Copy / Download come in Task 1.14, More actions in 1.15); editing uses one-per-line text areas, and rows for action items and concepts. `TimestampLink` is used in the transcript only: `decisions` / `openQuestions` are plain strings without times, so linking them back (as in the mockup) needs a schema + prompt change later. Not built: transcript search field (mockup), speaker count in the header (no diarization yet). `failureText` moved to `lib/status.ts` (shared with `StatusLabel`).
- [x] **Verify:** clicking a transcript line jumps the audio to that moment; edits survive a page reload.
- [x] **Commit:** `feat(web): recording detail with player, transcript and notes editor`

### Task 1.14 — Markdown export
- [x] **Files:** `packages/shared/src/notes-to-markdown.ts` (shared so desktop/mobile reuse it)

```ts
export function notesToMarkdown(title: string, n: Notes, date: string) {
  const list = (h: string, items: string[]) => (items.length ? `## ${h}\n${items.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    `# ${title}\n_${date}_\n`,
    `## Summary\n${n.summary}\n`,
    list("Key points", n.keyPoints),
    list("Decisions", n.decisions),
    n.actionItems.length
      ? `## Action items\n${n.actionItems.map((a) => `- [x] ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.dueDate ? ` (${a.dueDate})` : ""}`).join("\n")}\n`
      : "",
    list("Proposals", n.proposals),
    list("Open questions", n.openQuestions),
    n.concepts.length
      ? `## Concepts\n${n.concepts.map((c) => `- **${c.term}**: ${c.explanation}`).join("\n")}\n`
      : "",
    list("Ideas", n.ideas),
    list("Review questions", n.reviewQuestions),
  ].filter(Boolean).join("\n");
}
```

- [x] Buttons: **Copy as Markdown** and **Download .md**.
- [x] **As built:** three small changes to the code above: a ticked action item prints as `- [x]` (notes saved from the editor carry `done`, Task 1.13); an empty summary is left out like any other empty section; and proposals print as "Suggested next steps" with the line "_Ideas from the assistant. Nobody said these in the meeting._", because exported notes get shared and DESIGN.md keeps AI suggestions labelled. The buttons sit before **Edit notes**; Download names the file after the title (`science-fair-planning.md`).
- [x] **Verify:** unit test with a sample `Notes` object; empty sections are not printed. (This is the shared package's first test: add `"test": "vitest run"` to `packages/shared/package.json`.)
- [x] **Commit:** `feat: markdown export of notes`

### Task 1.15 — Delete, retry, limits
- [x] `DELETE /recordings/:id` removes DB rows (cascade) **and** `storage.deletePrefix(keys.prefix(id))`.
- [x] `POST /recordings/:id/retry`: if no segments → enqueue `transcribe`, else enqueue `notes`. **Remove the old job first** (`await (await queue.getJob(jobId))?.remove()`), because BullMQ keeps failed jobs and ignores `add()` with an existing id, so the retry would silently do nothing.
- [x] Monthly minutes limit: sum `duration_ms` this month per user; reject `finish` with 402 + friendly message when over `MONTHLY_MINUTES_LIMIT`.
- [x] **As built:** delete already worked this way since Task 1.2 (audio first, then the rows); the new test also checks chunks, `audio.ogg` and segments are gone. `JobQueue` gained `getJob` for the remove-first retry. The limit counts every recording created this calendar month (database time zone) with a duration, failed ones too (their audio was still sent to speech-to-text), and the 402 message says how many minutes are used. The Record page now shows the API's message when finishing fails (network errors keep "check your connection"). Testing note: BullMQ's `add()` returns a new local Job object even when Redis ignored it — check with `getJob`.
- [x] **Verify:** after delete, storage has no objects under the prefix; retry fixes a recording that failed because the API key was missing.
- [x] **Commit:** `feat(api): delete, retry and monthly usage limit`

### Task 1.16 — Deploy for free (Oracle Cloud + Docker Compose + Caddy + DuckDNS)
**Goal:** the app runs online over HTTPS for $0. HTTPS is not optional: browsers only allow the microphone on secure (HTTPS) pages.

- [x] **Files:** `docker-compose.prod.yml`, `Caddyfile`, `apps/api/Dockerfile`, `scripts/deploy.sh`

**1. Create the free server**
- [ ] Sign up at cloud.oracle.com (Always Free). Choose a home region carefully — it can't be changed later.
- [ ] Compute → Instances → Create: image **Ubuntu 24.04 (aarch64)**, shape **VM.Standard.A1.Flex**, **2 OCPU / 12 GB** (Always Free limit), add your SSH key. If you get "out of capacity", try another availability domain or retry later.
- [ ] In the VCN security list, add ingress rules for TCP **80** and **443**.
- [ ] Oracle's Ubuntu image also blocks ports with iptables — open them on the VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

**2. Free domains**
- [ ] At duckdns.org create a subdomain `<name>.duckdns.org` pointing to the VM's public IP.

**3. Server software**
- [ ] Install Docker Engine + Compose plugin and Node 22 + pnpm on the VM; `git clone` your repo.
- [x] All Docker images used here (Postgres/pgvector, Redis, Caddy, Node) must support **arm64** — check each image's tags if a container fails to start.

**4. Same-origin API under `/api`**
- [x] Already done in Task 0.9: all routes are under `/api`, and the auth client uses the page's own origin in production. Web and API share one domain (no CORS, simple cookies). Build the web app with `VITE_API_URL=/api`.

**5. Audio storage on Cloudflare R2**
- [ ] In the Cloudflare dashboard enable **R2** (it may ask for a payment method as verification; you stay free up to 10 GB). Create a bucket `voice-notes-audio` and an **R2 API token** with *Object Read & Write* for that bucket only. Note your Account ID.
- [ ] Production storage settings: `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=voice-notes-audio`, `S3_ACCESS_KEY` / `S3_SECRET_KEY` from the token.
- [ ] Nothing else changes in the code: signed URLs for the audio player work directly on R2's S3 endpoint (note: R2 signed URLs work only on the `r2.cloudflarestorage.com` endpoint, not on a custom domain).
- [ ] Optional: a second bucket `voice-notes-backups` for the database backups below.

**6. Production files**

- [x] `apps/api` already has a `build` script (`tsc -p tsconfig.json`). Because `rootDir` is `.` (Task 0.5), the output is `dist/src/server.js` and `dist/src/worker.js`, **not** `dist/server.js`. The image keeps dev dependencies (the `knex` and `auth:migrate` scripts use tsx). The `.env` file is not copied into the image: Compose passes the variables, so the missing `DOTENV_PATH` file is harmless.

```dockerfile
# apps/api/Dockerfile — one image for both API and worker
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo build --filter=@vn/api...
CMD ["node", "apps/api/dist/src/server.js"]   # rootDir "." → dist/src/
```

```yaml
# docker-compose.prod.yml — only Caddy is reachable from the internet
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: voice_notes
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]
    restart: unless-stopped

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped

  worker:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: ["node", "apps/api/dist/src/worker.js"]
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./apps/web/dist:/srv/web:ro
      - caddydata:/data
    restart: unless-stopped

volumes: { pgdata: {}, redisdata: {}, caddydata: {} }
# audio files live in Cloudflare R2, not on this server
```

```
# Caddyfile — automatic HTTPS certificates
{$DOMAIN} {
  encode gzip
  handle /api/* {
    reverse_proxy api:3000
  }
  handle {
    root * /srv/web
    try_files {path} /index.html
    file_server
  }
}
```

- [ ] Production `.env` on the server: strong `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`; `DATABASE_URL=postgres://app:<pw>@postgres:5432/voice_notes`, `REDIS_URL=redis://redis:6379`, the R2 settings from step 5, `WEB_ORIGIN=https://<name>.duckdns.org`, `BETTER_AUTH_URL=https://<name>.duckdns.org`, `DOMAIN=<name>.duckdns.org`, `STT_PROVIDER=groq`, `NOTES_PROVIDER=groq`, `GROQ_API_KEY=...`. Never commit this file.

**7. Deploy script**

```bash
# scripts/deploy.sh — run on the server
set -e
git pull
pnpm install --frozen-lockfile
VITE_API_URL=/api pnpm --filter web build
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api pnpm --filter @vn/api knex migrate:latest
docker compose -f docker-compose.prod.yml exec api pnpm --filter @vn/api auth:migrate
```

- [x] **As built (rehearsed locally with the production compose on `https://localhost`, arm64):** fixes to the files above —
  - `.dockerignore` (new): without it `COPY . .` copied the Mac's `node_modules` and the real `.env` with API keys into the image.
  - Dockerfile: the comment after `CMD [...]` made Docker read it as shell form, so the API crash-looped (`[node,: not found`); the comment is on its own line now.
  - `deploy.sh`: `VITE_API_URL=/api pnpm turbo build --filter=web` (plain `pnpm --filter web build` fails on a fresh clone: `@vn/shared` is not built yet). Migrations run **before** the new API starts (`build` → `up -d --wait postgres redis` → `run --rm api … migrate` → `up -d`): Better Auth checks the schema once at startup and kept answering "Database schema mismatch" after the tables were created. The prod Postgres got the same healthcheck as dev for `--wait`.
  - `scripts/backup.sh` (new) dumps, gzips and copies to `BACKUP_BUCKET` with the aws-cli image; rehearsal: upload + restore into a fresh database worked. `.env.production.example` (new) lists every production variable.
  - Found on the way: `prepareAudio` used `pipeline(..., { end: false })` per chunk, which piled listeners on the file (`MaxListenersExceededWarning` from 10 chunks); it now writes chunks with `drain` back-pressure, with a 15-chunk regression test.
  - Rehearsal results: HTTPS + `/api` routing + SPA fallback + gzip through Caddy; secure session cookie; a 1-minute recording on a phone-sized viewport uploaded 7 chunks; real speech → notes in ~6 s; the player streamed the signed storage URL.
- [ ] **Backups ($0):** a daily cron job runs `pg_dump` and copies the file off the server (for example to the `voice-notes-backups` R2 bucket). A backup on the same VM is not a backup.
- [ ] **Verify:** open `https://<name>.duckdns.org` on your phone → sign up → record 1 minute → notes appear; the audio player works.
- [x] **Commit:** `chore: free production deployment with docker compose and caddy`

> Tasks 1.17–1.19 were added after 1.16 was prepared, and are built **before** the app goes online, so the first deploy already has them. Mockups: the second row of the design canvas (`Landing`, `SignIn`, `SignUp`, `DeleteRecording`). They use only the DESIGN.md tokens.

### Task 1.17 — Delete a recording from the detail page
- [x] **Files:** `apps/web/src/pages/RecordingDetailPage.tsx` (+ its CSS module), `docs/DESIGN.md`
- [x] A secondary **Delete** button (trash icon) at the end of the actions row, shown for **every** status (ready, processing and failed), not only when notes are ready.
- [x] Clicking it opens an inline confirmation below the row (grey surface, radius lg, `aria-expanded`/`aria-controls` on the button): "Delete “{title}”?", "The audio, transcript and notes are removed for good. This can’t be undone.", primary **Delete recording** + secondary **Keep it**. Focus moves into the panel; Escape and **Keep it** close it and return focus to **Delete**.
- [x] Confirm → `DELETE /api/recordings/:id` (Task 1.15) → remove the recording from the TanStack Query cache, invalidate the list, `navigate("/", { replace: true })`. While pending the button says "Deleting…" and is disabled; on error show the API message in error text and keep the panel open.
- [x] Red stays reserved (DESIGN.md §1): the destructive button is the normal black primary button; the warning is in the copy.
- [x] DESIGN.md: add "Recording detail: delete" to the screens table (§6).
- [x] **Verify:** delete a ready, a processing and a failed recording → each lands on the list without it; reloading `/recordings/:id` shows "This recording does not exist or was deleted."; storage has no objects under its prefix. Keyboard only: Tab to Delete, Enter, Tab to Keep it, Escape returns focus.
- [x] **As built:** `Button` now takes `ComponentProps<"button">` instead of `ButtonHTMLAttributes`, so it accepts `ref` (React 19 passes it as a normal prop); that is how focus returns to Delete. The panel is a focusable `<section tabIndex={-1}>` labelled by its question, so the first Tab lands on "Delete recording". On success the page cancels its 2-second polling **before** navigating (otherwise a refetch of the deleted id flashes "not found"), drops the row from the cached list at once, then removes the detail and audio-URL queries. Verified in headless Chrome: 23 checks (keyboard path, `aria-expanded`, copy, black primary, list and reload) plus storage and database empty for all three recordings.
- [x] **Commit:** `feat(web): delete a recording from the detail page`

### Task 1.18 — Landing page
- [x] **Files:** `apps/web/src/pages/LandingPage.tsx` (+ CSS module), `apps/web/src/router.tsx`, `apps/web/public/favicon.svg`, `apps/web/public/apple-touch-icon.png`, `apps/web/index.html`, `apps/web/src/components/RequireAuth.tsx`, `docs/DESIGN.md`
- [x] Routing: `/` shows the **landing page when signed out** and the recordings list when signed in (one `HomeRoute` that reads the session, so existing links to `/` keep working). Signed-out visits to app pages still go to `/login`. Unknown paths redirect to `/` instead of React Router's developer error page.
- [x] Sections as in the `Landing` mockup: header (logo, Sign in, Create account) → hero ("Record the conversation. Get the notes.", primary "Start recording for free" → `/signup`, secondary "I have an account" → `/login`, "English only for now") with an example-notes card built from real components (player look, decision with timestamp, action items) → How it works (3 steps) → modes (Meeting, Lesson, Voice memo, and the "Suggested next steps" box) → Free plan (600 minutes, the privacy note from `InfoNote`) → final call to action → footer.
- [x] No invented numbers, logos or testimonials. The minutes figure comes from `MONTHLY_MINUTES_LIMIT` only if the page can read it without signing in; otherwise the copy says "a monthly limit".
- [x] DESIGN.md: add the landing page to §6, and a "Landing hero" row to §3 (56px / 600, letter-spacing −0.025em, line-height 1.05; 40px at phone width). This is a type size, not a new token.
- [x] App icon (option A on the canvas, "Recorded note"): `public/favicon.svg` (rounded tile) and `public/apple-touch-icon.png` (180px, square, no transparency: iOS rounds it), linked from `index.html`. DESIGN.md: add an "App icon" row to §5.
- [x] **Verify:** signed out, `/` shows the landing page and both buttons reach the right page; signed in, `/` shows Recordings; `/nope` redirects to `/`. At 375px wide nothing scrolls sideways and the header buttons stay 44px.
- [x] **As built:** `HomeRoute` lives in `RequireAuth.tsx` next to `RequireAuth` (same session check). `/` is one route whose element is `<AppShell />` for a session (its index child is `RecordingsPage`) and `<LandingPage />` otherwise; while the session loads it renders nothing, so a signed-in user never sees the landing page flash. `/api/app-config` needs a session, so the landing copy says "Recording minutes have a monthly limit" instead of a number. The example card is plain markup in the detail page's look (the real `AudioPlayer` needs real audio); its checkboxes work. The footer shows "English only for now" instead of the mockup's contact-email placeholder. Section titles drop to 24px (the existing phone title size) at phone width. The touch icon was rendered with headless Chrome (no image library added). Verified in headless Chrome: 22 checks (both CTAs and header links, `/nope` and `/record` signed in and out, no "600", 375px: no sideways scroll, header links 44px, hero 40px, icons linked and served).
- [x] **Commit:** `feat(web): landing page`

### Task 1.19 — Better sign-in and sign-up
- [x] **Files:** `apps/web/src/pages/AuthLayout.tsx`, `LoginPage.tsx`, `SignUpPage.tsx`, `Auth.module.css`, `apps/web/src/components/PasswordField.tsx` (new), `docs/DESIGN.md`
- [x] Layout as in the `SignIn` / `SignUp` mockups: a grey panel on the **left** (example notes on sign in; the 3 steps + free-plan note on sign up) and the form column on the **right** (logo links to `/`, h1, one-line subtitle, max 400px). The form comes first in the HTML and the row uses `flex-direction: row-reverse`, so on a phone the form is on top and the panel below; screen readers and Tab reach the form first.
- [x] `PasswordField`: Show/Hide button (`aria-pressed`), sign up shows "At least 8 characters" as `aria-describedby` hint that gets a check icon when met.
- [x] Clear errors by Better Auth error **code**, with the message as fallback: wrong email or password → "That email and password don’t match an account. Check them, or create an account."; existing email on sign up → "An account with this email already exists." + "Sign in instead" link. Errors are `role="alert"` error text; inputs keep the normal border (red is text only).
- [x] After sign-in, return to the page the user came from (`RequireAuth` passes it in location state), else `/`. A signed-in user who opens `/login` or `/signup` goes to `/`.
- [x] DESIGN.md: move sign-in / sign-up from "Not designed yet" to §6.
- [x] **Verify:** wrong password shows the new message; duplicate sign-up shows the link; opening `/recordings/<id>` signed out → sign in → you land on that recording. Password managers fill both forms (`autocomplete` set).
- [x] **As built:** Better Auth 1.7.7's codes, checked against the running API: `INVALID_EMAIL_OR_PASSWORD` (401, also for an unknown email, so the page never reveals which accounts exist), `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (422) and `PASSWORD_TOO_SHORT` (400, mapped too). Two files beyond the list: `RequireAuth.tsx` puts `{ from: pathname + search }` in the `/login` redirect state, and `lib/return-to.ts` holds `useReturnTo()` (in `AuthLayout.tsx` it tripped the fast-refresh lint rule, which wants component files to export only components). `useReturnTo` accepts only paths starting with one `/`, so `//other.site` can't turn it into an open redirect. A signed-in visitor on `/login` goes to the same `returnTo` as a successful sign-in; with two different targets, the session refresh after signing in raced the `navigate()` call. The sign-up subtitle says "Recording minutes have a monthly limit" (no number, as on the landing page). The "Sign in instead" and "Create one" links pass the return target along. Verified in headless Chrome: 22 checks (both error messages, grey borders, Show/Hide, hint tick, autocomplete values, Tab order, return-to, signed-in redirects, phone stacking).
- [x] **Commit:** `feat(web): clearer sign-in and sign-up`

### Task 1.20 — Restyle to "Index cards"
> Chosen from 8 style directions on the design canvas (row "Style directions", option G). Reference boards: row "Chosen: Index cards, applied to the app" (`CardsTokens`, `CardsRecordings`, `CardsDetail`, `CardsRecord`, `CardsSignIn`) and `StyleCorkboard` for the landing page. This replaces the old white-and-grey look; the product rules stay (red = recording, suggestions apart from facts, every fact links back).
- [x] **Files:** `docs/DESIGN.md`, `apps/web/index.html`, `apps/web/public/favicon.svg`, `apps/web/public/apple-touch-icon.png`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`, the CSS modules in `apps/web/src/components/` and `apps/web/src/pages/`, plus small markup changes in `NotesEditor.tsx` (one card per section), `SegmentedControl.tsx` (mode cards), `Sidebar.tsx` (logo mark), `LandingPage.tsx`, `LoginPage.tsx`, `SignUpPage.tsx`, `AuthLayout.tsx`.
- [x] **Tokens** (DESIGN.md §2 and `tokens.css`): keep the existing names and change their values (board-era warm inks, `--color-line #D6CFC3`, record `#D93A2E`, …) so components follow without edits; add `--color-board`, `--color-board-dot`, `--color-card-edge`, the three card families (decision yellow, to-do green, idea lilac, each with fill / edge / ink), `--color-tape`, `--color-pencil`, `--font-hand`, `--radius-card`, `--radius-input`, `--shadow-card`, `--shadow-edge`. Fonts: Work Sans (400/500/600/800) for everything, Caveat (500/700) only for decorative margin notes.
- [x] **Page:** dotted board background on every page; sidebar on warm paper with the selected item as a white card; page titles 40 / 800.
- [x] **Components:** list rows and the player become white cards; tabs become folder tabs joined to their panel; notes sections become cards (summary and other lists white, Decisions yellow with the red pin, Action items green, Suggested next steps dashed lilac); the mode picker becomes three coloured cards (meeting yellow, lesson green, memo lilac) that keep the real radio inputs; buttons radius 12, inputs radius 10.
- [x] **Recordings list:** each row is a card; rows with notes show coloured count tabs only when the list API already has the counts (it doesn't add API fields in this task).
- [x] **Landing and auth:** landing follows `StyleCorkboard` (tilted, taped cards, handwritten notes); sign in / sign up put the form on a straight white card and tilted example cards on the board.
- [x] **Rules:** content cards in the app are straight (tilt ±1.5° only on landing, auth and empty-state decoration); handwriting is `aria-hidden` decoration, never content, labels, buttons or errors; sentence case everywhere; no hex colors outside `tokens.css`; nothing moves on its own.
- [x] **App icon:** the new logo mark (a tilted white card with the red dot on the board color) as `favicon.svg` and a 180px square `apple-touch-icon.png`.
- [x] **Verify:** `pnpm turbo lint typecheck test` green; the Task 1.17, 1.18 and 1.19 browser checks still pass unchanged (behaviour must not change); screenshots of every screen at 1280px and 375px match the boards; no sideways scroll at 375px; computed contrast of body, muted and card-ink text ≥ 4.5:1 on their backgrounds; `grep` finds no `#` colors in CSS modules.
- [x] **As built:** Task written into the plan when you asked to implement it (it was proposed after the boards, not yet in the plan). Old token names kept with new values, so most components needed no code change; `--radius-lg`/`--radius-xl` stay as 4px aliases for old call sites; `--shadow-lift` became a token so no `rgba()` lives in modules. New: `LogoMark` component (the mark is used in the sidebar, landing and auth; the first version, a card with only a red dot, read as a flag, so it got lines of writing like the icon), the `.pencil` class in `base.css`, a `tone` option on `SegmentedControl`. The recordings list colors each row's mode tile instead of count tabs (the list API has no counts; no API change here). Notes view gained a "Summary" card label. The landing hero copy changed to the board's "Talk it through. Get it on cards." and is 64px (DESIGN.md §3 updated); a handwritten "said at 4:12" is `aria-hidden` with the same fact in a visually hidden line. Verified: CI green; the Task 1.17 / 1.18 / 1.19 suites pass (67 checks; only three expected values changed: the new ink and line colors and the new hero copy); a new 41-check suite (13 measured contrast pairs, lowest muted-on-board 4.52:1; Work Sans loaded; pencil notes `aria-hidden`; every screen at 1280 and 375 with no sideways scroll; no tilted content in the app; card colors per section; mode cards with real radios); `grep` finds no hex colors in CSS modules.
- [x] **Commit:** `feat(web): index cards restyle`

### ✅ Phase 1 acceptance test (do it manually, then write it down as a checklist in the README)
- [ ] Record **5 minutes of English** speech in Chrome → transcript and notes appear without any manual step.
- [ ] Lesson mode produces concepts + review questions; memo mode produces ideas.
- [ ] Proposals are specific to the content, not generic advice.
- [ ] Network drop during recording does not lose audio.
- [ ] A recording **> 60 minutes** completes (map → reduce path is used).
- [ ] Another user cannot open your recording by guessing the URL.
- [ ] `pnpm turbo lint typecheck test` is green.
- [ ] Everything above works with `STT_PROVIDER=groq` and `NOTES_PROVIDER=groq` — **total cost $0**.
- [ ] The app is online at `https://<your-name>.duckdns.org` (Task 1.16) and recording works from your phone's browser.

---

## 8. Phase 1b — Switch to the paid stack (≈1–3 days)

**Goal:** better quality and privacy for real recordings. Same code, same server — only the AI providers change. Do this when you want to record other people, hit Groq's limits, or want better notes.

### Task 1b.1 — Accounts and spend limits
- [ ] Create an OpenAI API account and an Anthropic (Claude) API account, add a payment method, create API keys.
- [ ] Set a **monthly spend limit** in both consoles (for example $10 each) before using them.
- [ ] Keep `MONTHLY_MINUTES_LIMIT` in `.env` (for example 1,200 = 20 hours ≈ $8/month).

### Task 1b.2 — Switch providers
- [ ] In the server `.env`: `STT_PROVIDER=openai`, `NOTES_PROVIDER=claude`, `OPENAI_API_KEY=...`, `ANTHROPIC_API_KEY=...`, `NOTES_MODEL=claude-haiku-4-5` (cheapest) — try a Sonnet model later if notes need more depth. Check current model names in the Claude docs.
- [ ] `docker compose -f docker-compose.prod.yml up -d` (restarts API + worker with the new env). The key check in `ai/providers.ts` makes the worker fail fast if a key is missing.
- [ ] Optional: keep free as a fallback in development by using a separate local `.env`.

### Task 1b.3 — Compare free vs paid on the same recordings
- [ ] Add a small script `scripts/compare-providers.ts` that runs the same 3–4 audio files through both stacks and writes the transcripts and notes side by side into `compare/<file>.md`.
- [ ] Judge: transcript errors, missed action items, quality of proposals. Write the result in the README — it decides which stack each environment uses.

### Task 1b.4 — Track cost per recording
- [ ] Migration: add `stt_provider`, `notes_provider`, `input_tokens`, `output_tokens`, `cost_usd` to `recordings`.
- [ ] STT cost = `duration_ms / 60000 × price_per_min`; notes cost from the token usage the API returns (`usage` in the Claude response). Prices live in one `pricing.ts` file so they are easy to update.
- [ ] Show "This month: X minutes, $Y" on the recordings page.

### Task 1b.5 — Privacy switch
- [ ] When `freeMode` from `GET /api/app-config` (Task 1.11) is true, i.e. `STT_PROVIDER=groq` or `NOTES_PROVIDER=groq`, show a small "Free mode — test recordings only" badge on the Record page. It disappears automatically in the paid stack.

### ✅ Phase 1b done when
- [ ] The Phase 1 acceptance test passes again with `STT_PROVIDER=openai` and `NOTES_PROVIDER=claude`.
- [ ] Cost per recording is visible and matches the provider dashboards within a few cents.
- [ ] The comparison results (Task 1b.3) are written in the README.

---

## 9. Later phases (overview — will be broken into tasks when you get there)

### Phase 2 — Quality, search and Ukrainian (≈2–3 weeks)
- **Ukrainian support:** add `uk` / `auto` to `LanguageCode`, a language selector on the Record page, a per-user notes-language setting (needs storage, e.g. a `user_settings` table), and a `notesLanguage` parameter in prompts and `NotesGenerator`. Compare STT providers on Ukrainian samples first.
- Speaker labels (diarization): switch/add an STT adapter that returns speakers (candidate: OpenAI `gpt-4o-transcribe-diarize`); UI to rename "Speaker 1" → a real name (stored per recording).
- Embeddings for transcript segments (fill the `embedding` column), HNSW index on pgvector.
- Search page: full-text (`tsvector`) + semantic search combined (the search field is already in the Recordings design).
- "Ask your recordings" chat: retrieve top segments → answer with links to `[recording, timestamp]`.
- Action items page across all recordings (filter: open / done / owner), plus the "Assign" button for items without an owner.

### Phase 3 — Desktop app, Electron (≈2 weeks)
- Electron shell loading the web UI; same API and auth.
- Tray icon, global hotkey to start/stop, "always on top" mini recorder.
- **System audio capture** for Zoom/Meet/Teams calls, mixed with the mic via Web Audio API. Do a 1–2 day spike first on your OS — Windows and macOS work differently, and this is the riskiest part of the whole project.
- Auto-update and code signing (needed later for distribution).

### Phase 4 — Mobile app, Expo (≈2–3 weeks)
- Record with `expo-audio`, saving to a local file first.
- Background recording (iOS background audio mode, Android foreground service with a notification).
- Offline upload queue: upload when the network returns; show "waiting to upload".
- Same screens using the shared API client, schemas and `notesToMarkdown`; the recording screen follows `docs/design/screens/PhoneRecording.dc.html` and the tokens in `docs/DESIGN.md`.

### Phase 5 — Live mode (≈2 weeks)
- WebSocket from client → API → streaming STT provider; show the transcript live.
- Refresh "live notes" every few minutes for long meetings; final notes still made by the batch pipeline at the end.

### Phase 6 — Local processing (≈2–3 weeks)
- `WhisperCppStt` adapter (whisper.cpp or faster-whisper) and `OllamaNotes` adapter, chosen in `ai/providers.ts`.
- Desktop: run local models directly on the user's computer. Mobile: `whisper.rn` with small models for on-device transcription.
- User setting **"Privacy mode: process locally"**; show which engine processed each recording.
- Compare quality on the same samples you used to choose the cloud provider.

### Phase 7 — Production hardening + SaaS business
- **Billing:** subscription plans with monthly minute quotas (free plan with a small allowance, paid plans with more). `MONTHLY_MINUTES_LIMIT` becomes a per-plan value stored on the user. Choose a payment provider that supports your country as a seller — check this early, it can take weeks to set up.
- **Legal pages:** Terms of Service, Privacy Policy, recording-consent rules for users, data deletion on request. Get basic legal advice before charging money (GDPR applies to EU customers).
- **Unit economics:** track cost per user per month (Task 1b.4). At scale, compare cheaper paid speech-to-text (for example Groq's paid tier) against OpenAI — the adapter makes this a config change.
- **Growth basics:** landing page, waitlist/sign-up analytics, onboarding email, feedback channel.
- Admin view of costs; retention settings (auto-delete audio after N days, keep notes).
- Encryption at rest, rate limits, Sentry error monitoring, structured logs.
- Backups for Postgres and object storage.

---

## 10. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| **Consent / privacy** — recording other people | Clear recording indicator + reminder in UI. For lessons, get the school's and parents' permission before recording real classes. Easy full delete. |
| Privacy on the free AI tier | Groq's free tier has no privacy guarantee: only your own test recordings. Real people only after switching to the paid stack (Phase 1b) |
| Cloud costs grow | Free stack first; in the paid stage: monthly minutes limit, console spend limits, per-recording cost tracking (Task 1b.4) |
| Free tiers change or disappear | Everything is behind adapters and env variables; the Oracle VM can be replaced by any $4–6/month VPS running the same `docker-compose.prod.yml` |
| Oracle "out of capacity" when creating the VM | Retry at different times / availability domains; develop locally meanwhile |
| Storage software (MinIO community edition archived in 2026) | Local dev uses RustFS, production uses managed Cloudflare R2; everything goes through the S3 API, so either can be replaced |
| Transcription quality (English now, Ukrainian later) | Compare providers on real samples before choosing; adapter makes switching cheap |
| AI invents facts in notes | Prompt rules + "only what was said" + openQuestions; suggestions are visibly separated in the UI; user can edit everything |
| Safari / iOS audio quirks | Test Safari in Phase 1; Phase 4 uses native recording on mobile |
| System audio capture on desktop | Spike first in Phase 3 before committing to the design |
| Scope (3 platforms, one developer) | Phases 0–2 are a complete portfolio project; everything after is a bonus |

---

## 11. Timeline at a glance

| Phase | Estimate | Result |
|---|---|---|
| 0 Foundations | ~1 week | Monorepo, infra, auth, CI (+ catch-up Task 0.9) |
| 1 Web MVP (free stack) | ~3 weeks | Record → transcript → notes & proposals → edit/export, online for $0 |
| 1b Paid stack | 1–3 days | OpenAI speech-to-text + Claude notes, cost tracking, quality comparison |
| 2 Quality, search & Ukrainian | 2–3 weeks | Speakers, search, Q&A over recordings, Ukrainian support |
| 3 Desktop | ~2 weeks | Electron app with call recording |
| 4 Mobile | 2–3 weeks | Expo app with offline recording |
| 5 Live mode | ~2 weeks | Real-time transcript |
| 6 Local processing | 2–3 weeks | Private/offline mode |
| 7 Hardening + SaaS | ongoing | Billing, legal, ready for real users |

Estimates assume part-time work alongside a job; adjust after Phase 0 based on your real speed.
