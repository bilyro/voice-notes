# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project rules

- The plan is in docs/PLAN.md. Work ONLY on the task I name. Do not start the next task.
- Follow the task's Files, Steps and Verify exactly. If the plan is wrong or outdated
  (for example a library API changed), stop and tell me before changing the approach.
- When the task's Verify passes, tick its checkboxes in docs/PLAN.md and commit
  with the task's commit message.
- Explain what you did in 5–10 lines: the key decisions and anything I should learn.
- Stack: TypeScript strict, pnpm, Zod, Vitest. No new dependencies without asking.
- Recordings can be English, Ukrainian or Spanish; the app's interface stays English only (see docs/PLAN.md section 1).
- UI work follows docs/DESIGN.md and the reference screens in docs/design/screens/. Use only the tokens from DESIGN.md (no new colors, fonts or radii). The .dc.html files are mockups to read, not code to copy.
- Never commit .env files or real recordings.

# Project state

Greenfield. The code is built task by task from docs/PLAN.md, so check which tasks are
ticked to see what exists. Don't assume a file or command from the plan exists until its task is done.

# Commands (as defined by the plan)

- Local infra (Postgres 16 + pgvector, Redis, MinIO with a `recordings` bucket): `docker compose up -d`
- Everything in dev: `pnpm dev`. All checks (what CI runs): `pnpm turbo lint typecheck test`
- One package: `pnpm --filter @vn/api <script>` (also `@vn/shared`, `web`)
- API server: `pnpm --filter @vn/api dev`. Worker (separate process): `pnpm --filter @vn/api worker`
- Migrations: `pnpm --filter @vn/api knex migrate:latest` / `migrate:rollback`
- Single test: `pnpm --filter @vn/api exec vitest run path/to/file.test.ts -t "test name"`
- Env vars: copy `.env.example` → `.env`. `apps/api/src/config.ts` validates them with Zod and crashes on startup if any are wrong.

# Architecture

pnpm + Turborepo monorepo: `packages/shared` (Zod schemas, API client, `notesToMarkdown`)
is used by `apps/api` (Fastify) and `apps/web` (React + Vite + TanStack Query).
Desktop (Electron) and mobile (Expo) come later.

- **Clients only record and display.** All the AI work runs in BullMQ workers behind two
  interfaces: `SpeechToText` (`ai/stt/`) and `NotesGenerator` (`ai/notes/`).
  `apps/api/src/ai/providers.ts` is the only place that picks adapters. Adding local/offline
  processing later means writing a new adapter, not changing the callers. `FakeStt` and `FakeNotes` are the test doubles.
- **Pipeline:** the client `POST /recordings`, uploads ordered 10 s chunks with
  `PUT /recordings/:id/chunks/:index` (raw bytes, saved to S3 at `recordings/{id}/chunks/NNNNN`), then calls
  `POST /recordings/:id/finish`. That enqueues the `transcribe` job: ffmpeg joins the chunks and converts them to mono 16 kHz Opus
  `audio.ogg`, STT turns that into segments, and the job enqueues `notes`. The notes job asks Claude with forced
  tool use (`save_notes`, schema from `z.toJSONSchema(Notes)`) and runs map→reduce above 60k chars,
  then writes the notes and action items.
- **Status machine:** `recording → uploaded → transcribing → summarizing → ready`, plus `failed`
  (set only after the last BullMQ retry, with the error stored; retry is possible).
- **Jobs must be idempotent** (`replaceSegments`, `replaceActionItems`, jobIds like `transcribe:{id}`)
  because BullMQ retries them.
- API layering: controller → service → repository (Knex). Every recording route uses the
  `requireUser` preHandler (Better Auth session). Ownership checks return 404, not 403.
- Notes are versioned rows (`notes.version`). When a user edits notes, the API saves a new version with `edited_by_user = true`.
