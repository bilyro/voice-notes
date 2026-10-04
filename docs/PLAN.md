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
| Languages | **English only for now**: speech-to-text is forced to `en` and notes are written in English. Ukrainian, auto-detect and a notes-language setting come later (Phase 2) |
| Build order | Backend + Web first → Desktop → Mobile → Live mode → Local processing |

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
| Audio storage | S3-compatible (RustFS local, Cloudflare R2 prod) | Cheap, swappable. MinIO no longer publishes Docker images, so we use RustFS, which is MinIO-compatible |
| Audio tools | ffmpeg (in worker) | Join chunks, normalize to mono 16 kHz |
| Auth | Better Auth (email + password to start) | Self-hosted, TS-first |
| Web | React + Vite + React Router + TanStack Query | Simple, fast dev loop |
| Speech-to-text (cloud) | Adapter; first example: OpenAI `whisper-1` | Returns segment timestamps (`verbose_json`); swap later for a provider with diarization |
| Notes (cloud) | Adapter; Claude via `@anthropic-ai/sdk` | Strong structured output via forced tool use |
| Tests | Vitest | Fast, TS-native |
| Later | Electron, Expo, whisper.cpp, Ollama | Phases 3–6 |

> Before locking the STT provider: record 3–4 real English samples (a call, a lecture, a memo) and compare 2–3 providers on accuracy, speaker labels and price per minute. Keep the winner behind the adapter. Repeat with Ukrainian samples when Ukrainian is added.

---

## 4. Repository layout

```
voice-notes/
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ docker-compose.yml
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
   │     ├─ ai/stt/openai-stt.ts             # cloud adapter
   │     ├─ ai/stt/fake-stt.ts               # for tests
   │     ├─ ai/notes/notes-generator.ts      # interface
   │     ├─ ai/notes/claude-notes.ts         # cloud adapter
   │     ├─ ai/notes/prompts.ts
   │     └─ ai/notes/fake-notes.ts           # for tests
   └─ web/
      └─ src/
         ├─ main.tsx
         ├─ router.tsx
         ├─ lib/api.ts
         ├─ lib/auth-client.ts
         ├─ recorder/use-recorder.ts
         ├─ recorder/chunk-uploader.ts
         ├─ pages/{LoginPage,SignUpPage}.tsx
         ├─ pages/RecordPage.tsx
         ├─ pages/RecordingsPage.tsx
         ├─ pages/RecordingDetailPage.tsx
         └─ components/{RequireAuth,AudioPlayer,Transcript,NotesEditor}.tsx
```

---

## 5. Phase 0 — Foundations (≈1 week)

**Goal:** the web app logs in and calls a typed `/health` endpoint; DB, Redis and storage run locally.

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

### ✅ Phase 0 done when
- [ ] `docker compose up -d && pnpm dev` starts API + web
- [ ] Sign up / sign in works
- [ ] CI is green

---

## 6. Phase 1 — Web MVP, batch mode (≈2–3 weeks)

**Goal:** record in the browser → audio uploads in chunks → transcript → notes & proposals appear automatically → you can edit and export them.

### Task 1.0 — English-only language field
- [ ] **Files:** `packages/shared/src/schemas/recording.ts`, `apps/api/migrations/002_english_only.ts`
- [ ] **Why:** we support English only for now (Section 1), but Task 0.3/0.5 built `uk | en | auto` with default `auto`. We keep the `language` field, so adding Ukrainian later is an enum change plus UI, but restrict it to `en`.

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

- [ ] **Verify:** `pnpm turbo typecheck` is green; `knex migrate:latest` then `\d recordings` shows `language ... default 'en'`; `migrate:rollback` + `migrate:latest` works.
- [ ] **Commit:** `feat: restrict recording language to English for now`

### Task 1.1 — Storage service
- [ ] **Files:** `apps/api/src/storage/storage.service.ts`
- [ ] **Steps:** `pnpm --filter @vn/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

```ts
// apps/api/src/storage/storage.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { config } from "../config.js";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,                        // needed for RustFS/MinIO
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

- [ ] **Verify:** a small Vitest integration test puts a buffer, reads it back, deletes the prefix (runs against local RustFS).
- [ ] **Commit:** `feat(api): s3 storage service`

### Task 1.2 — Recordings repository + service + controller
- [ ] **Files:** `apps/api/src/modules/recordings/*`
- [ ] **Endpoints** (all use `preHandler: requireUser` and check `recording.user_id === req.userId`):

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

- [ ] **Verify:** Vitest tests with `app.inject()`: create → upload 2 chunks → finish → status is `uploaded`; another user gets 404 for the same id.
- [ ] **Commit:** `feat(api): recordings endpoints with chunked upload`

### Task 1.3 — Queues and worker process
- [ ] **Files:** `apps/api/src/queue/queues.ts`, `apps/api/src/worker.ts`, `apps/api/src/jobs/mark-failed.ts`
- [ ] **Steps:** `pnpm --filter @vn/api add bullmq ioredis`, and add the script `"worker": "DOTENV_PATH=../../.env tsx watch src/worker.ts"`

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

- [ ] **Verify:** `pnpm --filter @vn/api worker` starts; finishing a recording shows a job in Redis (`redis-cli keys 'bull:*'`).
- [ ] **Commit:** `feat(api): bullmq queues and worker entrypoint`

### Task 1.4 — Audio preparation (join chunks + normalize)
- [ ] **Files:** `apps/api/src/audio/prepare-audio.ts`
- [ ] **Steps:** install ffmpeg on your machine / in the worker Docker image. Join chunks **in order**, then convert to mono 16 kHz Opus (small files, and whisper.cpp will need 16 kHz later anyway).

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

- [ ] **Verify:** test with 3 real chunks recorded in Chrome → `audio.ogg` plays fully in VLC, no gaps.
- [ ] **Commit:** `feat(api): join and normalize audio with ffmpeg`

> ⚠️ Safari records `audio/mp4` instead of webm. Test concatenation there early; if fragments don't join cleanly, upload the whole recording as one chunk on stop for Safari only.

### Task 1.5 — Speech-to-text interface + cloud adapter
- [ ] **Files:** `ai/stt/speech-to-text.ts`, `ai/stt/openai-stt.ts`, `ai/stt/fake-stt.ts`
- [ ] **Steps:** `pnpm --filter @vn/api add openai`

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
// apps/api/src/ai/stt/openai-stt.ts
import fs from "node:fs";
import OpenAI from "openai";
import type { SpeechToText, TranscribeOptions } from "./speech-to-text.js";

export class OpenAiStt implements SpeechToText {
  readonly name = "openai-whisper-1";
  private client = new OpenAI();             // reads OPENAI_API_KEY

  async transcribe(localPath: string, opts: TranscribeOptions) {
    const res = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(localPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: opts.language,                 // forcing the language beats auto-detect on accuracy
    });
    const segments = (res.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speaker: null,                         // this API has no diarization
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

- [ ] **Verify:** a script `pnpm --filter @vn/api tsx scripts/try-stt.ts sample.ogg` prints English segments with timestamps.
- [ ] **Commit:** `feat(api): speech-to-text interface with openai adapter`

> File size limit: this API accepts files up to 25 MB. At 24 kbps Opus that is ~2 hours. For longer recordings, split with ffmpeg (`-f segment -segment_time 1800`) and offset the timestamps.

### Task 1.6 — Transcribe job
- [ ] **Files:** `apps/api/src/jobs/transcribe.job.ts`, `apps/api/src/ai/providers.ts`

```ts
// apps/api/src/ai/providers.ts — the ONLY place that picks adapters
import { OpenAiStt } from "./stt/openai-stt.js";
import { ClaudeNotes } from "./notes/claude-notes.js";
export const stt = new OpenAiStt();
export const notesGenerator = new ClaudeNotes();
// Phase 6: choose WhisperCppStt / OllamaNotes based on user setting here
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

- [ ] **Verify:** integration test with `FakeStt` → after the job, 2 segments in DB and a `notes` job queued. `replaceSegments` makes the job safe to retry.
- [ ] **Commit:** `feat(api): transcribe job`

### Task 1.7 — Notes prompts per mode
- [ ] **Files:** `apps/api/src/ai/notes/prompts.ts`

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

- [ ] **Commit:** `feat(api): notes prompts per recording mode`

### Task 1.8 — NotesGenerator interface + Claude adapter (with long-transcript handling)
- [ ] **Files:** `ai/notes/notes-generator.ts`, `ai/notes/claude-notes.ts`, `ai/notes/fake-notes.ts`
- [ ] **Steps:** `pnpm --filter @vn/api add @anthropic-ai/sdk`

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
// apps/api/src/ai/notes/claude-notes.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Notes, type RecordingMode, type Segment } from "@vn/shared";
import { config } from "../../config.js";
import { formatTranscript, type NotesGenerator } from "./notes-generator.js";
import { systemPrompt } from "./prompts.js";

const MAX_CHARS_PER_CALL = 60_000;   // above this, use map → reduce

export class ClaudeNotes implements NotesGenerator {
  readonly name = "claude";
  private client = new Anthropic();   // reads ANTHROPIC_API_KEY

  async generate(segments: Segment[], mode: RecordingMode): Promise<Notes> {
    const text = formatTranscript(segments);
    if (text.length <= MAX_CHARS_PER_CALL) return this.call(mode, text);

    // MAP: notes for each part
    const parts = splitByChars(text, MAX_CHARS_PER_CALL);
    const partial = await Promise.all(parts.map((p) => this.call(mode, p)));
    // REDUCE: merge partial notes into one
    return this.call(mode,
      `Merge these partial notes from consecutive parts of ONE recording. Remove duplicates.\n\n${JSON.stringify(partial)}`);
  }

  private async call(mode: RecordingMode, content: string): Promise<Notes> {
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

function splitByChars(text: string, max: number) {
  const lines = text.split("\n");
  const parts: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length > max && cur) { parts.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur) parts.push(cur);
  return parts;
}
```

- [ ] **Verify:** unit test `splitByChars` (never cuts a line, no empty parts). Manual script `try-notes.ts` on a real English transcript → valid `Notes` JSON.
- [ ] **Commit:** `feat(api): claude notes generator with structured output and map-reduce`

> Check the current model names and SDK details in the official docs (https://docs.claude.com/en/api/overview) when you implement this; the model is configurable via `NOTES_MODEL`.

### Task 1.9 — Notes job
- [ ] **Files:** `apps/api/src/jobs/notes.job.ts`

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

- [ ] **Verify:** full pipeline test with `FakeStt` + `FakeNotes`: create → chunks → finish → run both jobs → status `ready`, notes row exists, action items saved.
- [ ] **Commit:** `feat(api): notes job saves notes and action items`

### Task 1.10 — Browser recorder hook + chunk uploader
- [ ] **Files:** `apps/web/src/recorder/use-recorder.ts`, `apps/web/src/recorder/chunk-uploader.ts`

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

- [ ] **Verify:** record 35 s → 4 chunks uploaded (check the RustFS console). Turn Wi-Fi off for 15 s mid-recording → chunks still arrive after reconnect.
- [ ] **Commit:** `feat(web): media recorder hook with ordered chunk uploads`

> Duration from `Date.now()` includes paused time — subtract pauses if you add a visible timer. Stretch goal: keep un-uploaded chunks in IndexedDB so a closed tab doesn't lose audio.

### Task 1.11 — Record page
- [ ] **Files:** `apps/web/src/pages/RecordPage.tsx`
- [ ] **Steps:** mode selector (meeting / lesson / memo), big Record / Pause / Stop button, timer, a visible red "Recording" indicator, and a short consent reminder ("Tell everyone they are being recorded").
- [ ] Flow on **Record**: `POST /recordings` → create `ChunkUploader(id)` → `start()`.
- [ ] Flow on **Stop**: `stop()` → `uploader.flush()` → `POST /recordings/:id/finish { chunkCount, durationMs }` → navigate to the detail page.
- [ ] **Verify:** record → stop → redirected to detail page showing status `uploaded` → `transcribing`.
- [ ] **Commit:** `feat(web): record page`

### Task 1.12 — Recordings list with live status
- [ ] **Files:** `apps/web/src/pages/RecordingsPage.tsx`

```ts
const { data } = useQuery({
  queryKey: ["recordings"],
  queryFn: () => api<Recording[]>("/recordings"),
  // poll only while something is still processing
  refetchInterval: (q) =>
    q.state.data?.some((r) => !["ready", "failed"].includes(r.status)) ? 3000 : false,
});
```

- [ ] Show title, mode badge, date, duration, status chip; `failed` shows a **Retry** button.
- [ ] **Commit:** `feat(web): recordings list with status polling`

### Task 1.13 — Recording detail page
- [ ] **Files:** `RecordingDetailPage.tsx`, `components/AudioPlayer.tsx`, `components/Transcript.tsx`, `components/NotesEditor.tsx`
- [ ] **Steps:**
  - [ ] `AudioPlayer`: gets a signed URL from `GET /recordings/:id/audio`, exposes `seek(ms)` via a ref.
  - [ ] `Transcript`: list of segments with timestamps; click a line → `player.seek(startMs)`; highlight the line that is playing (`timeupdate` event).
  - [ ] `NotesEditor`: sections Summary, Key points, Decisions, Action items (checkboxes), Proposals, Open questions (+ Concepts / Review questions for lessons, Ideas for memos). Inline editing, **Save** → `PUT /recordings/:id/notes`. The API also replaces `action_items` from the saved notes, the same way the notes job does, so edits show up in the Phase 2 action-items page.
  - [ ] Processing state: show a progress step (Uploaded → Transcribing → Writing notes → Ready).
- [ ] **Verify:** clicking a transcript line jumps the audio to that moment; edits survive a page reload.
- [ ] **Commit:** `feat(web): recording detail with player, transcript and notes editor`

### Task 1.14 — Markdown export
- [ ] **Files:** `packages/shared/src/notes-to-markdown.ts` (shared so desktop/mobile reuse it)

```ts
export function notesToMarkdown(title: string, n: Notes, date: string) {
  const list = (h: string, items: string[]) => (items.length ? `## ${h}\n${items.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    `# ${title}\n_${date}_\n`,
    `## Summary\n${n.summary}\n`,
    list("Key points", n.keyPoints),
    list("Decisions", n.decisions),
    n.actionItems.length
      ? `## Action items\n${n.actionItems.map((a) => `- [ ] ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.dueDate ? ` (${a.dueDate})` : ""}`).join("\n")}\n`
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

- [ ] Buttons: **Copy as Markdown** and **Download .md**.
- [ ] **Verify:** unit test with a sample `Notes` object; empty sections are not printed. (This is the shared package's first test: add `"test": "vitest run"` to `packages/shared/package.json`.)
- [ ] **Commit:** `feat: markdown export of notes`

### Task 1.15 — Delete, retry, limits
- [ ] `DELETE /recordings/:id` removes DB rows (cascade) **and** `storage.deletePrefix(keys.prefix(id))`.
- [ ] `POST /recordings/:id/retry`: if no segments → enqueue `transcribe`, else enqueue `notes`. **Remove the old job first** (`await (await queue.getJob(jobId))?.remove()`), because BullMQ keeps failed jobs and ignores `add()` with an existing id, so the retry would silently do nothing.
- [ ] Monthly minutes limit: sum `duration_ms` this month per user; reject `finish` with 402 + friendly message when over `MONTHLY_MINUTES_LIMIT`.
- [ ] **Verify:** after delete, storage has no objects under the prefix; retry fixes a recording that failed because the API key was missing.
- [ ] **Commit:** `feat(api): delete, retry and monthly usage limit`

### ✅ Phase 1 acceptance test (do it manually, then write it down as a checklist in the README)
- [ ] Record **5 minutes of English** speech in Chrome → transcript and notes appear without any manual step.
- [ ] Lesson mode produces concepts + review questions; memo mode produces ideas.
- [ ] Proposals are specific to the content, not generic advice.
- [ ] Network drop during recording does not lose audio.
- [ ] A recording **> 60 minutes** completes (map → reduce path is used).
- [ ] Another user cannot open your recording by guessing the URL.
- [ ] `pnpm turbo lint typecheck test` is green.

---

## 7. Later phases (overview — will be broken into tasks when you get there)

### Phase 2 — Quality and search (≈2 weeks)
- **Ukrainian support:** add `uk` / `auto` to `LanguageCode`, a language selector on the Record page, a per-user notes-language setting (needs storage, e.g. a `user_settings` table), and a `notesLanguage` parameter in prompts and `NotesGenerator`. Compare STT providers on Ukrainian samples first.
- Speaker labels (diarization): switch/add an STT adapter that returns speakers; UI to rename "Speaker 1" → a real name (stored per recording).
- Embeddings for transcript segments (fill the `embedding` column), HNSW index on pgvector.
- Search page: full-text (`tsvector`) + semantic search combined.
- "Ask your recordings" chat: retrieve top segments → answer with links to `[recording, timestamp]`.
- Action items page across all recordings (filter: open / done / owner).

### Phase 3 — Desktop app, Electron (≈2 weeks)
- Electron shell loading the web UI; same API and auth.
- Tray icon, global hotkey to start/stop, "always on top" mini recorder.
- **System audio capture** for Zoom/Meet/Teams calls, mixed with the mic via Web Audio API. Do a 1–2 day spike first on your OS — Windows and macOS work differently, and this is the riskiest part of the whole project.
- Auto-update and code signing (needed later for distribution).

### Phase 4 — Mobile app, Expo (≈2–3 weeks)
- Record with `expo-audio`, saving to a local file first.
- Background recording (iOS background audio mode, Android foreground service with a notification).
- Offline upload queue: upload when the network returns; show "waiting to upload".
- Same screens using the shared API client, schemas and `notesToMarkdown`.

### Phase 5 — Live mode (≈2 weeks)
- WebSocket from client → API → streaming STT provider; show the transcript live.
- Refresh "live notes" every few minutes for long meetings; final notes still made by the batch pipeline at the end.

### Phase 6 — Local processing (≈2–3 weeks)
- `WhisperCppStt` adapter (whisper.cpp or faster-whisper) and `OllamaNotes` adapter, chosen in `ai/providers.ts`.
- Desktop: run local models directly on the user's computer. Mobile: `whisper.rn` with small models for on-device transcription.
- User setting **"Privacy mode: process locally"**; show which engine processed each recording.
- Compare quality on the same samples you used to choose the cloud provider.

### Phase 7 — Production hardening
- Cost tracking per recording (minutes + LLM tokens), admin view.
- Retention settings (auto-delete audio after N days, keep notes).
- Encryption at rest, rate limits, Sentry error monitoring, structured logs.
- Backups for Postgres and object storage.

---

## 8. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| **Consent / privacy** — recording other people | Clear recording indicator + reminder in UI. For lessons, get the school's and parents' permission before recording real classes. Easy full delete. |
| Cloud costs grow | Monthly minutes limit from day one; small Opus files; cost tracking in Phase 7 |
| Transcription quality (English now, Ukrainian later) | Compare providers on real samples before choosing; adapter makes switching cheap |
| AI invents facts in notes | Prompt rules + "only what was said" + openQuestions; user can edit everything |
| Safari / iOS audio quirks | Test Safari in Phase 1; Phase 4 uses native recording on mobile |
| System audio capture on desktop | Spike first in Phase 3 before committing to the design |
| Scope (3 platforms, one developer) | Phases 0–2 are a complete portfolio project; everything after is a bonus |

---

## 9. Timeline at a glance

| Phase | Estimate | Result |
|---|---|---|
| 0 Foundations | ~1 week | Monorepo, infra, auth, CI |
| 1 Web MVP | 2–3 weeks | Record → transcript → notes & proposals → edit/export |
| 2 Quality & search | ~2 weeks | Speakers, search, Q&A over recordings |
| 3 Desktop | ~2 weeks | Electron app with call recording |
| 4 Mobile | 2–3 weeks | Expo app with offline recording |
| 5 Live mode | ~2 weeks | Real-time transcript |
| 6 Local processing | 2–3 weeks | Private/offline mode |
| 7 Hardening | ongoing | Ready for real users |

Estimates assume part-time work alongside a job; adjust after Phase 0 based on your real speed.
