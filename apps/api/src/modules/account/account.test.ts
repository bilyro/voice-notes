import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Notes } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { keys, storage } from "../../storage/storage.service.js";
import { repo } from "../recordings/recordings.repository.js";
import type { JobQueue } from "../recordings/recordings.service.js";

// integration test: needs Postgres + S3 (docker compose up -d) and the migrations
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };
let app: FastifyInstance;
const emails: string[] = [];

async function signUp(name: string) {
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN }, payload: { email, password: "Quiet-harbor-lamp-8142", name } });
  const cookie = [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
  const { userId } = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json<{ userId: string }>();
  return { cookie, userId, email };
}

const notes: Notes = {
  title: "Gym booking", summary: "We book the gym.", keyPoints: [], decisions: ["Use the gym"],
  actionItems: [{ text: "Book the gym", owner: "Dana", dueDate: "Monday" }], proposals: [], openQuestions: [], concepts: [], reviewQuestions: [], ideas: [],
};
/** A ready recording with a transcript line, notes, and an audio object in storage. */
async function recording(userId: string, title: string) {
  const rec = await repo.create(userId, { title, mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, [{ startMs: 0, endMs: 4000, speaker: null, text: `${title}: we book the gym.` }]);
  await repo.insertNotes(rec.id, notes);
  await repo.replaceActionItems(rec.id, userId, notes.actionItems);
  await storage.put(keys.audio(rec.id), Buffer.from("audio"), "audio/ogg");
  await repo.update(rec.id, { status: "ready", audio_key: keys.audio(rec.id), duration_ms: 4000 });
  return rec.id;
}
/** Whether an object is still in storage (reading a deleted one throws). */
async function exists(key: string) {
  try {
    const stream = await storage.getStream(key);
    stream.destroy();
    return true;
  } catch {
    return false;
  }
}
const exportOf = (cookie: string) => app.inject({ method: "GET", url: "/api/account/export", headers: { cookie } });
const del = (cookie: string, email: string) => app.inject({ method: "DELETE", url: "/api/account", headers: { cookie }, payload: { email } });

let a: Awaited<ReturnType<typeof signUp>>, b: Awaited<ReturnType<typeof signUp>>;
let a1: string, a2: string, b1: string;
beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
  a = await signUp("Ann Account");
  b = await signUp("Ben Other");
  a1 = await recording(a.userId, "First");
  a2 = await recording(a.userId, "Second");
  b1 = await recording(b.userId, "Ben's");
});
afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  for (const id of await db("recordings").whereIn("user_id", users).pluck("id")) await storage.deletePrefix(keys.prefix(id));
  await db("recordings").whereIn("user_id", users).delete();
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});

describe("account (Task 1.36)", () => {
  it("exports your account, recordings, transcripts and latest notes, and nothing of anyone else", async () => {
    const res = await exportOf(a.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="voice-notes-export-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = res.json();
    expect(data.account).toEqual({ email: a.email, name: "Ann Account", createdAt: expect.any(String) });
    expect(data.recordings.map((r: { id: string }) => r.id)).toEqual([a1, a2]);
    expect(data.recordings[0]).toMatchObject({ title: "First", hasAudio: true, transcript: [{ text: "First: we book the gym." }], notes: { version: 1, content: { summary: "We book the gym." } } });
    expect(res.body).not.toContain("Ben");
    expect(res.body).not.toContain(b1);
  });

  it("refuses to delete without your email typed", async () => {
    const res = await del(a.cookie, b.email);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "Type your email to confirm." });
    expect(await db("recordings").where({ user_id: a.userId }).count<{ n: string }[]>("id as n")).toEqual([{ n: "2" }]);
  });

  it("deletes the account, every recording and its stored audio; the other user keeps everything", async () => {
    expect((await del(a.cookie, ` ${a.email.toUpperCase()} `)).statusCode).toBe(204);   // case and spaces don't matter
    expect(await db("recordings").where({ user_id: a.userId }).first()).toBeUndefined();
    expect(await db("action_items").where({ user_id: a.userId }).first()).toBeUndefined();
    expect(await exists(keys.audio(a1))).toBe(false);
    expect(await db("user").where({ id: a.userId }).first()).toBeUndefined();
    expect(await db("session").where({ userId: a.userId }).first()).toBeUndefined();
    expect(await db("account").where({ userId: a.userId }).first()).toBeUndefined();
    // the old session is gone, and signing in again fails
    expect((await app.inject({ method: "GET", url: "/api/recordings", headers: { cookie: a.cookie } })).statusCode).toBe(401);
    const signIn = await app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { origin: config.WEB_ORIGIN }, payload: { email: a.email, password: "Quiet-harbor-lamp-8142" } });
    expect(signIn.statusCode).toBe(401);
    // B untouched
    expect((await app.inject({ method: "GET", url: `/api/recordings/${b1}`, headers: { cookie: b.cookie } })).statusCode).toBe(200);
    expect(await exists(keys.audio(b1))).toBe(true);
  });

  it("needs a session", async () => {
    expect((await app.inject({ method: "GET", url: "/api/account/export" })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/api/account", payload: { email: "x@example.com" } })).statusCode).toBe(401);
  });
});
