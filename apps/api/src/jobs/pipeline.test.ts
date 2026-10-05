import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import type { JobQueue } from "../modules/recordings/recordings.service.js";
import { connection, queues } from "../queue/queues.js";
import { buildServer } from "../server.js";
import { keys, storage } from "../storage/storage.service.js";
import { notesJob } from "./notes.job.js";
import { transcribeJob } from "./transcribe.job.js";

// the real providers throw without AI keys (CI has none)
vi.mock("../ai/providers.js", async () => ({
  stt: new (await import("../ai/stt/fake-stt.js")).FakeStt(),
  notesGenerator: new (await import("../ai/notes/fake-notes.js")).FakeNotes(),
}));

// integration test: needs Postgres, Redis, S3 (docker compose up -d) and ffmpeg
let app: FastifyInstance;
const emails: string[] = [];
const ids: string[] = [];
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };   // the test runs the jobs itself

async function signUp() {
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({
    method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN },
    payload: { email, password: "password1234", name: "Test" },
  });
  return [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
}

/** One 3 s tone recording cut into 2 byte chunks, the way MediaRecorder slices a stream. */
function toneChunks() {
  const webm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:a", "libopus", "-f", "webm", "pipe:1"]);
  const mid = Math.floor(webm.length / 2);
  return [webm.subarray(0, mid), webm.subarray(mid)];
}

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
});

afterAll(async () => {
  for (const id of ids) {
    await (await queues.notes.getJob(`notes-${id}`))?.remove();
    await storage.deletePrefix(keys.prefix(id));
  }
  const users = await db("user").whereIn("email", emails).pluck("id");
  await db("recordings").whereIn("id", ids).delete();
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await Promise.all([queues.transcribe.close(), queues.notes.close()]);
  await connection.quit();
  await db.destroy();
});

describe("pipeline", () => {
  it("create → chunks → finish → transcribe → notes → ready with notes and action items", async () => {
    const cookie = await signUp();
    const { id } = (
      await app.inject({ method: "POST", url: "/api/recordings", headers: { cookie },
        payload: { mode: "lesson", mimeType: "audio/webm;codecs=opus", source: "web" } })
    ).json<{ id: string }>();
    ids.push(id);

    const chunks = toneChunks();
    for (const [index, chunk] of chunks.entries()) {
      const res = await app.inject({
        method: "PUT", url: `/api/recordings/${id}/chunks/${index}`,
        headers: { cookie, "content-type": "audio/webm;codecs=opus" }, payload: chunk,
      });
      expect(res.statusCode).toBe(204);
    }
    await app.inject({ method: "POST", url: `/api/recordings/${id}/finish`, headers: { cookie },
      payload: { chunkCount: chunks.length, durationMs: 3000 } });

    await transcribeJob(id);
    await notesJob(id);
    await notesJob(id);                                     // a BullMQ retry must not duplicate action items

    const detail = (await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } })).json();
    expect(detail.recording).toMatchObject({ status: "ready", title: "Lesson plan review", error: null });
    expect(detail.segments).toHaveLength(2);
    expect(detail.notes).toMatchObject({ version: 2, editedByUser: false, content: { summary: expect.any(String) } });

    const items = await db("action_items").where({ recording_id: id }).select("text", "owner", "due_date", "user_id", "done");
    const owner = (await db("recordings").where({ id }).first("user_id")).user_id;
    expect(items).toEqual([{ text: "Prepare the quiz", owner: "Olena", due_date: "Friday", user_id: owner, done: false }]);
  });

  it("keeps a title the user gave", async () => {
    const rec = await repo.create(`test-${randomUUID()}`, { title: "Monday standup", mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
    ids.push(rec.id);
    await repo.replaceSegments(rec.id, [{ startMs: 0, endMs: 1000, speaker: null, text: "Hello." }]);
    await notesJob(rec.id);
    expect(await repo.getById(rec.id)).toMatchObject({ status: "ready", title: "Monday standup" });
  });

  it("fails with a clear error when there is no speech", async () => {
    const rec = await repo.create(`test-${randomUUID()}`, { mode: "memo", language: "en", mimeType: "audio/webm", source: "web" });
    ids.push(rec.id);
    await notesJob(rec.id);
    expect(await repo.getById(rec.id)).toMatchObject({ status: "failed", error: "No speech detected" });
    expect(await repo.latestNotes(rec.id)).toBeUndefined();
  });
});
