import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Notes, SearchResult } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { repo } from "../recordings/recordings.repository.js";
import type { JobQueue } from "../recordings/recordings.service.js";
import { markTitle, searchWords, toTsquery } from "./search.service.js";

// integration test: needs Postgres (docker compose up -d) and the migrations
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

const notes = (over: Partial<Notes>): Notes => ({
  title: "", summary: "", keyPoints: [], decisions: [], actionItems: [], proposals: [], openQuestions: [],
  concepts: [], reviewQuestions: [], ideas: [], ...over,
});

/** A recording with transcript lines (10 s apart) and notes. */
async function recording(userId: string, title: string, lines: string[], content: Notes, language: "en" | "uk" = "en") {
  const rec = await repo.create(userId, { title, mode: "meeting", language, mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, lines.map((text, i) => ({ startMs: i * 10_000, endMs: i * 10_000 + 9_000, speaker: null, text })));
  await repo.insertNotes(rec.id, content);
  await repo.update(rec.id, { status: "ready" });
  return rec.id;
}

const search = async (cookie: string, q: string) => {
  const res = await app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent(q)}`, headers: { cookie } });
  return { status: res.statusCode, results: res.statusCode === 200 ? res.json<SearchResult[]>() : [] };
};

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };
let fair: string, trip: string;

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
  a = await signUp();
  b = await signUp();
  fair = await recording(a.userId, "Science fair planning",
    ["We moved the science fair to the gym.", "Pizza for the volunteers on Friday."],
    notes({ summary: "The fair moves to the gym.", decisions: ["Ask the PTA for a budget."] }));
  trip = await recording(a.userId, "Нарада", ["Екскурсія до Львова в п'ятницю."], notes({ summary: "Обговорили екскурсію." }), "uk");
  await recording(b.userId, "Secret science", ["Only user B said quasar."], notes({ summary: "Quasar notes." }));
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

describe("search", () => {
  it("finds a word said in the transcript, with where it was said", async () => {
    const { results } = await search(a.cookie, "volunteer");
    expect(results.map((r) => r.recording.id)).toEqual([fair]);
    expect(results[0]!.matches).toContainEqual({ kind: "transcript", snippet: expect.stringContaining("⟦volunteers⟧"), startMs: 10_000 });
  });

  it("finds a word in the notes and a word in the title", async () => {
    const budget = await search(a.cookie, "budget");
    expect(budget.results[0]!.matches).toEqual([{ kind: "notes", snippet: expect.stringContaining("⟦budget⟧") }]);
    const planning = await search(a.cookie, "planning");
    expect(planning.results[0]!.matches[0]).toEqual({ kind: "title", snippet: "Science fair ⟦planning⟧" });
  });

  it("needs every word, each as a prefix", async () => {
    expect((await search(a.cookie, "scien gym")).results.map((r) => r.recording.id)).toEqual([fair]);
    expect((await search(a.cookie, "science pizza quasar")).results).toEqual([]);
  });

  it("finds Ukrainian words (any case, by prefix)", async () => {
    const { results } = await search(a.cookie, "ЛЬВОВ");
    expect(results.map((r) => r.recording.id)).toEqual([trip]);
    expect(results[0]!.recording.language).toBe("uk");
  });

  it("never shows another user's recordings", async () => {
    expect((await search(a.cookie, "quasar")).results).toEqual([]);
    expect((await search(b.cookie, "science")).results.map((r) => r.recording.title)).toEqual(["Secret science"]);
  });

  it("doesn't match JSON keys, only what the notes say", async () => {
    expect((await search(a.cookie, "decisions")).results).toEqual([]);
    expect((await search(a.cookie, "summary")).results).toEqual([]);
  });

  it("searches only the latest version of the notes", async () => {
    await repo.saveNotesVersion(fair, notes({ summary: "Edited: the fair stays in the hall." }), true);
    const { results } = await search(a.cookie, "budget");
    expect(results).toEqual([]);
  });

  it("rejects a query under 2 characters and requires a session", async () => {
    expect((await search(a.cookie, "a")).status).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/search?q=science" })).statusCode).toBe(401);
  });
});

describe("search helpers", () => {
  it("keeps only letters and digits, so the query can't break to_tsquery", () => {
    expect(searchWords("Science fair, 4:12! & | ' п'ятницю")).toEqual(["science", "fair", "4", "12", "п", "ятницю"]);
    expect(toTsquery(["science", "fair"])).toBe("science:* & fair:*");
  });

  it("marks each word in a title, ignoring case", () => {
    expect(markTitle("Science fair planning", ["fair", "science"])).toBe("⟦Science⟧ ⟦fair⟧ planning");
  });
});
