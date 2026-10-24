import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SearchResult } from "@vn/shared";

// a stand-in embedder that knows a few meanings (synonyms across languages), so "found by meaning, not by words"
// can be tested without the real model: each concept is one axis, texts without a known concept point elsewhere
vi.mock("../../ai/embeddings/index.js", () => {
  const CONCEPTS = [["gym", "sports hall", "спортзал", "gimnasio"], ["pizza", "food", "lunch"], ["newsletter", "parents"]];
  const vector = (text: string) => {
    const t = text.toLowerCase();
    const v: number[] = new Array<number>(384).fill(0);
    CONCEPTS.forEach((words, i) => { if (words.some((w) => t.includes(w))) v[i] = 1; });
    // unrelated to all of them: a direction of its own (from a hash of the text), so two unrelated texts aren't alike
    if (!v.some((x) => x !== 0)) v[10 + ([...t].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7) % 370)] = 1;
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  return { embedder: { name: "concepts", dimensions: 384, embedPassages: async (t: string[]) => t.map(vector), embedQuery: async (t: string) => vector(t) } };
});

const { config } = await import("../../config.js");
const { db } = await import("../../db.js");
const { buildServer } = await import("../../server.js");
const { repo } = await import("../recordings/recordings.repository.js");
const { embedJob } = await import("../../jobs/embed.job.js");

const noQueue = { add: async () => undefined, getJob: async () => undefined };
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
async function recording(userId: string, title: string, lines: string[]) {
  const rec = await repo.create(userId, { title, mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, lines.map((text, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, speaker: null, text })));
  await embedJob(rec.id);
  return rec.id;
}
const search = async (cookie: string, q: string) =>
  (await app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent(q)}`, headers: { cookie } })).json<SearchResult[]>();

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };
let byMeaning: string, byWords: string;
beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
  a = await signUp();
  b = await signUp();
  byMeaning = await recording(a.userId, "Planning", ["Welcome everyone to the meeting.", "We will reserve the sports hall for Friday.", "Gym."]);
  byWords = await recording(a.userId, "Bookings", ["The gym booking is confirmed for Monday.", "Pizza arrives at noon for everyone."]);
  await recording(b.userId, "Secret", ["Someone else talks about the gym every day."]);
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

describe("search by meaning (Task 2.2)", () => {
  it("finds a line with no words in common, as a 'meaning' match at its moment", async () => {
    const results = await search(a.cookie, "where is the gimnasio");
    const planning = results.find((r) => r.recording.id === byMeaning)!;
    expect(planning.matches).toEqual([{ kind: "meaning", snippet: "We will reserve the sports hall for Friday.", startMs: 5000 }]);
  });

  it("puts recordings found by their words first; a line found by words isn't repeated as meaning", async () => {
    const results = await search(a.cookie, "gym booking");
    expect(results.map((r) => r.recording.id)).toEqual([byWords, byMeaning]);
    const words = results[0]!.matches;
    expect(words.filter((m) => m.startMs === 0)).toEqual([{ kind: "transcript", snippet: expect.stringContaining("⟦gym⟧"), startMs: 0 }]);
  });

  it("skips lines under 3 words, never shows another user's lines, and finds nothing for an unrelated question", async () => {
    const results = await search(a.cookie, "sports hall");
    expect(results.flatMap((r) => r.matches.map((m) => m.snippet))).not.toContain("Gym.");
    expect(results.map((r) => r.recording.title)).not.toContain("Secret");
    expect(await search(a.cookie, "quantum chromodynamics")).toEqual([]);
  });
});
