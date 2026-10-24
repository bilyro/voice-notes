import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { TranscriptLine } from "@vn/shared";
import { embedder } from "../ai/embeddings/index.js";
import { toPgVector } from "../ai/embeddings/embedder.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import type { JobQueue } from "../modules/recordings/recordings.service.js";
import { buildServer } from "../server.js";
import { embedJob } from "./embed.job.js";

// integration test: needs Postgres with pgvector (docker compose up -d); the fake embedder (package.json): no model download
const queued: string[] = [];
const embedQueue: JobQueue = { add: async (_n, data) => queued.push(data.recordingId), getJob: async () => undefined };
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };
let app: FastifyInstance;
const emails: string[] = [];
let cookie: string, userId: string;

const lines = ["I will book the gym by Friday.", "Karen sends the newsletter to parents.", "Order pizza for the volunteers."];
const filled = (id: string) => db("transcript_segments").where({ recording_id: id }).whereNotNull("embedding").count<{ n: string }[]>("id as n").then((r) => Number(r[0]!.n));

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue, embed: embedQueue } });
  const email = `test-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN }, payload: { email, password: "Quiet-harbor-lamp-8142", name: "Test" } });
  cookie = [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
  userId = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json<{ userId: string }>().userId;
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

async function recording() {
  const rec = await repo.create(userId, { title: "Embed me", mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, lines.map((text, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, speaker: null, text })));
  return rec.id;
}

describe("embed job (Task 2.1)", () => {
  it("fills every line with a 384-number vector; a second run has nothing to do", async () => {
    const id = await recording();
    expect(await embedJob(id)).toBe(3);
    expect(await filled(id)).toBe(3);
    const dims = await db.raw<{ rows: { d: number }[] }>("select distinct vector_dims(embedding) as d from transcript_segments where recording_id = ?", [id]);
    expect(dims.rows).toEqual([{ d: 384 }]);
    expect(await embedJob(id)).toBe(0);
  });

  it("an edited line loses its old vector, the job is queued, and it is filled again", async () => {
    const id = await recording();
    await embedJob(id);
    const line = (await app.inject({ method: "GET", url: `/api/recordings/${id}`, headers: { cookie } })).json<{ segments: TranscriptLine[] }>().segments[0]!;
    queued.length = 0;
    await app.inject({ method: "PATCH", url: `/api/recordings/${id}/segments/${line.id}`, headers: { cookie }, payload: { text: "I will reserve the sports hall." } });
    expect(await filled(id)).toBe(2);
    expect(queued).toEqual([id]);
    expect(await embedJob(id)).toBe(1);
    expect(await filled(id)).toBe(3);
  });

  it("the closest line by meaning comes first (cosine distance, the HNSW index's operator)", async () => {
    const id = await recording();
    await embedJob(id);
    const q = toPgVector(await embedder.embedQuery("who books the gym"));
    const { rows } = await db.raw<{ rows: { text: string }[] }>(
      "select text from transcript_segments where recording_id = ? order by embedding <=> ?::vector limit 1", [id, q]);
    expect(rows[0]!.text).toBe("I will book the gym by Friday.");
  });

  it("does nothing for a recording without lines (deleted meanwhile)", async () => {
    expect(await embedJob(randomUUID())).toBe(0);
  });
});
