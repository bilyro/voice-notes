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
| Languages | **English, Ukrainian and Spanish** (Task 1.26): the user picks the language on the Record page, speech-to-text is forced to it and the notes are written in it. The app's own interface stays **English only**. Auto-detect and notes in another language than the recording come later (Phase 2) |
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

### Task 1.21 — Sidebar "Recent cards" and the /about page
> Option A of the design canvas board "Sidebar: 3 options" (row "Sidebar redesign"). The logo now opens the landing page, also for signed-in users.
- [x] **Files:** `apps/web/src/components/Sidebar.tsx` (+ CSS module), `apps/web/src/router.tsx`, `apps/web/src/pages/LandingPage.tsx` (+ CSS module), `docs/DESIGN.md`
- [x] **Route `/about`:** the landing page for everyone (no session needed). `/` keeps its behaviour (landing when signed out, recordings when signed in), so no existing links change.
- [x] **Landing when signed in:** the header shows "Open my recordings" (→ `/`) instead of Sign in / Create account; the hero buttons become "New recording" (→ `/record`) and "Open my recordings"; the final call to action becomes "New recording". Signed out it stays as it is.
- [x] **Sidebar:** logo (mark + "Voice notes") links to `/about` with the title "About Voice notes"; it keeps the ink color on hover (no grey) and shows a rounded focus outline. Then "New recording", then the nav item "All recordings" with the number of recordings, then a "Recent" section: the 3 newest recordings as mini white cards with a 4px left edge in their mode's card-edge color (meeting yellow, lesson green, memo lilac), title (14/600) + "Mode · Day" or the processing step ("Writing notes…"). Each mini card links to the recording; the current one is marked `aria-current="page"`. The Recent list reuses the `["recordings"]` query (same cache as the list page, no new API).
- [x] **Account card** at the bottom: initials circle (from the user's name, else the email), the email (ellipsis when long) and a 36px icon button "Sign out" (`aria-label`).
- [x] **Phone (sidebar stacked on top):** the Recent section is hidden so the page content isn't pushed far down; everything else stays.
- [x] DESIGN.md §5 `Sidebar` row and §6 screens table updated.
- [x] **Verify:** the logo from any app page opens `/about` with "Open my recordings", which goes back to `/`; signed out `/about` shows Sign in / Create account; the count matches the list; Recent shows the 3 newest in order and links to them; Sign out works from the icon button; at 375px no sideways scroll and no Recent section; the Task 1.17–1.20 browser suites still pass.
- [x] **As built:** `/about` renders the same `LandingPage`, which reads the session and swaps its buttons; the landing header logo still links to `/`. The sidebar shares the `["recordings"]` query with the list page and polls only while something is processing; Recent cards are `NavLink`s, so `aria-current` comes for free. Initials come from the user's name ("T120" → "T1"), else the email. Found and fixed a bug from Task 1.19: Sign out navigated to `/login` while the session was still cached, so the login page forwarded to `/` and you landed on the landing page; the sidebar now refetches the session before navigating (the same pattern sign-in uses). One old check changed on purpose: the nav item reads "All recordings" + count instead of "Recordings". Verified in headless Chrome: 18 new checks (signed-out and signed-in `/about`, count = list length, the 3 newest with their edge colors, initials, logo hover keeps ink, Recent opens and marks the recording, "Open my recordings" back to the list, phone: Recent hidden and no sideways scroll, Sign out lands on `/login`) plus the Task 1.17–1.20 suites (108 checks) and CI.
- [x] **Commit:** `feat(web): sidebar with recent recordings and an about page`

> Tasks 1.22–1.25 fix the findings of the Phase 1 acceptance test (see its "As built" note below).

### Task 1.22 — Uploads survive long network drops
> After a drop longer than about 30 s, a chunk gave up after 5 tries, and Stop asked the user to click **Try again**. "Saved up to" counted uploaded chunks, so it hid the gap.
- [x] **Files:** `apps/web/src/lib/api.ts`, `apps/web/src/recorder/chunk-uploader.ts`, `apps/web/src/pages/RecordPage.tsx` (+ CSS module), `docs/DESIGN.md` (§6 row for the no-connection states)
- [x] **`ApiError`:** `api()` throws an `ApiError` with the HTTP `status` (still an `Error`, same message). A network failure stays a `TypeError` from `fetch`.
- [x] **Retry until it works:** a chunk upload that fails because of the network, a 5xx, 408 or 429 keeps retrying: waits of 2, 4, 8 s, then every 15 s, and right away when the browser fires `online`. Only an API refusal (any other 4xx) gives up and goes to the failed list, which keeps **Try again**.
- [x] **Saved up to** = the chunks uploaded without a gap from the start (the first missing index), not the number uploaded.
- [x] **Live screen:** while uploads are waiting for the connection, the line under the controls becomes a status (`role="status"`): "No connection. Keep recording: the last N s of audio are kept here and upload when you are back online." Otherwise it keeps "Lost connection? Keep recording. Audio uploads when you are back online."
- [x] **Saving with no connection:** Stop waits for the queued chunks instead of failing: "Saving… waiting for the connection to upload the last N s. Keep this page open." It finishes on its own when the connection returns.
- [x] **Verify** (headless Chrome, speech fed in as the microphone, API requests failed while "offline"): a 60 s drop mid-recording shows the no-connection status and "Saved up to" stays at the drop; it catches up after the drop with no error and no click; going offline just before Stop shows the waiting message and the recording saves on its own when the connection returns; the transcript has every turn; CI green.
- [x] **As built:** `ChunkUploader` reports `{ saved, pending, offline }`. `saved` is the first index not yet stored, so a gap can't hide behind later chunks. Uploads stay sequential, so the chunks after a waiting one queue behind it in order. The wait wakes early on `online`; without the event (request interception in the test, or a flaky network), the 15 s retry still gets through. "the last m:ss" is recording time minus "Saved up to", so it is exactly the audio that only lives in the tab. Both no-connection messages are ink 600 (`.offlineNow`), not red. A refused chunk still shows the old error with **Try again**. Verified in headless Chrome with speech fed in as the microphone: 14 checks. 60 s drop: status shown, "Saved up to" frozen at 0:20, no error, back in 0.4 s after `online`. Drop over Stop: the waiting message in ink, no Try again, saves on its own via the 15 s retry. The transcript has every phrase and the longest silence is 3.3 s. Also: the Task 1.11 Record suite (record, pause, resume, Stop → detail, no console errors) and CI. (That old suite's "statuses seen" line has been empty since Task 1.14: it reads the first `role="status"`, now the hidden "Notes copied" announcement.)
- [x] **Commit:** `fix(web): keep retrying chunk uploads until the connection returns`

### Task 1.23 — Due dates as they were said
> "by May second" was saved as `2024-05-02`: the model turned the date into a numeric date with a year it guessed.
- [x] **Files:** `apps/api/src/ai/notes/prompts.ts`
- [x] **Prompt rule:** `dueDate` is the deadline in the speaker's words ("Friday, April 11", "next week", "by the end of term"). Never turn it into a numeric date or add a year that wasn't said. Same rule for both adapters (Groq and Claude share the prompt) and for the merge step (it repeats the system prompt).
- [x] **Verify:** the 5-minute meeting and the 61-minute planning day from the acceptance test, uploaded again: every `dueDate` is in words with no invented year (no `YYYY-MM-DD`, no year that wasn't said); action items and owners are as complete as before; CI green.
- [x] **As built:** one new rule line in the shared prompt, with neutral examples. The negative example is the pattern `YYYY-MM-DD`, not a real date, so the model isn't primed with a year. Verified with the acceptance-test audio on Groq. 5-minute meeting: the dates came out as "Friday April 11th", "Wednesday April 9th", "Monday, April 7th", and "this week" is now kept (it used to be null); 6 of 6 action items and owners. 61-minute planning day: all 40 due dates in words ("May 2nd" … "October 1st"), no numeric date or year; 40 action items with owners (39 before). CI green. Notes saved before this change keep their old dates.
- [x] **Commit:** `fix(api): keep due dates as they were said`

### Task 1.24 — "Not found" without the wait
> Opening a recording that isn't yours (or was deleted) showed a blank page for about 7 s: TanStack Query retried the 404 three times.
- [x] **Files:** `apps/web/src/main.tsx`, `apps/web/src/pages/RecordingDetailPage.tsx`
- [x] **No retries for API refusals:** the `QueryClient` default `retry` skips 4xx `ApiError`s (Task 1.22) and keeps up to 3 retries for network errors and 5xx.
- [x] **Detail page:** "not found" is detected by `status === 404` instead of the error message text.
- [x] **Verify:** another user opening `/recordings/<id>` sees "This recording does not exist or was deleted." within 1.5 s; a wrong-but-valid id the same; the Task 1.17 delete suite still passes; CI green.
- [x] **As built:** `isRefusal()` (from Task 1.22) decides for both the uploader and the queries, so "worth retrying" means the same everywhere: network errors, 5xx, 408 and 429. Verified in headless Chrome, 6 checks. Another user's recording and a random valid id show "does not exist" in 135 ms and 233 ms after a single request. A network error is still retried (4 requests) and shows the connection message after 7.2 s. Also the Task 1.17 delete suite (23 checks, with fresh test data) and CI.
- [x] **Commit:** `fix(web): show not found at once instead of retrying a 404`

### Task 1.25 — API tests don't share queues with the dev worker
> With a dev worker running, the API tests failed ("could not be removed because it is locked by another worker"): the worker picked up the tests' jobs from the same Redis queues.
- [x] **Files:** `apps/api/src/config.ts`, `apps/api/src/queue/queues.ts`, `apps/api/src/worker.ts`, `apps/api/package.json`, `README.md`
- [x] **`QUEUE_PREFIX`:** a new optional setting (default `bull`, BullMQ's own default, so existing queues keep working). Queues and workers use it.
- [x] **Tests:** the `test` script sets `QUEUE_PREFIX=test`, so test jobs live under `test:*` keys that the dev worker never reads.
- [x] **README:** remove the "stop the worker before running the tests" note.
- [x] **Verify:** `pnpm turbo lint typecheck test` is green **with** `pnpm --filter @vn/api worker` running; the test run leaves its keys under `test:` in Redis; the dev worker still processes a real recording.
- [x] **As built:** `QUEUE_PREFIX` is read once in `config.ts` and passed to both queues and to the worker's options. Production and dev keep `bull`, so no queued jobs are lost on deploy. `.env` doesn't need the setting. Verified: with a dev worker running, `pnpm turbo lint typecheck test` is green (9/9, API 25/25, no "locked by another worker"). Redis had 0 `test:*` keys before and 4 `test:notes` + 4 `test:transcribe` after. A real memo then went through the dev worker under `bull:` (ready in 5 s). The README note about stopping the worker is replaced by one about the prefix.
- [x] **Commit:** `fix(api): separate queue prefix for tests`

### Task 1.26 — Record in Ukrainian and Spanish
> Decided on 2026-10-22: besides English, you can record in **Ukrainian** and **Spanish**. The transcript and the notes come out in the language of the recording; the app itself (buttons, pages, messages, Markdown headings) stays in English. Auto-detect and a separate notes language stay in Phase 2.
- [x] **Files:** `packages/shared/src/schemas/recording.ts`, `apps/api/src/ai/notes/*` (prompts, generator interface, chunked base, Groq + Claude adapters), `apps/api/src/jobs/notes.job.ts`, `apps/api/src/ai/stt/speech-to-text.ts`, `apps/api/scripts/try-notes.ts`, `apps/api/scripts/try-stt.ts`, API tests, `apps/web/src/pages/RecordPage.tsx` (+ CSS module), `apps/web/src/pages/RecordingDetailPage.tsx`, `apps/web/src/components/NotesEditor.tsx`, `apps/web/src/components/Transcript.tsx`, `apps/web/src/pages/LandingPage.tsx`, `CLAUDE.md`, `docs/DESIGN.md`, this plan (§1, Phase 2)
- [x] **Shared:** `LanguageCode = z.enum(["en", "uk", "es"])` (default stays `en`) and `LANGUAGE_NAMES` (`English`, `Ukrainian`, `Spanish`) used by the prompt and the web app. No migration: `recordings.language` is a text column with default `'en'`.
- [x] **Speech-to-text:** unchanged; it already forces `rec.language` (Whisper accepts `uk` and `es`).
- [x] **Notes:** `NotesGenerator.generate(segments, mode, language)`; the system prompt says "Write all notes in <Language>, the language of the recording" (the JSON keys stay English). The map → reduce merge keeps it, because it uses the same system prompt. The dev scripts take an optional language argument.
- [x] **Record page:** a "Language" select between Title and Microphone: English, Ukrainian (українська), Spanish (español), with the hint "The language people speak in the recording. The transcript and notes use it too." The last choice is remembered in this browser (`localStorage`, wrapped in try/catch). The consent line drops "English only for now".
- [x] **Detail page:** for a non-English recording the meta line shows the language; the transcript and the notes carry `lang="uk"` / `lang="es"` so screen readers pronounce them correctly.
- [x] **Landing:** "English only for now" becomes "Record in English, Ukrainian or Spanish" (hero note and footer).
- [x] **Rules and docs:** CLAUDE.md's "English only" rule, §1 Decisions, the Phase 2 bullet and DESIGN.md (Record form) say what is supported now.
- [x] **Verify:** API tests: `uk` and `es` are accepted and saved, an unsupported code (`de`) is a 400; a prompt test checks the language line. In headless Chrome, a Ukrainian meeting recorded through the Record page (speech fed in as the microphone) gives a Cyrillic transcript and Ukrainian notes, the detail page shows "Ukrainian" and `lang="uk"`, and the selector remembers Ukrainian on the next visit. A Spanish memo uploaded through the API gives Spanish notes. An English recording still gives English notes. Landing shows the new line. CI green.
- [x] **As built:**
  - **`lang` only on the recording's text:** summary, list items, to-do text, transcript lines and the edit fields carry it; headings and the transcript's timestamp buttons stay English.
  - **Live screen:** shows a second chip ("Ukrainian") next to the mode chip, so you can check before talking.
  - **Bug found on the way and fixed:** the to-do meta line read "Олена, by до понеділка", because the app added an English "by" to a date that, since Task 1.23, is kept as it was said. English would have had "by by the end of term" too. It is now "owner · date" in the recording's language, the same neutral style as the Markdown export.
  - **Verified:**
    - API tests: `uk`/`es` saved, English by default, `de` → 400, plus a prompt test; 28 API tests in all.
    - Headless Chrome, 23 checks. A Ukrainian meeting recorded through the Record page (macOS voice Lesya fed in as the microphone): 100% Cyrillic transcript, Ukrainian summary, decisions and 3 to-dos with owners and dates in words ("до понеділка"), "Ukrainian" in the meta line, `lang="uk"` on the notes and on all 6 transcript lines, the choice remembered on the next visit.
    - Through the API: a Spanish memo gave Spanish notes and ideas; an English memo still gave English notes.
    - Landing and consent text have no "English only" left; no console errors; CI green.
  - **Quality note:** Groq's free Whisper heard "п'ятницю" as "Татницю" once on the synthetic voice. Ukrainian and Spanish accuracy is something to judge in Task 1b.3.
- [x] **Commit:** `feat: record in Ukrainian and Spanish`

> **Decided on 2026-10-22 (what comes next):** first the web features below (Tasks 1.27–1.30, all on the free stack), then the **desktop app** (Phase 3). After that, live mode or the mobile app. Speaker labels ("who said what") wait for the paid stack (Phase 1b), because Groq's free Whisper can't tell speakers apart. Shared links show the **notes only**.

### Task 1.27 — Upload an audio file
> Drop in an existing recording (a phone voice memo, a Zoom/Teams export) instead of recording live. It uses the same pipeline and chunk upload as live recording, which the desktop and mobile apps will reuse too.
- [x] **Files:** `packages/shared/src/schemas/recording.ts`, `apps/web/src/pages/RecordPage.tsx` (+ CSS module), `apps/web/src/recorder/file-upload.ts` (new), `apps/web/src/recorder/chunk-uploader.ts` (Cancel), `apps/api/src/audio/prepare-audio.ts` (+ test: `-vn`, see As built), `docs/DESIGN.md`
- [x] **Shared:** `source` gains `"upload"`.
- [x] **Record page:** under the record button, a secondary "Upload an audio file" button (a hidden `<input type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm">`). Mode, title and language come from the same form; the title defaults to the file name without its extension.
- [x] **In the browser:** read the duration from the file's metadata (`<audio>` `loadedmetadata`). Refuse it with a clear message if it isn't playable audio or is longer than 2 hours (the free speech-to-text takes 25 MB per file, which is about 2 h after our 24 kbps conversion). Then create the recording, slice the file into 5 MB byte chunks (the API takes 10 MB per chunk) and send them through `ChunkUploader` (Task 1.22 retries included), then `finish` with the real duration. No API change: the worker joins byte chunks and ffmpeg reads the original format.
- [x] **Progress:** "Uploading… 40%" with a progress bar, a Cancel button (deletes the half-uploaded recording) and the same no-connection messages as live recording. When done, go to the recording.
- [x] **Verify:** `.m4a`, `.mp3` and `.wav` files made with ffmpeg from test speech each give a transcript and notes; a 2 h 10 min file and a `.txt` renamed to `.mp3` are refused with their messages before anything is uploaded; a 60 s network drop during upload recovers on its own; Cancel leaves nothing behind; the monthly minute limit still applies; CI green.
- [x] **As built:**
  - **One small API change after all:** the plan said none was needed, but a video file (a Zoom `.mp4`) made the worker's ffmpeg try to re-encode the picture into the `.ogg` and fail ("Encoder not found"). `prepareAudio` now passes `-vn` (sound only), with an API test that turns a 2-chunk `.mp4` into one Opus audio stream.
  - **Cancel:** `ChunkUploader.cancel()` aborts the request in flight and every waiting retry (an `AbortSignal` passed to `fetch` and to the retry wait), so Cancel also works while offline. The page then deletes the recording. `save()` checks that its uploader is still the current one, so a cancelled upload never calls `finish`.
  - **Duration:** read from the file in the browser. WebM files from MediaRecorder have no duration in their header, so the code seeks far ahead to make the browser work it out.
  - **Verified in headless Chrome, 24 checks:**
    - `.m4a` (English memo), `.mp3` (Spanish memo), `.mp4` with video (English meeting) and a 12 MB `.wav` (Ukrainian meeting, 3 chunks, the whole 2:08 transcribed) each reached Ready, with `source = upload`, the title from the file name and the right language, mode and duration.
    - A 2 h 10 min file and a text file named `.mp3` were refused with their messages, and nothing was created.
    - With the chunk uploads cut: "No connection…" at 0%, no error, finished on its own when the connection returned.
    - Cancel while offline: back to the form within 5 s, nothing left.
    - The monthly limit: the API's message with Try again and Cancel, and Cancel cleaned up.
    - Phone width: no sideways scroll. No page errors. CI green (29 API tests).
  - **Possible follow-up:** the monthly limit is checked at `finish`, so a big file uploads completely before it is refused. A "minutes left" check before uploading would save that wait.
- [x] **Commit:** `feat(web): upload an audio file`

### Task 1.28 — Search recordings
> The search field from the Recordings mockup ("Search titles, transcripts and notes"). Full-text search now; meaning-based (semantic) search stays in Phase 2.
- [x] **Files:** `apps/api/migrations/003_search.ts` (new), `apps/api/src/modules/search/*` (new controller + service + repository, registered in `server.ts`), `packages/shared/src/schemas/search.ts` (new), `apps/web/src/pages/RecordingsPage.tsx` (+ CSS module), `apps/web/src/components/Snippet.tsx` (+ CSS module, new), `apps/web/src/pages/RecordingDetailPage.tsx`, `apps/web/src/components/AudioPlayer.tsx`, `docs/DESIGN.md`
- [x] **Migration:** a stored, generated `tsvector` column on `transcript_segments` (`to_tsvector('simple', text)`) with a GIN index, and a GIN expression index on the latest notes (`jsonb_to_tsvector('simple', content, '["string"]')`, string values only, so JSON keys like "summary" never match). We use the `simple` configuration because recordings are English, Ukrainian or Spanish and Postgres has no Ukrainian dictionary. Titles are matched with `ILIKE`.
- [x] **API:** `GET /api/search?q=` (`requireUser`, at least 2 characters, up to 20 recordings, only your own). Each result is the recording (id, title, mode, language, createdAt) plus up to 3 matches: `{ kind: "title" | "notes" | "transcript", snippet, startMs? }`. Snippets come from `ts_headline` with the match marked, and the web app renders the mark safely (no raw HTML from the database).
- [x] **Web:** the search field above the list (debounced 300 ms; the query is kept in the URL as `?q=` so Back works). While searching, the list shows the results instead: the title card plus snippet lines, and a transcript match shows its timestamp. "No recordings match 'xyz'" when empty. A transcript match links to `/recordings/:id?t=<ms>`, and the detail page opens the Transcript tab and jumps there.
- [x] **Verify:** API tests: a word from a transcript, a word from the notes and a title word each find the right recording; another user's recording never appears; a Ukrainian word finds the Ukrainian recording; JSON keys don't match. In the browser: type → results with marked words; click a transcript match → the detail page plays from that moment; clearing the field shows the full list again; Back keeps the query; CI green.
- [x] **As built:**
  - **Query:** only letters and digits (any script) become words, so `to_tsquery` can never get a syntax error. Every word must match, each as a prefix ("scien gym", "ЛЬВОВ" → "Львова").
  - **Three queries, merged:** titles with `ILIKE`, the **latest** notes version with `jsonb_to_tsvector` (string values only, joined into one text for `ts_headline`), and up to 3 transcript lines per recording. They are merged in the service (title first, then notes, then lines; at most 3 matches), newest recording first.
  - **Marks:** the database marks words with `⟦…⟧` (constants in `@vn/shared`), and a `Snippet` component turns them into `<mark>`. Everything else stays text, so a title like `<b>bold</b> <img onerror=…>` shows literally.
  - **Jump to a moment:** the detail page reads `?t=`, opens the Transcript tab, seeks once the player exists and scrolls the line into view. `AudioPlayer.seek` now ignores a browser that blocks autoplay (it waits at that moment) instead of an unhandled rejection.
  - **Found by testing and fixed:** while a new query loaded, the previous results stayed on screen looking current, and a click could open the wrong moment. They are now dimmed, marked `aria-busy`, and the status says "Searching…". "No recordings match" only shows for the current query.
  - **Limit:** no accent folding ("arbol" doesn't find "árbol"); that needs the `unaccent` extension.
  - **Verified:**
    - API tests, 10: transcript, notes and title words, every-word prefix matching, Ukrainian in any case, never another user's, no JSON-key matches, only the latest notes version, 400 under 2 characters and 401 signed out, plus the query helpers.
    - Headless Chrome, 18 checks: labelled field, query in the URL after the pause, marked words, a Ukrainian match at 0:37 opens the Transcript tab with the audio at 37.2 s and that line highlighted and in view, Back keeps the query and results, the loading state (with the search held for 2 s), empty message, type filter on results, HTML title shown as text, clearing brings the list back, phone width, no page errors.
    - Migration rollback and re-apply; CI green (39 API tests).
- [x] **Commit:** `feat: search titles, transcripts and notes`

### Task 1.29 — All to-dos in one place
> An "Action items" page across every recording: what's still open, who owns it, tick it off.
- [x] **Files:** `apps/api/src/modules/action-items/*` (new, registered in `server.ts`), `packages/shared/src/schemas/action-items.ts` (new), `apps/web/src/pages/ActionItemsPage.tsx` (+ CSS module, new), `apps/web/src/router.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/OwnerLine.tsx` (new, shared with `NotesEditor`), `apps/web/src/pages/RecordingDetailPage.tsx` (refreshes this list), `apps/api/src/server.ts` (CORS allows `PATCH`), `docs/DESIGN.md`
- [x] **API:** `GET /api/action-items?status=open|done|all` returns your items with their recording (id, title, mode, createdAt), newest recording first. `PATCH /api/action-items/:id { done }` flips the matching item in the recording's latest notes and saves it as a new version (`edited_by_user`), then rewrites `action_items`, all in one transaction. The notes stay the source of truth, so the detail page and this page always agree. Another user's item returns 404.
- [x] **Page `/action-items`:** a filter (Open · Done · All, default Open, kept in `?status=`), an optional owner filter built from the owners found, items grouped by recording (title links to it), each a to-do card row like on the detail page (checkbox, text, "owner · date" in the recording's language). The count of open items shows in the sidebar.
- [x] **Sidebar:** a nav item "Action items" with the open count, under "All recordings".
- [x] **Verify:** API tests: list only your items; PATCH creates a new notes version with that item done and the others unchanged; a second PATCH flips it back; another user's id → 404. In the browser: tick on this page → it moves to Done and the detail page shows it ticked; tick on the detail page → this page updates; the owner filter works; empty states ("Nothing open. Nice."); the sidebar count matches; phone width has no sideways scroll; CI green.
- [x] **As built:**
  - **Finding the item:** `action_items` is rewritten from the notes on every save, so an item's index in its recording is the number of rows with a smaller id. The service checks that the notes' item at that index has the same text. If the notes changed meanwhile (another tab), it answers 409 "These notes were changed meanwhile…" instead of ticking the wrong item.
  - **Ids change on every save,** so the page refetches after each tick and disables the checkboxes while one is saving.
  - **Caching:** the page and the sidebar count share one query (`["action-items", "open"]`). The detail page refreshes it after saving notes or deleting a recording.
  - **Instant tick:** in "Open", a ticked item stays (struck through) until the list reloads.
  - **Reuse:** the to-do card styles come from `NotesEditor.module.css`, and "owner · date" became a small `OwnerLine` component used by both pages.
  - **CORS:** the API's list didn't allow `PATCH` yet; added.
  - **Owner sorting:** owners are sorted for the browser's language (Cyrillic first in a Ukrainian browser).
  - **Verified:**
    - API tests, 5: only your own items in the notes' order, newest recording first; a tick creates a new notes version with only that item done and untick works too; another user's or an unknown id → 404; changed notes → 409; bad status or id → 400; no session → 401.
    - Headless Chrome, 19 checks: sidebar link and count; groups, order and `lang`; instant tick, then it leaves "Open" and the count drops; Done in the URL; the detail page shows it ticked; a tick on the detail page updates the count and this page; owner filter including "No owner"; empty state "Nothing open. Nice." with count 0; deleting a recording removes its items; phone width; no page errors.
    - CI green (44 API tests).
- [x] **Commit:** `feat: action items page across recordings`

### Task 1.30 — Share a read-only link (notes only)
> Send the notes to someone without an account. Only the notes leave the account: no transcript, no audio, no email address. You can turn the link off at any time.
- [x] **Files:** `apps/api/migrations/004_share_links.ts` (new), `apps/api/src/modules/recordings/*` (share and unshare), `apps/api/src/modules/shared/*` (new public route + tests, registered in `server.ts`), `packages/shared/src/schemas/share.ts` (new), `apps/web/src/pages/SharedNotesPage.tsx` (+ CSS module, new), `apps/web/src/router.tsx`, `apps/web/src/pages/RecordingDetailPage.tsx`, `apps/web/src/components/NotesEditor.tsx`, `docs/DESIGN.md`
- [x] **Migration:** `recordings.share_token` (text, unique, nullable).
- [x] **API:** `POST /api/recordings/:id/share` creates a token (32 random bytes, base64url) if there is none and returns it; `DELETE /api/recordings/:id/share` clears it; both are owner-only (404 otherwise) and only for `ready` recordings. Public `GET /api/shared/:token` (no session) returns just `{ title, mode, language, createdAt, durationMs, notes }`, or 404 when the link is off or unknown. Deleting the recording ends the link too.
- [x] **Detail page:** a secondary "Share" button in the actions row opens an inline panel (like Delete: no modal). Link off: "Create link". Link on: the URL in a read-only field, "Copy link", "Turn off link", and the line "Anyone with the link can read these notes. The transcript and audio stay private."
- [x] **Public page `/s/:token`:** no sidebar and no sign-in. The title, "Mode · date · duration", and the notes cards read-only (`NotesEditor` gets a `readOnly` view: checkboxes shown but disabled). Footer "Made with Voice notes" linking to `/about`. `noindex` meta, so search engines don't list shared notes. Unknown or turned-off links show "This link doesn't work any more."
- [x] **Verify:** API tests: the public response has exactly those keys (no transcript, audio, user or email); turn off → 404; a new link after turning off is a different token; another user can't create or turn off a link; deleting the recording → 404. In the browser: create, copy, open in a signed-out browser → notes shown with no transcript tab, no audio, no edit; turn off → the message; phone width OK; CI green.
- [x] **As built:**
  - **API:** `GET /api/shared/:token` is the only route without a session. It returns exactly `{ title, mode, language, createdAt, durationMs, notes }` from the **latest** notes version (so later edits show up), with `Cache-Control: no-store` (turning a link off works at once) and `X-Robots-Tag: noindex`. Unknown, malformed, turned-off and not-ready links all answer the same 404. The owner sees the token as `shareToken` in the recording's detail response.
  - **Web:** the public page sets `<meta name="robots" content="noindex">` and its `<title>` from the component (React 19 puts them in `<head>`). It reuses `NotesEditor` with a new `readOnly` view. Caddy already sends unknown paths to `index.html`, so `/s/…` needs no server change.
  - **Visual side effect:** with the extra button, the actions row is wider than the 760px column, so "Delete" wraps onto its own line (still right-aligned, apart from the others).
  - **Verified:**
    - API tests, 6: exactly those keys and nothing from the transcript, audio, owner or id; the headers; the same link when shared again; turn off → 404 and a new token; another user can't create or turn off a link; deleting the recording → 404; only ready recordings (409); unknown or malformed → 404; no session → 401 for the owner routes.
    - Headless Chrome with an owner and a separate signed-out browser, 23 checks: Share closes Delete and takes focus; the wording; Create link; "Shared"; Copy link reaches the clipboard (with "Link copied" for screen readers); Escape returns focus. The stranger sees title, meta and notes with read-only checkboxes, and no transcript, audio, sidebar or owner buttons, plus noindex, page title, footer link, phone width. Turn off → "This link doesn't work any more."; a new token works while the old stays dead; edits show up; deleting the recording ends the link; no page errors.
    - Migration rollback and re-apply; CI green (50 API tests).
- [x] **Commit:** `feat: share notes with a read-only link`

### Task 1.31 — Record sound played on this computer; no notes from silence
> Reported on 2026-10-23: a video playing on the computer while recording gave a 14 s file that was almost silent (−60 to −80 dB). The transcript was "Thank you." and the notes said "The speaker expressed gratitude." Cause: the microphone was opened with `echoCancellation` and `noiseSuppression` on. Both are made for calls: echo cancellation removes what the computer itself plays, and noise suppression removes non-speech sound. Whisper then invented "Thank you." for the near-silence (Groq's `no_speech_prob` was 0 even for pure digital silence, so it can't be used to catch this).
- [x] **Files:** `apps/web/src/recorder/use-recorder.ts`, `apps/web/src/pages/RecordPage.tsx`, `apps/web/src/pages/RecordingDetailPage.tsx`, `apps/api/src/ai/stt/silence-phrases.ts` (+ test, new), `apps/api/src/jobs/transcribe.job.ts` (+ pipeline test), `docs/DESIGN.md`
- [x] **Microphone:** both the level preview and the recording open it with `echoCancellation: false, noiseSuppression: false` (`autoGainControl` stays on for quiet voices). A recorder has no far end to protect from echo, so it should hear everything in the room, speakers included.
- [x] **Record page hint** under the microphone: "Recording a video or a call on this computer? Play it through the speakers: headphones keep the sound away from the microphone." (Capturing the computer's sound directly is the desktop app, Phase 3.)
- [x] **Silence phrases:** if every segment of a transcript is only one of the phrases Whisper invents for silence ("Thank you.", "Thanks for watching!", "Дякую.", "Gracias.", …), the transcript is treated as empty. The notes job then marks the recording failed with "No speech detected", so it never gets made-up notes.
- [x] **Detail page:** for "No speech found in the audio" a hint says what to check (the input level; speakers instead of headphones for sound from this computer).
- [x] **Verify:** unit tests for the phrase filter (whole-transcript only; a real sentence that contains "thank you" is kept; English, Ukrainian and Spanish); the reported 14 s file uploaded again → "No speech found" with the hint, no notes; a real speech file still gets notes; in Chrome, the preview and the recording stream both report `echoCancellation: false` and `noiseSuppression: false`; CI green. The real-speaker case needs a check on your computer (play a video while recording).
- [x] **As built:**
  - **Microphone settings:** `MIC_PROCESSING` lives in `use-recorder.ts` and is used by both `getUserMedia` calls (the level preview used to open the microphone with the browser's defaults, which have echo cancellation on).
  - **Measured first:** the reported file was mostly −60 to −80 dB with three short bursts, and Whisper turned it into one 0–14 s segment "Thank you.". 30 s of pure digital silence also came back as "Thank you." with `no_speech_prob = 0`, which is why the filter uses phrases.
  - **The filter:** `onlySilencePhrases` matches only when the **whole** transcript is silence phrases. Case and punctuation are ignored, and a real sentence like "Thank you for coming…" is kept. The transcribe job then saves an empty transcript, so the existing "No speech detected" path takes over.
  - **Verified:**
    - Unit tests (EN/UK/ES, real sentences kept) and a pipeline test ("Thank you." → failed, no segments, no notes).
    - Through the real pipeline: a copy of the reported file → "No speech detected", no transcript, no notes; a real speech file still gets notes.
    - In Chrome: the preview and the recording both ask for and get `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: true`. The detail page shows "No speech found" with the hint. No page errors. CI green.
  - **Not verifiable here:** real speakers into a real microphone. That needs a check on your computer.
- [x] **Commit:** `fix: record sound from the computer's speakers and don't make notes from silence`

### Task 1.32 — Delete stays on the first row
> With Share added (Task 1.30) the actions row needs 742 px but has 680 px, so "Delete" wrapped onto its own line, pushed right ("it jumped").
- [x] **Files:** `apps/web/src/pages/RecordingDetailPage.tsx` (+ CSS module), `docs/DESIGN.md`
- [x] **Layout:** the everyday buttons (Copy as Markdown, Download .md, Edit notes, Share) sit in their own group that wraps on its own. Delete becomes a 44 px icon button (trash icon, `aria-label="Delete"`, tooltip "Delete recording") that always stays at the right end of the first line. Same inline confirmation as before.
- [x] **Verify:** at 1440, 1280, 1100, 1024, 900 and 375 px wide, Delete is on the first line and the right-most; when the group wraps, only its own buttons move; keyboard (Tab, Enter, Escape) and the confirmation work as before; the Task 1.30 and regression suites pass; CI green.
- [x] **As built:**
  - **Sizes:** the icon button is 40 px, not the planned 44, so it matches the 40 px secondary buttons next to it.
  - **Group widths:** the actions row has a wrapping group plus Delete (`flex: none`). The group needs 626 px of the 632 px left beside Delete.
  - **Share's label** (Task 1.30) said "Shared" while a link was on. That was 10 px wider and pushed it onto a second line at 1280 px, so it now always says "Share". A link that is on shows as a filled dot inside the icon, a tooltip, and "(link is on)" for screen readers.
  - **Verified in headless Chrome:**
    - With a link on, at 1440, 1280, 1100, 1024, 900 and 375 px, Delete is on the first line, right-most and 40×40, with no sideways scroll. At 1440 and 1280 all buttons fit on one line; at 1100 and 1024 only Share wraps, inside its group.
    - Suites: Task 1.30 (23, updated for the new label and dot), the regression suite (36, Delete found by its `aria-label`, Escape returns focus to it) and Task 1.29 (19, twice; one earlier run had 2 timing misses while the laptop was at load 30). CI green.
- [x] **Commit:** `fix(web): keep Delete on the first row of the actions`

### Task 1.33 — API tests that don't time out on a busy machine
> Found while re-checking everything (2026-10-23): the integration tests that run ffmpeg and S3 (`prepareAudio`, the pipeline) take 0.5 s alone but over 5 s, Vitest's default limit, when the laptop is busy (load average 30 at the time). So they failed now and then although the audio was right. And after `pnpm build`, Vitest also ran the compiled copies in `apps/api/dist`, so every API test ran twice.
- [x] **Files:** `apps/api/vitest.config.ts` (new)
- [x] **Config:** `testTimeout` and `hookTimeout` 20 s for the API package; `exclude` adds `dist/**` to Vitest's defaults.
- [x] **Verify:** `pnpm turbo lint typecheck test` green 3 times in a row on this machine; after `pnpm build`, the API still runs 12 test files, not 24; CI green on GitHub.
- [x] **As built:** a small `vitest.config.ts` (Vitest's `configDefaults.exclude` plus `dist/**`). Verified with the machine at load average 30: three full runs green (53/53 API tests each); with a fresh `dist/` from `pnpm build` the API ran 12 test files, not 24. Before, the same load made 1 to 3 of the ffmpeg tests hit 5 s. GitHub CI: checked after the push.
- [x] **Commit:** `test(api): longer timeout for integration tests and skip dist`

> **Decided on 2026-10-23 (next batch):** record a browser tab's sound, stronger passwords, an account page, a names-and-terms hint, and editing the transcript with "Regenerate notes" (Tasks 1.34–1.38). The desktop app (Phase 3) comes after them.

### Task 1.34 — Record a browser tab's sound with the microphone
> Fixes the reported case properly (a video, or Meet or Zoom in the browser) without speakers or the desktop app. Chrome and Edge can share a tab's audio; Safari and Firefox can't, so there the option is hidden.
- [x] **Files:** `apps/web/src/recorder/use-recorder.ts`, `apps/web/src/recorder/mix-audio.ts` (new), `apps/web/src/pages/RecordPage.tsx` (+ CSS module), `apps/web/src/components/SegmentedControl.tsx` (+ CSS module: `wide`), `docs/DESIGN.md`
- [x] **Record page:** a "Sound" choice under Microphone with two options: "Microphone" and "Mic + browser tab". Hint for the second: "For a video or a call in another tab. Chrome asks which tab: tick 'Also share tab audio'." Shown only where `getDisplayMedia` exists and the browser is Chromium.
- [x] **Start:** `getDisplayMedia({ video: true, audio: true })` (video is required to pick a tab; its track is stopped at once). No audio track → stop and say "That tab's sound wasn't shared. Start again and tick 'Also share tab audio'." The mic and tab streams are mixed with Web Audio into one `MediaStreamDestination`, which is what `MediaRecorder` records. The level meter shows the mix.
- [x] **During:** a chip "Mic + tab" next to the mode chip. If the tab stops sharing (the browser's "Stop sharing" bar), recording goes on with the microphone, with the status "The tab stopped sharing. Recording the microphone only." Pause, Stop, chunks and retries are unchanged.
- [x] **Verify:** in headless Chrome (a fake tab stream injected for `getDisplayMedia`, speech in it and silence on the mic), the transcript has the tab's speech; with mic speech + tab speech both are in it; no tab audio → the message, nothing created; stopping the tab mid-recording → the status, the recording continues and saves; the option is hidden when `getDisplayMedia` is missing; CI green. Real check on your Mac with a YouTube tab.
- [x] **As built:**
  - **Start order:** `useRecorder.start(deviceId, { tab, beforeStart })` opens the sound first, then calls `beforeStart` (where the page creates the recording), then starts `MediaRecorder`. The browser only shows its tab picker right after a click, and creating the recording on a slow connection could have used that up. A failure in any step closes what was opened. A cancelled picker or a tab without sound gets its own message and leaves nothing behind.
  - **Mixing:** `mix-audio.ts` mixes the microphone and the tab into one `MediaStreamDestination`. When the tab's track ends, its source just goes silent, so the recording, chunks and retries carry on unchanged. The picked tab's video track is stopped at once.
  - **Label:** "Microphone + a browser tab" spilled out of its choice card (the cards don't wrap their text), so the label is "Mic + browser tab". `SegmentedControl` got a `wide` variant (at least 200 px per card) so the two Sound cards stack on a phone.
  - **Verified in headless Chrome** (`getDisplayMedia` and `getUserMedia` replaced by streams playing test speech or silence), 15 checks:
    - The choice and hints; a cancelled picker and a tab without sound → their messages, nothing created.
    - Tab speech with a silent mic → in the transcript; mic speech then tab speech → both in the transcript.
    - "Stop sharing" mid-recording → status, "Mic only" chip, still recording, saved with the tab's earlier speech.
    - "Microphone" never opens the picker; the choice is remembered; hidden without `getDisplayMedia`; no page errors.
  - **Also verified:** every choice card's label fits at 1280 and 375 px; the live-recording suites for Tasks 1.22 (7) and 1.26 (23, after fixing a weak English-detection check in the test) still pass; CI green.
  - **Not verifiable here:** a real tab's sound in Chrome on your Mac.
- [x] **Commit:** `feat(web): record a browser tab's sound together with the microphone`

### Task 1.35 — Stronger password rules
> Today: at least 8 characters, nothing else. New rules, following current NIST advice (SP 800-63B: length and breach checks, no forced symbols or rotation).
- [x] **Files:** `apps/api/src/auth.ts`, `apps/api/src/config.ts`, `apps/api/package.json` (test script), `apps/api/src/auth.test.ts` + `auth-breach.test.ts` (new), `apps/api/Dockerfile` (`NODE_ENV`), `apps/web/src/lib/password-errors.ts` (new), `apps/web/src/pages/SignUpPage.tsx`, `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/components/PasswordField.tsx`, `.env.example`, `README.md`
- [x] **Length:** at least **12** characters, at most 128 (`minPasswordLength` / `maxPasswordLength`).
- [x] **Breached passwords:** Better Auth's `haveIBeenPwned` plugin (part of better-auth, no new dependency) refuses passwords found in known data breaches, on sign-up and password change. It only sends the first 5 characters of the password's SHA-1 hash to api.pwnedpasswords.com (k-anonymity), never the password. Setting `PASSWORD_BREACH_CHECK` (default `true`); the API tests switch it off so they don't need the internet.
- [x] **Not your name or email:** a password containing your email's name part or your name (4+ letters, any case) is refused (a Better Auth `before` hook on sign-up and change-password).
- [x] **Sign-in attempts:** Better Auth's rate limit, which is on in production by default, stays on. Its sign-in rule (a few attempts per 10 s per IP) is documented in the README.
- [x] **Web:** the hint "At least 12 characters" with the tick; messages: too short → "The password needs at least 12 characters."; breached → "This password appeared in a data breach. Choose a different one."; contains name/email → "Don't use your name or email in the password." Existing accounts keep their password (the rules apply when a password is set).
- [x] **Verify:** API tests: 11 characters → refused, 12 → accepted, containing the email name → refused, a breached password refused with the check on (fetch mocked); browser: the three messages and a strong password signs up; old accounts still sign in; CI green.
- [x] **As built:**
  - **Found and fixed: no rate limit in production.** Better Auth turns its rate limit on only when `NODE_ENV=production`, and the API image never set it, so a deployed server had no sign-in limit. The Dockerfile now sets `ENV NODE_ENV=production` after the build step. Checked by starting the API in production mode: wrong sign-ins 1–3 → 401, the 4th and 5th → 429. The dev server stays unlimited. Both pages say "Too many tries. Wait 10 seconds, then try again." on a 429.
  - **Breach check:** the `haveIBeenPwned` plugin fails closed: if api.pwnedpasswords.com can't be reached, setting a password is refused with "The password couldn't be checked right now…". `password1234`, used by the old test accounts, is in the breach list 443,397 times. The browser suites now use a password that isn't.
  - **Personal info:** checked in a Better Auth `before` hook on `/sign-up/email` and `/change-password`, using the session's user for the change.
  - **Messages:** live in `lib/password-errors.ts`, so the account page (Task 1.36) uses the same wording.
  - **Verified:**
    - API tests, 7: 11 characters → `PASSWORD_TOO_SHORT`, 12 accepted, 129 → `PASSWORD_TOO_LONG`; the email's name part or a name word → `PASSWORD_CONTAINS_PERSONAL_INFO`, also on change-password; with the check on and the range API faked, a breached password is refused, only the 5-character hash prefix is sent, an unlisted one is accepted, and an unreachable service → 500.
    - Browser, 7 checks against the real breach service: the hint ticks at 12; the breached and name messages; a strong password creates the account; an account made before the new rules still signs in.
    - The regression (36) and languages (23) suites; CI green (60 API tests).
- [x] **Commit:** `feat(auth): stronger password rules`

### Task 1.36 — Account page
> Change your name and password, take your data with you, delete your account (GDPR basics, Phase 7).
- [x] **Files:** `apps/web/src/pages/AccountPage.tsx` (+ CSS module, new), `apps/web/src/router.tsx`, `apps/web/src/components/Sidebar.tsx` (+ CSS module), `apps/web/src/components/PasswordField.tsx` (`name`, `label`), `apps/api/src/modules/account/*` (new: export, delete, tests), `apps/api/src/server.ts`, `docs/DESIGN.md`
- [x] **Page `/account`** (the sidebar's account card opens it):
  - **Name:** edit and save (`updateUser`).
  - **Password:** current + new + repeat (`changePassword` with `revokeOtherSessions: true`, the Task 1.35 rules).
  - **Your data:** "Download my data" gives one JSON file with your recordings, transcripts, notes (latest version), action items and the account's email and created date. The audio is listed by recording; each can be downloaded from its page.
  - **Delete account:** an inline confirmation where you type your email. Then all recordings are deleted (storage first, like Task 1.17), then the user, sessions and accounts; you land on the landing page.
- [x] **API:** `GET /api/account/export` (JSON, `Content-Disposition: attachment`), `DELETE /api/account` (needs `{ email }` matching the session's), both `requireUser`.
- [x] **Verify:** API tests: the export has only your data; delete removes recordings, storage objects, user, sessions; a wrong email → 400; another user unaffected. Browser: rename shows in the sidebar; changing the password signs other sessions out and the new one works; the download is valid JSON; deleting goes to the landing page, and signing in again fails; phone width; CI green.
- [x] **As built:**
  - **Deleting** reuses `RecordingsService.delete` for each recording (storage first, then the row and its cascade), then removes Better Auth's `session`, `account` and `verification` rows and the `user` in one transaction. The typed email is compared trimmed and case-insensitively.
  - **The export** is built from the database (latest notes version per recording, the transcript, `hasAudio`) and downloaded as a Blob.
  - **Name and password** use Better Auth's own client calls (`updateUser`, `changePassword` with `revokeOtherSessions`). The name field shows the session's name until you type, so no state is set inside an effect.
  - **Name rule:** words under 4 letters are ignored (Task 1.35), so "Zoe" may appear in a password but "Lane" may not.
  - **Verified:**
    - API tests, 4: the export has your account, recordings in order, transcript and latest notes and nothing of another user; another email → 400 and nothing deleted; delete removes recordings, action items, stored audio, user, sessions and sign-in rows; the old cookie → 401 and signing in again fails; the other user keeps everything; no session → 401.
    - Headless Chrome, 17 checks: the sidebar opens it; rename → "Saved." and the initials follow; password: mismatch, wrong current and name-in-password messages, then a change signs out a second session but keeps this one, and only the new password works; the download is a valid JSON file with the account and recording; delete: focus, disabled until the email matches, Escape, then the landing page and no account left; phone width; no page errors.
    - CI green.
- [x] **Commit:** `feat: account page with export and delete`

### Task 1.37 — Names and terms hint
> The speech-to-text accepts a short hint text, so names ("Olena", "Riverside School") and terms get spelled right.
- [x] **Files:** `apps/api/migrations/005_vocabulary.ts` (new), `packages/shared/src/schemas/recording.ts`, `apps/api/src/ai/stt/*` (pass `prompt`), `apps/api/src/ai/notes/prompts.ts`, `apps/api/src/ai/notes/*` (adapters get the finished system prompt), `apps/api/src/ai/stt/silence-phrases.ts`, `apps/api/src/jobs/*` (+ tests), `apps/api/src/modules/recordings/recordings.repository.ts`, `apps/web/src/pages/RecordPage.tsx`, `docs/DESIGN.md`
- [x] **Record page:** an optional "Names and terms" field ("Olena, Andrii, Riverside School, PTA"), up to 300 characters, remembered in this browser. Saved on the recording (`recordings.vocabulary`).
- [x] **Pipeline:** Whisper gets it as `prompt` (OpenAI-compatible; Groq and OpenAI both accept it). The notes prompt adds "Spell these names and terms like this: …".
- [x] **Verify:** a recording with an unusual name, transcribed with and without the hint, gets the spelling right with it; the field is optional and remembered; CI green.
- [x] **As built:**
  - **Measured before building:** the same 16 s of speech with five Ukrainian names (macOS voice) on Groq's Whisper got 0 of 4 checked names right without the hint ("Yarema Kachuk", "Ksen Yavavchuk", "Ostaphnadishan", "Mirichka Dshas") and 4 of 4 with it.
  - **Notes adapters:** they now receive the finished system prompt (`callModel(system, content)`) instead of mode + language, so adding the vocabulary line didn't need another parameter in every adapter.
  - **Prompt echo:** Whisper can echo its prompt when it hears silence, so a transcript that only repeats the hint now counts as silence too (the Task 1.31 filter, `onlySilencePhrases(segments, prompt)`).
  - **Saving:** the field is trimmed by the schema and stored as `null` when empty.
  - **Verified:**
    - Unit tests (the prompt line; echoed hint → silence; a real sentence with the names kept) and a pipeline test (the hint, trimmed, reaches speech-to-text as `prompt` and the notes generator; 301 characters → 400).
    - Headless Chrome, 8 checks, recording through the Record page with the speech as microphone: field position, label, limit and hint; without the hint 0/4 names right, with it 4/4; the notes spell them right too (and even fixed the transcript's "Marechka" to "Marichka"); saved on the recording (null without); remembered; an uploaded file gets it too; no page errors.
    - Migration rollback and re-apply; CI green.
- [x] **Commit:** `feat: names and terms hint for better transcripts`

### Task 1.38 — Edit the transcript and regenerate the notes
- [x] **Files:** `packages/shared/src/schemas/transcript.ts` + `recording.ts` (`TranscriptLine`, `SegmentEdit`, `RegenerateInput`), `apps/api/src/modules/recordings/*` (edit a segment, regenerate, tests), `apps/api/src/jobs/transcribe.job.test.ts`, `apps/web/src/components/Transcript.tsx` (+ CSS module), `apps/web/src/pages/RecordingDetailPage.tsx` (+ CSS module), `docs/DESIGN.md`
- [x] **Edit a line:** on the Transcript tab, each line gets an "Edit" (pencil) that turns it into a text field with Save and Cancel; `PATCH /api/recordings/:id/segments/:segmentId { text }`. Search picks it up at once (the generated `tsv` column).
- [x] **Regenerate notes:** a secondary "Regenerate notes" with an inline confirmation: pick the mode (meeting, lesson or memo) and read "Your edits to the notes are replaced. The current version stays in the history." `POST /api/recordings/:id/regenerate { mode }` sets `summarizing` and queues the notes job (a new AI version).
- [x] **Verify:** API tests (owner only, 404 for others, empty text refused, regenerate queues the job and changes the mode); browser: edit a misheard word → saved, found by search; regenerate as lesson → concepts and review questions appear; CI green.
- [x] **As built:**
  - **Line ids:** the detail response's lines now carry their `id` (`TranscriptLine`). An edit is only accepted for a line of that recording (404 otherwise), and the generated `tsv` column makes it searchable at once.
  - **Regenerate:** clears the old finished `notes-<id>` job first (BullMQ ignores `add()` with a used id, as in retry), sets the mode and `summarizing`, and queues the job. It's refused while the recording is processing or has no transcript (409). The page then shows the processing steps and polls, as for a new recording.
  - **Placement:** "Regenerate notes" sits under the notes instead of in the actions row, which is full (Task 1.32). After an edit, the Transcript tab offers it in a sentence.
  - **Pencils:** shown on hover and focus on desktop, always under `(hover: none)`.
  - **Verified:**
    - API tests, 4: ids, a trimmed edit found by search; empty, too long, another user's recording, a line of another recording and a bad id refused; regenerate sets the mode and status and replaces the job; 409 while processing or without a transcript; bad mode 400, others 404, signed out 401.
    - Headless Chrome on a real recording, 13 checks: a labelled pencil on every line; edit opens with the text focused; Escape cancels; clicking in the editor doesn't move the audio; Save shows the fix and the regenerate sentence; saved and searchable; the panel takes focus with the current mode, Escape closes it; regenerating as a lesson shows "Writing notes", then the notes are a lesson (2 concepts, 5 review questions) written from the edited transcript ("sports hall") as a new AI version; phone (touch): pencils visible, no sideways scroll; no page errors.
    - CI green.
- [x] **Commit:** `feat: edit transcript lines and regenerate notes`

### Task 1.39 — Dropdowns with a proper chevron
> Reported on 2026-10-23: the browser's own arrow sat squeezed against the right edge of the Language select and didn't match the rest of the form.
- [x] **Files:** `apps/web/src/components/Select.tsx` (+ CSS module, new), `apps/web/src/pages/RecordPage.tsx`, `apps/web/src/pages/ActionItemsPage.tsx`, `docs/DESIGN.md`
- [x] **Select:** a native `<select>` (keyboard and screen readers as before) with the browser arrow turned off (`appearance: none`) and our own chevron drawn in CSS with `--color-ink-muted`, 18px from the right edge; 44px of room on the right so long names (the microphone) end with an ellipsis before the chevron. Used for Language, Microphone and the Owner filter.
- [x] **Verify:** in Chrome at 1280 and 375 px: each select's chevron is inside the field, 18px from the right, vertically centred, and the text never runs under it; choosing still works with the keyboard and the mouse; the Record page and Action items suites still pass; CI green.
- [x] **As built:**
  - **The chevron** is a CSS `::after` on a wrapper span (a data-URI icon can't use the colour token). `.wrap .select` outranks each page's own padding.
  - **Verified in headless Chrome** at 1280 and 375 px: Language, Microphone and Owner all have the browser arrow off and our chevron 18 px from the right, centred and in `rgb(110, 101, 90)` (ink-muted), with 44 px of padding. A long microphone name ends with "…" before the chevron. Choosing still works; the select takes keyboard focus; no sideways scroll.
  - **Also fixed, found while re-running the Action items suite:** its filters rebuilt the address from the parameters of the last render. A quick second change (Owner, then a pill) started from the old address and silently brought the previous owner back; that was the test's intermittent "Nothing open" failure, which I had wrongly put down to machine load in Tasks 1.32 and 1.33. React Router's functional `setSearchParams` has the same problem (it also reads the last render's params), so the page keeps the latest address in a ref.
  - **Action items suite** (now with a "two quick changes both stick" check): 20/20 three runs in a row. The Record page suite: 15/15. CI green.
- [x] **Commit:** `fix(web): dropdowns with a proper chevron`

### ✅ Phase 1 acceptance test (do it manually, then write it down as a checklist in the README)
- [x] Record **5 minutes of English** speech in Chrome → transcript and notes appear without any manual step.
- [x] Lesson mode produces concepts + review questions; memo mode produces ideas.
- [x] Proposals are specific to the content, not generic advice.
- [x] Network drop during recording does not lose audio.
- [x] A recording **> 60 minutes** completes (map → reduce path is used).
- [x] Another user cannot open your recording by guessing the URL.
- [x] `pnpm turbo lint typecheck test` is green.
- [x] Everything above works with `STT_PROVIDER=groq` and `NOTES_PROVIDER=groq` — **total cost $0**.
- [ ] The app is online at `https://<your-name>.duckdns.org` (Task 1.16) and recording works from your phone's browser.
- **As built (2026-10-07, local, free stack):** checks 1–8 pass; the checklist with results is in the README. Speech came from macOS voices: played into Chrome as the microphone for the 5:22 meeting with two network drops, uploaded in 10 s chunks for the lesson, the memo and a 61.6-minute 40-item meeting. Check 9 waits for Task 1.16. Findings, not fixed here:
  - After a drop longer than about 30 s, one chunk gives up after its 5 tries, so Stop shows "Some audio could not be uploaded" and the user must click **Try again**. No audio is lost, but the Record page promises "Audio uploads when you are back online", and "Saved up to" counts uploaded chunks, so it doesn't show the gap.
  - Due dates get an invented year: "by May second" is saved as `2024-05-02`. The prompt doesn't say to keep the date as said, and the model doesn't know today's date.
  - Another user's recording URL shows a blank page for about 7 s before "This recording does not exist", because the query retries the 404 three times.
  - The API tests share Redis queues with the dev worker and fail while it runs (an old worker had been left running for 15 h).
  - Minor: one merged proposal called a resolved item "unresolved"; in memo mode one idea (the repair café) went into key points instead of ideas.

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

### Phase 2 — Quality, search and more language options (≈2–3 weeks)
- **More language options** (recording in Ukrainian and Spanish is done, Task 1.26): `auto` (detect the spoken language), notes in another language than the recording (a per-user setting, e.g. a `user_settings` table, and a separate notes language in prompts and `NotesGenerator`), and a translated interface if needed. Compare STT providers on Ukrainian and Spanish samples (Task 1b.3).
- Speaker labels (diarization): switch/add an STT adapter that returns speakers (candidate: OpenAI `gpt-4o-transcribe-diarize`); UI to rename "Speaker 1" → a real name (stored per recording).
- Embeddings for transcript segments (fill the `embedding` column), HNSW index on pgvector.
- Semantic search (by meaning) added to the full-text search from Task 1.28, using the embeddings above.
- "Ask your recordings" chat: retrieve top segments → answer with links to `[recording, timestamp]`.
- "Assign" for action items without an owner, on the Action items page from Task 1.29.

> **Decided on 2026-10-24:** "Ask your recordings" first (Tasks 2.1–2.3), with a **free local embeddings model** (no OpenAI account; nothing leaves the server), then the desktop app (Phase 3, Tasks 3.0–3.4). Going online (Task 1.16) waits. New dependencies approved: `@huggingface/transformers` (2.1); `electron` and `electron-builder` (3.1).

#### Task 2.1 — Embeddings for every transcript line (local, free)
> An embedding is a list of numbers that captures what a sentence means, so "book the gym" and "reserve the sports hall" end up close together, even across English, Ukrainian and Spanish.
- [x] **Files:** `apps/api/package.json` (+ `@huggingface/transformers`), `apps/api/src/ai/embeddings/` (new: `embedder.ts` interface, `local-e5.ts`, `fake-embedder.ts`), `apps/api/src/ai/providers.ts`, `apps/api/src/config.ts`, `apps/api/migrations/006_embeddings.ts`, `apps/api/src/queue/queues.ts`, `apps/api/src/jobs/embed.job.ts` (new) + `transcribe.job.ts`, `apps/api/src/worker.ts`, `apps/api/src/modules/recordings/*` (a line edit re-embeds), `apps/api/scripts/embed-backfill.ts` (new), `docker-compose.prod.yml` (model cache volume), `.env.example`, `.gitignore`, `pnpm-workspace.yaml` (two install scripts left off)
- [x] **Model:** `Xenova/multilingual-e5-small` (ONNX, about 120 MB, downloaded once into `MODEL_CACHE_DIR`), 384 numbers per line, 100+ languages. e5 needs the prefixes `passage: ` for lines and `query: ` for questions. `EMBEDDINGS_PROVIDER=local|fake` (tests and CI use the fake: no download).
- [x] **Migration:** `transcript_segments.embedding` from `vector(1536)` (planned for OpenAI, never filled) to `vector(384)`, plus an HNSW index with cosine distance.
- [x] **Pipeline:** after the transcript is saved, the transcribe job queues `embed:<id>`. The embed job fills every line of the recording in batches of 32 (idempotent: it only fills empty ones). A transcript line edit (Task 1.38) clears that line's embedding and queues the job again. Notes don't wait for it.
- [x] **Backfill:** `pnpm --filter @vn/api tsx scripts/embed-backfill.ts` queues every recording that has lines without embeddings.
- [x] **Verify:** unit tests with the fake embedder (the job fills all lines, runs twice without changes, an edited line is re-embedded); with the real model: "book the gym" is closer to "reserve the sports hall" than to "order pizza", and the Ukrainian and Spanish versions of a sentence are close to the English one; a new recording gets embeddings for every line; the backfill fills the existing ones; CI green.
- [x] **As built:**
  - **Install scripts:** pnpm blocked two of them; both stay off in `pnpm-workspace.yaml`. onnxruntime-node's only downloads GPU (CUDA) add-ons, and the CPU runtime is bundled. protobufjs's is only a version check.
  - **Where the embedder lives:** `ai/embeddings/index.ts`, not `providers.ts`, which checks API keys and is loaded only by the worker. Search (Task 2.2) needs the embedder in the API server too.
  - **Loading:** the model loads lazily: 4.5 s the first time, then about 5 ms per line.
  - **Job ids:** embed jobs get a fresh id each time (`embed-<id>-<time>`). The job only fills empty lines, so duplicates are harmless; a reused id would be ignored while BullMQ keeps the finished job.
  - **Line edits:** an edit sets the line's embedding to `NULL` and queues the job.
  - **Verified:**
    - Tests with the fake embedder: all lines filled with 384 numbers and a second run does nothing; an edited line is cleared, queued and refilled; the nearest line by `<=>` is the right one; no lines → nothing; the transcribe job queues the embed job.
    - Real model: passages "book the gym" ~ "reserve the sports hall" 0.81 vs "order pizza" 0.77; the Spanish and Ukrainian versions 0.89 and 0.80. Questions rank the right lines first ("who orders food" → pizza, "бронювання залу" → the Ukrainian gym line).
    - A new recording through the worker got vectors for all 5 lines; the backfill filled 2,059 lines in 107 recordings in 20 s; migration rollback and re-apply; the prod compose file validates; CI green.
  - **Risk for Task 2.2:** for an English question against English lines, e5-small separates weakly ("reserve the sports hall" → the gym line 0.719 vs the pizza line 0.717). 2.2 must tune a threshold carefully, or switch to `multilingual-e5-base` (~280 MB, better separation).
- [x] **Commit:** `feat(api): local embeddings for transcript lines`

#### Task 2.2 — Search by meaning
- [x] **Files:** `apps/api/src/modules/search/*` (+ `search-meaning.test.ts`), `apps/api/src/config.ts` (`SEMANTIC_MIN_SCORE`), `apps/api/src/server.ts` (embedder, warm-up), `packages/shared/src/schemas/search.ts`, `apps/web/src/pages/RecordingsPage.tsx` (+ CSS module), `docs/DESIGN.md`
- [x] **API:** `GET /api/search` also embeds the query (`query: …`) and takes your closest lines by cosine distance (below a tuned threshold). It merges them with the full-text matches (reciprocal rank fusion), so exact words still come first. A line found only by meaning is a match of kind `"meaning"` (no word marks, its timestamp link as before).
- [x] **Web:** meaning matches show a small "Similar meaning" label instead of highlighted words.
- [x] **Verify:** a query with no shared words ("reserve the sports hall") finds the line "I will book the gym"; a Ukrainian query finds the matching Ukrainian line; exact-word results are unchanged (the Task 1.28 suite passes); another user's lines never appear; a query unrelated to anything returns nothing; CI green.
- [x] **As built:**
  - **Model and threshold, measured on the test recordings:** 15 paraphrased questions (including Ukrainian and Spanish) and 7 unrelated ones over all 2,064 lines.
    - e5-small and e5-base both found the right line in the top 3 for 12 of 12 paraphrases (MRR 0.88 vs 0.96). Base was 4× slower and its scores separate *worse*, so the small model stays.
    - A relative measure (how far the top line stands out, z-score) didn't separate either.
    - A plain cut-off of **0.84** rejects all 7 unrelated questions (the best scored 0.834) and keeps 12 of 15 real ones; the 3 misses are two cross-language questions and one loose paraphrase. It's `SEMANTIC_MIN_SCORE`, tied to the model.
    - Lines under 3 words ("…", "Okay.") matched everything a little, so they're left out.
  - **Index:** pgvector 0.8's iterative HNSW scan (`hnsw.iterative_scan = relaxed_order`) keeps reading the index until enough of *your* lines are found, instead of filtering a fixed candidate list.
  - **Ordering:** simpler than the planned reciprocal rank fusion. Recordings with word matches first (newest first, unchanged), then recordings found only by meaning (best first). Within a recording, meaning lines come after word matches and never repeat a line found by its words.
  - **Robustness:** if the model fails, word search still answers. The API server loads the model right after starting, so the first search isn't slow; a query then takes 25–80 ms.
  - **Verified:**
    - API tests with a concept stand-in embedder: a line with no shared words found as `meaning` at its moment; word matches first and not repeated; lines under 3 words skipped; another user's lines never; an unrelated question → nothing.
    - Live: "pupils wait too long to get their midday meal" → the lunch-queue lines; "the school van failed its safety check" → the minibus line; "quantum chromodynamics…" and "recipe for borscht…" → nothing.
    - Headless Chrome, 8 checks: labelled meaning matches without highlights; the timestamp opens the recording at that moment; nonsense → "No recordings match"; exact words still highlighted; a Ukrainian paraphrase ("скільки коштує поїздка для кожної дитини") finds the line about 900 hryvnias per child; no page errors.
    - The Task 1.28 search suite 18/18; CI green.
- [x] **Commit:** `feat: search by meaning`

#### Task 2.3 — Ask your recordings
- [x] **Files:** `apps/api/src/ai/answers/` (new: `answerer.ts` interface, Groq and Claude adapters, fake), `apps/api/src/modules/ask/*` (new), `packages/shared/src/schemas/ask.ts` (new), `apps/web/src/pages/AskPage.tsx` (+ CSS module, new), `apps/web/src/router.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/pages/RecordingDetailPage.tsx`, `docs/DESIGN.md`
- [x] **API:** `POST /api/ask { question, recordingId? }` (up to 500 characters, only your own recordings). It retrieves the best ~12 lines (meaning + words, as in 2.2), each with the line before and after for context. The answer model (the same provider choice as the notes: Groq free, Claude paid) is told to answer **only** from these excerpts, in the language of the question, citing them as [1], [2]…, and to say so when they don't contain the answer. Response: `{ answer, sources: [{ n, recordingId, title, startMs, text }] }`.
- [x] **Page `/ask`** ("Ask" in the sidebar): a question box, the answer, and numbered sources that link to the moment (`/recordings/:id?t=`). The free-plan privacy note as on the Record page. On a recording's page, "Ask about this recording" opens `/ask?recording=<id>`, limited to it.
- [x] **Verify:** questions about the test recordings get the right answer with sources at the right moments; a question they don't answer says "I couldn't find that in your recordings"; a Ukrainian question gets a Ukrainian answer; another user's recordings are never used; the recording-only mode stays inside that recording; API tests with a fake answerer; phone width; CI green.
- [x] **As built:**
  - **Where the answerer lives:** `ai/answers/index.ts`, picked by `NOTES_PROVIDER` like the notes, and not `providers.ts`: Ask runs in the API server, which starts without AI keys. Without one, Ask answers 503 "Ask isn't set up on this server yet."
  - **Finding the lines:** 12 lines, taken in turns from two lists, with repeated phrases dropped (the test account has the planning day twice, which halved the useful lines).
    - **By meaning:** the closest 24 lines above 0.75. That cut-off is far below search's 0.84 on purpose: a Ukrainian question scores only 0.77 on the right English line, and the model says when nothing answers.
    - **By rare words:** words found in at most 5% of your lines, weighted ln(lines ÷ lines with the word). That catches names and things like "minibus" without a stop-word list in any language. A 1 ÷ count weight was tried first, and it let "when" outrank "minibus".
  - **Context:** two lines before and after each hit, not one. The answer is often two short lines away ("…repair the minibus" → "it would cost £1,100"). Neighbouring hits merge into one excerpt, and the source links to its first line.
  - **The model:** Groq `gpt-oss-120b` gives a structured `{ found, answer }`, and Claude uses a forced tool. Reasoning effort is **medium**, not low as for the notes: at low it took a piano repair's price for the minibus and dropped citations; at medium it says "not found" instead. A question takes 1–3 s, or up to 15 s when several in a row hit the free tier's tokens-per-minute (the SDK waits and retries). 429 → "Too many questions at once…", other failures → 502.
  - **Citations:** renumbered in the order the answer uses them, and only cited excerpts become sources. "[1, 3]" becomes "[1][2]", and unknown numbers are dropped. The response also carries `found` and each source's `language` (for `lang`). Not found is the fixed English line, since the interface is English.
  - **Web:** the question is in the URL (`?q=`) and the answer stays in the query cache for 30 min, so Back from a source shows it again without asking twice.
  - **Limits:**
    - Answers vary a little between runs. "Who will book the minibus repair?" sometimes names Dan and sometimes says the excerpts don't say; the transcript splits "Dan." from "Please book…".
    - A Spanish question about English lines can miss the line (weak cross-language match, as in 2.2), and then the answer is "not found". It isn't a wrong answer.
    - In 8 browser runs, the Ukrainian-question check failed once; that answer wasn't captured, and 5 more runs over the API were right.
    - There is no per-user rate limit on Ask (Groq's own limit applies).
  - **Verified:**
    - API tests with a fake answerer (7): two lines of context and only cited sources, renumbered; another user's lines never read, and their recording id → 404; recording-only stays inside it; not found, and no model call when nothing is close; 400/404/401; 429 and 502 messages; `cite()`.
    - Headless Chrome, 18 checks: the sidebar link; fume cupboard → the right facts with citations that jump to their sources, and a source opens the recording at that second; Back keeps the answer without a new request; "capital of Australia" → not found; a Ukrainian question → a Ukrainian answer with sources; "Ask about this recording" stays inside it (Dan, April 23rd); phone width; another account gets nothing; a Ukrainian recording → "900 гривень … Олена"; no page errors.
    - CI green (85 API tests).
- [x] **Commit:** `feat: ask your recordings`

### Phase 3 — Desktop app, Electron (≈2 weeks) — after Task 2.3
- Electron shell loading the web UI; same API and auth.
- Tray icon, global hotkey to start/stop, "always on top" mini recorder.
- **System audio capture** for Zoom/Meet/Teams calls, mixed with the mic via Web Audio API. Do a 1–2 day spike first on your OS — Windows and macOS work differently, and this is the riskiest part of the whole project.
- Auto-update and code signing (needed later for distribution).

#### Task 3.0 — Test: recording the computer's sound on macOS (1–2 days)
> The riskiest part of the desktop app, so it comes first as a throwaway test, not product code.
- [x] **Try:** a minimal Electron app that uses `session.setDisplayMediaRequestHandler` with `audio: "loopback"` (ScreenCaptureKit on macOS 13+) plus the microphone, mixed with Web Audio, recorded for 1 minute while a Zoom/Meet call or a YouTube video plays. Note the permissions macOS asks for (Screen Recording), the quality, echo, and the macOS and Electron versions needed.
- [x] **Fallbacks if it fails:** a virtual audio device (BlackHole) or a small native helper. Write down which way works.
- [x] **Verify:** on your Mac, a 1-minute recording has both your voice and the call's sound, transcribed by the normal pipeline; the decision (and its limits) is written here.
- [x] **Result (2026-10-24): the built-in way works. No BlackHole, no native helper.**
  - **Setup:** macOS 26.6.2 (Apple Silicon MacBook Air), Electron 45.0.0 (Chromium 156).
  - **How:** `setDisplayMediaRequestHandler` answers with the first screen from `desktopCapturer.getSources({ types: ["screen"] })` and `audio: "loopback"`. The page calls `getDisplayMedia({ video: true, audio: {…} })`, stops the video track at once, and mixes the "System audio" track with the microphone in Web Audio (as `mixAudio` does).
  - **Permission:** it needs **Screen & System Audio Recording**, even for sound only.
    - Electron refuses a sound-only reply ("Video was requested, but no video stream was provided"). The Core Audio tap feature (`MacCatapLoopbackAudioForScreenShare`) doesn't change that, and `getSources` fails without the permission.
    - macOS showed no prompt and didn't list the app: it was added by hand with "+" in System Settings. After that, it worked even though the list still didn't show it.
    - So Task 3.2 needs a guide that opens that settings page (`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`) and checks `systemPreferences.getMediaAccessStatus("screen")`.
  - **Signing:** the test app is ad-hoc signed, and macOS ties the permission to that exact build. An unsigned app (Task 3.4) will probably need the permission again after each new build; a signed app keeps it.
  - **Settings:** the loopback track comes with echo cancellation, noise suppression and auto gain on. Ask for them off (as for the mic, Task 1.31); it is then 48 kHz stereo.
  - **What it records:** everything the Mac plays (every app, notifications too), not one app or tab.
  - **Verified:**
    - **AirPods:** a 20 s run. The computer-sound track had the test "call" voice and a video playing on the Mac; the mic had the speech in the room and none of the video. The mix came out ready through the normal pipeline with both.
    - **MacBook speakers, 1 minute:** the test call voice played twice, and the mix's transcript has both word for word. The mic heard the speakers only faintly (peak 0.03 vs 0.22), and nothing appears twice: no echo problem.
    - Not tried: a real Zoom/Meet call (a video and synthetic speech stood in), and a longer recording than 1 minute.
- [x] **Commit:** `docs(plan): desktop sound capture test result`

#### Task 3.1 — Desktop app shell
- [x] **Files:** `apps/desktop/` (new: `package.json` with `electron` + `electron-builder`, `main.ts`, `preload.ts`), `pnpm-workspace.yaml`, `turbo.json`, `apps/api/src/config.ts` (allow the desktop origin), README
- [x] **App:** a window that loads the web app (dev: `http://localhost:5173`; later the server address from settings), the same sign-in (cookies kept by Electron), links to other sites open in the normal browser, window size and position remembered, a standard macOS menu. The preload exposes `window.voiceNotesDesktop = { version }`, so the web app knows it runs inside the app; recordings made there get `source: "desktop"`.
- [x] **Verify:** `pnpm --filter desktop dev` opens the app; sign in, record and play back work as in the browser; external links open in Safari or Chrome; the window comes back where it was; CI green.
- [x] **As built:**
  - **Versions:** Electron 45.0.0 and electron-builder 26.18. `main.ts` and `preload.ts` compile to CommonJS: a sandboxed preload can't be an ES module.
  - **Security:** the page is sandboxed with context isolation, and gets only `window.voiceNotesDesktop = { version }`, no Node. Permissions are the microphone and clipboard write, for our own address only.
  - **Behaviour:**
    - **Links:** `setWindowOpenHandler` and `will-navigate` keep our own links in the window. Every other http(s)/mailto link goes to `shell.openExternal`; file: and custom schemes are dropped.
    - **Window:** one copy of the app at a time. Closing the window keeps the app in the Dock (macOS). Size and position are saved in `userData/window-state.json` and ignored if they would land off every screen. `app.setName("Voice notes")` gives the menu's name and the settings folder.
  - **Outside the listed files:**
    - `apps/web/src/lib/desktop.ts` and RecordPage, for `source: "desktop"`.
    - The root `pnpm dev` skips the desktop app (`--filter=!desktop`).
    - CI installs with `ELECTRON_SKIP_BINARY_DOWNLOAD`.
    - `pnpm-workspace.yaml` allows Electron's download script, and leaves electron-winstaller's (Windows-only) off.
  - **Not needed:** `config.ts` (allow the desktop origin). The app loads the web app's own address, so the API sees the same origin as in a browser. It comes back when the app loads a server from its settings, if that ever differs from `WEB_ORIGIN`.
  - **Not yet:** the "Mic + browser tab" choice still shows in the app, and it can't work there: Electron has no tab picker. Task 3.2 replaces it with the computer's sound.
  - **Verified:** the app driven over its DevTools port (14 checks):
    - it opens the web app at 1200×820, exposes the version, and has no `require` or `process`;
    - sign in, a 14 s recording (a WAV in place of the microphone) processed with `source = desktop`, and playback;
    - external links handed to the browser while the window stays put, and our own `target=_blank` link stays inside;
    - moved to 180,90 at 1000×700, quit and reopened: the same place, still signed in; a saved position off every screen is ignored;
    - no page errors.
  - **Also checked:** `pnpm --filter desktop dev` opens it; the menu is Voice notes / File / Edit / View / Window; CI green (11 tasks).
  - **Not tested:** the real microphone in this build (it asks for permission once, as in Task 3.0).
- [x] **Commit:** `feat(desktop): Electron app shell`

#### Task 3.2 — Record the computer's sound in the app
- [ ] **Files:** `apps/desktop/main.ts`, `apps/web/src/recorder/*`, `apps/web/src/pages/RecordPage.tsx`, `docs/DESIGN.md`
- [ ] **Sound choice in the app:** "Microphone + computer sound" (the way found in 3.0), mixed with the existing `mixAudio`; the browser tab option stays for the web. The first time, a short guide for the macOS Screen Recording permission.
- [ ] **Verify:** in the app on your Mac, a Zoom/Meet call or a video plus your voice both end up in the transcript; refusing the permission gives a clear message and falls back to the microphone; CI green.
- [ ] **Commit:** `feat(desktop): record the computer's sound`

#### Task 3.3 — Tray, hotkey and mini recorder
- [ ] **Files:** `apps/desktop/*`, `apps/web/src/pages/MiniRecorderPage.tsx` (new), `apps/web/src/router.tsx`
- [ ] **Tray icon** (idle / recording), **global hotkey** (⌥⌘R) to start and stop, and a small always-on-top **mini recorder** window (timer, level, pause, stop) while recording; closing the main window keeps recording.
- [ ] **Verify:** start from the hotkey with the app in the background, see the mini window, stop from the tray, and the recording is saved and processed; CI green.
- [ ] **Commit:** `feat(desktop): tray, hotkey and mini recorder`

#### Task 3.4 — A .dmg for your Mac
- [ ] **Files:** `apps/desktop/electron-builder.yml`, README
- [ ] **Build:** an unsigned `.dmg` (Apple Silicon) with the app icon from Task 1.18's design. Signing, notarization and auto-update come later: they need an Apple Developer account ($99/year) and the server online.
- [ ] **Verify:** the .dmg installs on your Mac (right-click → Open the first time), the app signs in to your local API and records; CI green.
- [ ] **Commit:** `build(desktop): unsigned dmg for macOS`


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

### Phase 8 — Teams: organisations and roles (≈2–3 weeks)
> Added after Phase 1 was built. **Starts only after Phase 1b (paid, private stack) and Phase 7's legal basics** (recording consent, GDPR, deletion on request): organisations share real, often confidential meetings, and the free stack has no privacy guarantee.
- **Account types:** a solo account is a user without an organisation, and stays exactly as today. A user can create an organisation or join one by invitation; one user may belong to several.
- **Roles:**

  | Role | Can do |
  |---|---|
  | Owner | everything, plus billing and deleting the organisation |
  | Admin | invite and remove members, change roles, see and manage all shared recordings |
  | Member | record, edit their own notes, see recordings shared with the organisation |
  | Viewer | read shared recordings and notes; no recording, editing or ticking items |
- **Sharing model:** recordings are private by default; the owner of a recording can switch "Share with *organisation*". Shared recordings appear in a per-organisation list; the sidebar gets an organisation switcher (personal / each organisation).
- **How:** Better Auth's official `organization` plugin (already our auth library, no new dependency): organisations, members, invitations, owner/admin/member roles and a custom `viewer` role via its access-control config. Migration: `recordings.organization_id` (nullable) + `shared` flag.
- **Permissions in one place:** the ownership check (`getOwned` in the recordings repository) becomes "owned by me, or shared in an organisation where my role allows this action". Every route keeps returning 404, not 403, for things you can't see.
- **Needs first:** transactional email for invitations (pick a provider; free tiers exist), and per-organisation minute limits (Phase 7 billing becomes per organisation / per seat).
- **Done when:** an owner invites a member and a viewer by email; the member's shared recording is visible to both; the viewer cannot edit, tick, record or delete (API returns 404/403 as designed, UI hides the actions); removing a member removes access at once; a solo user sees no change.

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
| 2 Quality, search & languages | 2–3 weeks | Speakers, search, Q&A over recordings, auto-detect and a separate notes language |
| 3 Desktop | ~2 weeks | Electron app with call recording |
| 4 Mobile | 2–3 weeks | Expo app with offline recording |
| 5 Live mode | ~2 weeks | Real-time transcript |
| 6 Local processing | 2–3 weeks | Private/offline mode |
| 7 Hardening + SaaS | ongoing | Billing, legal, ready for real users |
| 8 Teams | 2–3 weeks | Organisations, invitations, owner / admin / member / viewer roles, shared recordings |

Estimates assume part-time work alongside a job; adjust after Phase 0 based on your real speed.
