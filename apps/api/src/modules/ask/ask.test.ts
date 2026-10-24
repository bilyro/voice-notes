import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { NOT_FOUND_ANSWER, type AskAnswer } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { FakeAnswerer } from "../../ai/answers/fake-answerer.js";
import { embedJob } from "../../jobs/embed.job.js";
import { repo } from "../recordings/recordings.repository.js";
import type { JobQueue } from "../recordings/recordings.service.js";
import { cite } from "./ask.service.js";

// integration test: needs Postgres (docker compose up -d) and the migrations; the fake embedder (package.json) and
// a fake answerer, so lines are found by their rare words here (search by meaning has its own tests, Task 2.2)
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };
const fake = new FakeAnswerer();
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
/** Lines 10 s apart. */
async function recording(userId: string, title: string, lines: string[]) {
  const rec = await repo.create(userId, { title, mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.replaceSegments(rec.id, lines.map((text, i) => ({ startMs: i * 10_000, endMs: i * 10_000 + 9_000, speaker: null, text })));
  await embedJob(rec.id);
  return rec.id;
}
const ask = (cookie: string | undefined, payload: object) =>
  app.inject({ method: "POST", url: "/api/ask", headers: cookie ? { cookie } : {}, payload });

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };
let planning: string, lesson: string, secret: string;
beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue }, answerer: fake });
  a = await signUp();
  b = await signUp();
  planning = await recording(a.userId, "Planning", [
    "Welcome everyone to the meeting today.", "Item one is the school trip budget.", "The trip costs nine hundred per child.",
    "Next we talk about transport for the trip.", "Dan will book the minibus repair by Friday.", "It would cost eleven hundred pounds.",
    "Any other business for today?", "Thanks everyone for coming in.",
  ]);
  lesson = await recording(a.userId, "Vaccines", ["Today we talk about how vaccines work.", "A vaccine trains the immune system safely.", "The minibus for the lab visit leaves at nine."]);
  secret = await recording(b.userId, "Secret", ["The minibus alarm code is quasar four.", "Only user B knows about the quasar code."]);
});
beforeEach(() => { fake.last = undefined; });
afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  await db("recordings").whereIn("user_id", users).delete();
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});

describe("ask your recordings (Task 2.3)", () => {
  it("answers from your lines, each with two lines before and after, and lists only the cited sources, renumbered", async () => {
    const res = await ask(a.cookie, { question: "Who books the minibus repair?" });
    expect(res.statusCode).toBe(200);
    const body = res.json<AskAnswer>();
    const given = fake.last!.excerpts;
    // the fake cites the last excerpt, then the first: they become [1] and [2] in that order
    expect(body.found).toBe(true);
    expect(body.answer).toBe(given.length > 1 ? "It's in the recording[1][2]." : "It's in the recording[1].");
    const trip = given.find((e) => e.text.includes("Dan will book the minibus repair by Friday."))!;
    expect(trip.text.split("\n")).toEqual([
      "The trip costs nine hundred per child.", "Next we talk about transport for the trip.", "Dan will book the minibus repair by Friday.",
      "It would cost eleven hundred pounds.", "Any other business for today?",
    ]);
    expect(trip).toMatchObject({ title: "Planning", time: "0:20" });
    const source = body.sources.find((s) => s.recordingId === planning)!;
    expect(source).toMatchObject({ title: "Planning", language: "en", startMs: 20_000 });
    expect(source.text).toContain("Dan will book the minibus repair by Friday. It would cost eleven hundred pounds.");
    expect(body.sources.map((s) => s.n)).toEqual(body.sources.map((_, i) => i + 1));
  });

  it("never reads another user's lines", async () => {
    await ask(a.cookie, { question: "What is the quasar alarm code for the minibus?" });
    expect(fake.last!.excerpts.map((e) => e.title)).not.toContain("Secret");
    expect((await ask(a.cookie, { question: "minibus", recordingId: secret })).statusCode).toBe(404);
  });

  it("about one recording: only its lines", async () => {
    const res = await ask(a.cookie, { question: "When does the minibus leave?", recordingId: lesson });
    expect(res.statusCode).toBe(200);
    expect(new Set(fake.last!.excerpts.map((e) => e.title))).toEqual(new Set(["Vaccines"]));
    expect(res.json<AskAnswer>().sources.every((s) => s.recordingId === lesson)).toBe(true);
  });

  it("says so when the model finds no answer, or when nothing is close enough to ask it", async () => {
    expect((await ask(a.cookie, { question: "Did we say nothing about the minibus?" })).json()).toEqual({ found: false, answer: NOT_FOUND_ANSWER, sources: [] });
    fake.last = undefined;
    expect((await ask(a.cookie, { question: "Zebra xylophone?" })).json()).toEqual({ found: false, answer: NOT_FOUND_ANSWER, sources: [] });
    expect(fake.last).toBeUndefined();                       // no lines → the model isn't asked
  });

  it("refuses a bad question, a bad recording id and a signed-out request", async () => {
    expect((await ask(a.cookie, { question: " " })).statusCode).toBe(400);
    expect((await ask(a.cookie, { question: "x".repeat(501) })).statusCode).toBe(400);
    expect((await ask(a.cookie, { question: "minibus?", recordingId: "abc" })).statusCode).toBe(400);
    expect((await ask(a.cookie, { question: "minibus?", recordingId: randomUUID() })).statusCode).toBe(404);
    expect((await ask(undefined, { question: "minibus?" })).statusCode).toBe(401);
  });

  it("a busy or failing model gives a clear 429 or 502", async () => {
    const spy = vi.spyOn(fake, "answer");
    spy.mockRejectedValueOnce(Object.assign(new Error("rate limit"), { status: 429 }));
    const busy = await ask(a.cookie, { question: "Who books the minibus repair?" });
    expect([busy.statusCode, busy.json().error]).toEqual([429, "Too many questions at once. Wait a minute, then ask again."]);
    spy.mockRejectedValueOnce(new Error("socket hang up"));
    const failed = await ask(a.cookie, { question: "Who books the minibus repair?" });
    expect([failed.statusCode, failed.json().error]).toEqual([502, "The answer couldn't be written just now. Try again in a moment."]);
    spy.mockRestore();
  });
});

describe("cite", () => {
  const found = [1, 2, 3].map((i) => ({ recordingId: `r${i}`, title: `T${i}`, language: "en" as const, startMs: i, text: `t${i}`, lines: [`t${i}`], date: "d" }));
  it("renumbers citations in the order they appear, splits lists, drops unknown numbers and repeats", () => {
    expect(cite("A [3]. B [1, 3]. C [9]. D [2][2].", found)).toEqual({
      answer: "A[1]. B[2][1]. C. D[3].",
      sources: [
        { n: 1, recordingId: "r3", title: "T3", language: "en", startMs: 3, text: "t3" },
        { n: 2, recordingId: "r1", title: "T1", language: "en", startMs: 1, text: "t1" },
        { n: 3, recordingId: "r2", title: "T2", language: "en", startMs: 2, text: "t2" },
      ],
    });
  });
});
