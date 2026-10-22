import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Notes } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { repo } from "../recordings/recordings.repository.js";
import type { JobQueue } from "../recordings/recordings.service.js";

// integration test: needs Postgres + S3 (docker compose up -d) and the migrations
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };
let app: FastifyInstance;
const emails: string[] = [];

async function signUp() {
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({
    method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN },
    payload: { email, password: "password1234", name: "Test" },
  });
  const cookie = [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
  const { userId } = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json<{ userId: string }>();
  return { cookie, userId };
}

const notes: Notes = {
  title: "Science fair", summary: "The fair moves to the gym.", keyPoints: [], decisions: ["Use the gym"],
  actionItems: [{ text: "Book the gym", owner: "Dana", dueDate: "Monday" }], proposals: [], openQuestions: [],
  concepts: [], reviewQuestions: [], ideas: [],
};

/** A recording with a transcript, audio key and notes; `ready` unless told otherwise. */
async function recording(userId: string, status: "ready" | "transcribing" = "ready") {
  const rec = await repo.create(userId, { title: "Science fair", mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, [{ startMs: 0, endMs: 5000, speaker: null, text: "A secret transcript line." }]);
  if (status === "ready") await repo.insertNotes(rec.id, notes);
  await repo.update(rec.id, { status, duration_ms: 60_000, audio_key: `recordings/${rec.id}/audio.ogg` });
  return rec.id;
}

const share = (cookie: string, id: string) => app.inject({ method: "POST", url: `/api/recordings/${id}/share`, headers: { cookie } });
const unshare = (cookie: string, id: string) => app.inject({ method: "DELETE", url: `/api/recordings/${id}/share`, headers: { cookie } });
const open = (token: string) => app.inject({ method: "GET", url: `/api/shared/${token}` });   // no cookie: anyone

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
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

describe("share links", () => {
  it("anyone with the link gets the notes and nothing else", async () => {
    const id = await recording(a.userId);
    const created = await share(a.cookie, id);
    expect(created.statusCode).toBe(200);
    const { token } = created.json<{ token: string }>();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const res = await open(token);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toBe("noindex");
    const body = res.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(["createdAt", "durationMs", "language", "mode", "notes", "title"]);
    expect(body).toMatchObject({ title: "Science fair", mode: "meeting", language: "en", durationMs: 60_000 });
    expect(body.notes).toMatchObject({ summary: "The fair moves to the gym.", actionItems: [{ text: "Book the gym", done: false }] });
    const raw = res.body;
    for (const secret of ["secret transcript", "audio.ogg", a.userId, emails[0]!, id]) expect(raw).not.toContain(secret);
  });

  it("the owner sees the token on the recording; sharing again keeps the same link", async () => {
    const id = await recording(a.userId);
    const { token } = (await share(a.cookie, id)).json<{ token: string }>();
    expect((await share(a.cookie, id)).json()).toEqual({ token });
    const detail = await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie: a.cookie } });
    expect(detail.json()).toMatchObject({ shareToken: token });
  });

  it("turning it off ends the link at once; a new link is a new token", async () => {
    const id = await recording(a.userId);
    const first = (await share(a.cookie, id)).json<{ token: string }>().token;
    expect((await unshare(a.cookie, id)).statusCode).toBe(204);
    expect((await open(first)).statusCode).toBe(404);
    const second = (await share(a.cookie, id)).json<{ token: string }>().token;
    expect(second).not.toBe(first);
    expect((await open(second)).statusCode).toBe(200);
    expect((await open(first)).statusCode).toBe(404);
  });

  it("another user can't create or turn off a link (404, like a missing recording)", async () => {
    const id = await recording(a.userId);
    const { token } = (await share(a.cookie, id)).json<{ token: string }>();
    expect((await share(b.cookie, id)).statusCode).toBe(404);
    expect((await unshare(b.cookie, id)).statusCode).toBe(404);
    expect((await open(token)).statusCode).toBe(200);
  });

  it("deleting the recording ends the link", async () => {
    const id = await recording(a.userId);
    const { token } = (await share(a.cookie, id)).json<{ token: string }>();
    expect((await app.inject({ method: "DELETE", url: `/api/recordings/${id}`, headers: { cookie: a.cookie } })).statusCode).toBe(204);
    expect((await open(token)).statusCode).toBe(404);
  });

  it("only recordings with notes can be shared; unknown and malformed links are 404", async () => {
    const processing = await recording(a.userId, "transcribing");
    expect((await share(a.cookie, processing)).statusCode).toBe(409);
    expect((await open("A".repeat(43))).statusCode).toBe(404);
    expect((await open("not-a-token")).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/recordings/${processing}/share` })).statusCode).toBe(401);
  });
});
