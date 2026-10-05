import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { keys, storage } from "../../storage/storage.service.js";
import type { JobQueue } from "./recordings.service.js";

// integration test: needs Postgres + S3 (docker compose up -d) and the migrations
const jobs: { name: string; recordingId: string; jobId: string }[] = [];
const fakeQueue: JobQueue = {
  add: async (name, data, { jobId }) => jobs.push({ name, recordingId: data.recordingId, jobId }),
};

let app: FastifyInstance;
const emails: string[] = [];

/** Signs up a fresh user and returns their session cookie. */
async function signUp() {
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: config.WEB_ORIGIN },
    payload: { email, password: "password1234", name: "Test" },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = [res.headers["set-cookie"]].flat().join(";");
  return setCookie.match(/better-auth\.session_token=[^;]+/)![0];
}

const createBody = { mode: "meeting", mimeType: "audio/webm;codecs=opus", source: "web" };

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: fakeQueue, notes: fakeQueue } });
});

afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  const recs = await db("recordings").whereIn("user_id", users).pluck("id");
  for (const id of recs) await storage.deletePrefix(keys.prefix(id));
  await db("recordings").whereIn("user_id", users).delete();
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});

describe("recordings", () => {
  it("create → upload 2 chunks → finish → uploaded, transcribe job queued", async () => {
    const cookie = await signUp();
    const created = await app.inject({ method: "POST", url: "/api/recordings", headers: { cookie }, payload: createBody });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    for (const index of [0, 1]) {
      const res = await app.inject({
        method: "PUT",
        url: `/api/recordings/${id}/chunks/${index}`,
        headers: { cookie, "content-type": "audio/webm;codecs=opus" },
        payload: Buffer.from(`chunk ${index}`),
      });
      expect(res.statusCode).toBe(204);
    }

    const finished = await app.inject({
      method: "POST",
      url: `/api/recordings/${id}/finish`,
      headers: { cookie },
      payload: { chunkCount: 2, durationMs: 20_000 },
    });
    expect(finished.statusCode).toBe(200);

    const got = await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } });
    const detail = got.json<{ recording: { status: string; language: string; durationMs: number } }>();
    expect(detail.recording).toMatchObject({ status: "uploaded", language: "en", durationMs: 20_000 });
    expect(jobs).toContainEqual({ name: "transcribe", recordingId: id, jobId: `transcribe-${id}` });

    // chunks are only accepted while recording
    const late = await app.inject({
      method: "PUT",
      url: `/api/recordings/${id}/chunks/2`,
      headers: { cookie, "content-type": "application/octet-stream" },
      payload: Buffer.from("late"),
    });
    expect(late.statusCode).toBe(409);

    const list = await app.inject({ method: "GET", url: "/api/recordings", headers: { cookie } });
    expect(list.json<{ id: string }[]>().map((r) => r.id)).toEqual([id]);
  });

  it("another user gets 404 for the same id", async () => {
    const owner = await signUp();
    const { id } = (
      await app.inject({ method: "POST", url: "/api/recordings", headers: { cookie: owner }, payload: createBody })
    ).json<{ id: string }>();

    const other = await signUp();
    const requests = [
      { method: "GET", url: `/api/recordings/${id}` },
      { method: "PUT", url: `/api/recordings/${id}/chunks/0`, payload: Buffer.from("x"), headers: { "content-type": "application/octet-stream" } },
      { method: "POST", url: `/api/recordings/${id}/finish`, payload: { chunkCount: 1, durationMs: 1000 } },
      { method: "DELETE", url: `/api/recordings/${id}` },
    ] as const;
    for (const r of requests) {
      const res = await app.inject({ ...r, headers: { ...("headers" in r ? r.headers : {}), cookie: other } });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(404);
    }
    const list = await app.inject({ method: "GET", url: "/api/recordings", headers: { cookie: other } });
    expect(list.json()).toEqual([]);
  });

  it("tells the web app whether the free stack is on", async () => {
    expect((await app.inject({ method: "GET", url: "/api/app-config" })).statusCode).toBe(401);
    const cookie = await signUp();
    const res = await app.inject({ method: "GET", url: "/api/app-config", headers: { cookie } });
    expect(res.json()).toEqual({ freeMode: config.STT_PROVIDER === "groq" || config.NOTES_PROVIDER === "groq" });
  });

  it("rejects missing sessions and bad input", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/api/recordings" });
    expect(noAuth.statusCode).toBe(401);

    const cookie = await signUp();
    const bad = await app.inject({ method: "POST", url: "/api/recordings", headers: { cookie }, payload: { mode: "podcast" } });
    expect(bad.statusCode).toBe(400);
    const ukrainian = await app.inject({
      method: "POST", url: "/api/recordings", headers: { cookie }, payload: { ...createBody, language: "uk" },
    });
    expect(ukrainian.statusCode).toBe(400);
  });

  it("saves edited notes as a new version and deletes audio with the recording", async () => {
    const cookie = await signUp();
    const { id } = (
      await app.inject({ method: "POST", url: "/api/recordings", headers: { cookie }, payload: createBody })
    ).json<{ id: string }>();
    await app.inject({
      method: "PUT", url: `/api/recordings/${id}/chunks/0`,
      headers: { cookie, "content-type": "application/octet-stream" }, payload: Buffer.from("audio"),
    });

    const notes = {
      title: "Sync", summary: "We met.", keyPoints: [], decisions: [], actionItems: [], proposals: [],
      openQuestions: [], concepts: [], reviewQuestions: [], ideas: [],
    };
    for (const v of [1, 2]) {
      const res = await app.inject({ method: "PUT", url: `/api/recordings/${id}/notes`, headers: { cookie }, payload: notes });
      expect(res.json()).toEqual({ version: v });
    }
    const detail = (await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } })).json();
    expect(detail.notes).toMatchObject({ version: 2, editedByUser: true, content: { title: "Sync" } });

    // action_items follow the saved notes, including the done flag
    const withItems = { ...notes, actionItems: [
      { text: "Send the agenda", owner: "Marta", dueDate: "Friday", done: true },
      { text: "Book the room", owner: null, dueDate: null },
    ] };
    const v3 = await app.inject({ method: "PUT", url: `/api/recordings/${id}/notes`, headers: { cookie }, payload: withItems });
    expect(v3.json()).toEqual({ version: 3 });
    const items = await db("action_items").where({ recording_id: id }).orderBy("id").select("text", "owner", "due_date", "done");
    expect(items).toEqual([
      { text: "Send the agenda", owner: "Marta", due_date: "Friday", done: true },
      { text: "Book the room", owner: null, due_date: null, done: false },
    ]);
    const latest = (await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } })).json();
    expect(latest.notes.content.actionItems[1]).toEqual({ text: "Book the room", owner: null, dueDate: null, done: false });

    const del = await app.inject({ method: "DELETE", url: `/api/recordings/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    await expect(storage.getStream(keys.chunk(id, 0))).rejects.toThrow();
    const gone = await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } });
    expect(gone.statusCode).toBe(404);
  });
});
