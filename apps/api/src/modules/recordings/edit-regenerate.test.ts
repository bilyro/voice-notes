import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Notes, TranscriptLine } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { repo } from "./recordings.repository.js";
import type { JobQueue } from "./recordings.service.js";

// integration test: needs Postgres (docker compose up -d) and the migrations
const jobs: { name: string; recordingId: string; jobId: string }[] = [];
const removed: string[] = [];
const fakeQueue: JobQueue = {
  add: async (name, data, { jobId }) => jobs.push({ name, recordingId: data.recordingId, jobId }),
  getJob: async (jobId) => ({ remove: async () => { removed.push(jobId); } }),
};
let app: FastifyInstance;
const emails: string[] = [];

async function signUp() {
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN }, payload: { email, password: "Quiet-harbor-lamp-8142", name: "Test" } });
  const cookie = [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
  const { userId } = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json<{ userId: string }>();
  return { cookie, userId };
}
const notes: Notes = { title: "", summary: "s", keyPoints: [], decisions: [], actionItems: [], proposals: [], openQuestions: [], concepts: [], reviewQuestions: [], ideas: [] };
async function recording(userId: string, status: "ready" | "transcribing" = "ready", lines = ["I will book the gym by Friday.", "Karen sends the newsletter."]) {
  const rec = await repo.create(userId, { title: "Planning", mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, lines.map((text, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, speaker: null, text })));
  if (status === "ready") await repo.insertNotes(rec.id, notes);
  await repo.update(rec.id, { status });
  return rec.id;
}
const detail = (cookie: string, id: string) => app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } });
const edit = (cookie: string, id: string, segmentId: string, text: string) =>
  app.inject({ method: "PATCH", url: `/api/recordings/${id}/segments/${segmentId}`, headers: { cookie }, payload: { text } });
const regenerate = (cookie: string, id: string, mode: string) => app.inject({ method: "POST", url: `/api/recordings/${id}/regenerate`, headers: { cookie }, payload: { mode } });

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };
beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: fakeQueue, notes: fakeQueue } });
  a = await signUp();
  b = await signUp();
});
afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  await db("recordings").whereIn("user_id", users).delete();
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});

describe("edit a transcript line (Task 1.38)", () => {
  it("lines come with their id; an edit is saved trimmed, and search finds it at once", async () => {
    const id = await recording(a.userId);
    const lines = (await detail(a.cookie, id)).json<{ segments: TranscriptLine[] }>().segments;
    expect(lines.map((l) => typeof l.id)).toEqual(["string", "string"]);
    expect((await edit(a.cookie, id, lines[0]!.id, "  I will book the sports hall by Friday.  ")).statusCode).toBe(200);
    expect((await detail(a.cookie, id)).json<{ segments: TranscriptLine[] }>().segments[0]!.text).toBe("I will book the sports hall by Friday.");
    const found = (await app.inject({ method: "GET", url: "/api/search?q=sports%20hall", headers: { cookie: a.cookie } })).json<{ recording: { id: string } }[]>();
    expect(found.map((r) => r.recording.id)).toContain(id);
  });

  it("refuses an empty or too long line, someone else's recording, and a line from another recording", async () => {
    const id = await recording(a.userId);
    const other = await recording(a.userId);
    const line = (await detail(a.cookie, id)).json<{ segments: TranscriptLine[] }>().segments[0]!;
    const otherLine = (await detail(a.cookie, other)).json<{ segments: TranscriptLine[] }>().segments[0]!;
    expect((await edit(a.cookie, id, line.id, "   ")).statusCode).toBe(400);
    expect((await edit(a.cookie, id, line.id, "x".repeat(2001))).statusCode).toBe(400);
    expect((await edit(b.cookie, id, line.id, "Hacked")).statusCode).toBe(404);
    expect((await edit(a.cookie, id, otherLine.id, "Wrong recording")).statusCode).toBe(404);
    expect((await edit(a.cookie, id, "abc", "Bad id")).statusCode).toBe(400);
    expect((await detail(a.cookie, id)).json<{ segments: TranscriptLine[] }>().segments[0]!.text).toBe("I will book the gym by Friday.");
  });
});

describe("regenerate the notes (Task 1.38)", () => {
  it("sets the mode, goes back to 'summarizing' and queues a fresh notes job", async () => {
    const id = await recording(a.userId);
    jobs.length = 0; removed.length = 0;
    expect((await regenerate(a.cookie, id, "lesson")).statusCode).toBe(200);
    expect(await repo.getById(id)).toMatchObject({ mode: "lesson", status: "summarizing", error: null });
    expect(removed).toEqual([`notes-${id}`]);                       // the old finished job is cleared first
    expect(jobs).toEqual([{ name: "notes", recordingId: id, jobId: `notes-${id}` }]);
  });

  it("refuses while processing, without a transcript, a bad mode, or someone else's recording", async () => {
    expect((await regenerate(a.cookie, await recording(a.userId, "transcribing"), "meeting")).statusCode).toBe(409);
    expect((await regenerate(a.cookie, await recording(a.userId, "ready", []), "meeting")).statusCode).toBe(409);
    const id = await recording(a.userId);
    expect((await regenerate(a.cookie, id, "podcast")).statusCode).toBe(400);
    expect((await regenerate(b.cookie, id, "meeting")).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/recordings/${id}/regenerate`, payload: { mode: "meeting" } })).statusCode).toBe(401);
  });
});
