import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ActionItemEntry, Notes, SavedNotes } from "@vn/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { buildServer } from "../../server.js";
import { repo } from "../recordings/recordings.repository.js";
import type { JobQueue } from "../recordings/recordings.service.js";

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

const notes = (items: Notes["actionItems"]): Notes => ({
  title: "", summary: "s", keyPoints: [], decisions: [], actionItems: items, proposals: [], openQuestions: [],
  concepts: [], reviewQuestions: [], ideas: [],
});

/** A ready recording whose AI notes have these action items (the notes job's two writes). */
async function recording(userId: string, title: string, items: Notes["actionItems"]) {
  const rec = await repo.create(userId, { title, mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  await repo.insertNotes(rec.id, notes(items));
  await repo.replaceActionItems(rec.id, userId, items);
  await repo.update(rec.id, { status: "ready" });
  return rec.id;
}

const list = async (cookie: string, status?: string) =>
  (await app.inject({ method: "GET", url: `/api/action-items${status ? `?status=${status}` : ""}`, headers: { cookie } })).json<ActionItemEntry[]>();
const patch = (cookie: string, id: string, done: boolean) =>
  app.inject({ method: "PATCH", url: `/api/action-items/${id}`, headers: { cookie }, payload: { done } });

let a: { cookie: string; userId: string }, b: { cookie: string; userId: string };
let older: string, newer: string;

beforeAll(async () => {
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
  a = await signUp();
  b = await signUp();
  older = await recording(a.userId, "Older meeting", [{ text: "Book the gym", owner: "Dana", dueDate: "Monday" }]);
  newer = await recording(a.userId, "Newer meeting", [
    { text: "Send the newsletter", owner: "Sam", dueDate: "Friday" },
    { text: "Order pizza", owner: null, dueDate: null },
    { text: "Call the bus company", owner: "Dana", dueDate: null },
  ]);
  await recording(b.userId, "B's meeting", [{ text: "Secret task", owner: null, dueDate: null }]);
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

describe("action items", () => {
  it("lists only your open items, newest recording first, in the notes' order", async () => {
    const items = await list(a.cookie);
    expect(items.map((i) => `${i.recording.title}: ${i.text}`)).toEqual([
      "Newer meeting: Send the newsletter", "Newer meeting: Order pizza", "Newer meeting: Call the bus company", "Older meeting: Book the gym",
    ]);
    expect(items[0]).toMatchObject({ owner: "Sam", dueDate: "Friday", done: false, recording: { id: newer, mode: "meeting", language: "en" } });
  });

  it("ticks one item: a new notes version with only that item done, then back", async () => {
    const pizza = (await list(a.cookie)).find((i) => i.text === "Order pizza")!;
    expect((await patch(a.cookie, pizza.id, true)).statusCode).toBe(204);

    const latest = await repo.latestNotes(newer);
    expect(latest).toMatchObject({ version: 2, edited_by_user: true });
    expect((latest!.content as SavedNotes).actionItems.map((i) => i.done)).toEqual([false, true, false]);
    expect((await list(a.cookie, "done")).map((i) => i.text)).toEqual(["Order pizza"]);
    expect((await list(a.cookie, "open")).map((i) => i.text)).not.toContain("Order pizza");
    expect(await list(a.cookie, "all")).toHaveLength(4);

    const again = (await list(a.cookie, "done"))[0]!;     // ids change with every save
    expect((await patch(a.cookie, again.id, false)).statusCode).toBe(204);
    expect((await repo.latestNotes(newer))!.version).toBe(3);
    expect((await list(a.cookie, "done"))).toEqual([]);
  });

  it("never shows or changes another user's items (404, like a missing one)", async () => {
    expect((await list(a.cookie, "all")).map((i) => i.text)).not.toContain("Secret task");
    const secret = (await list(b.cookie))[0]!;
    expect((await patch(a.cookie, secret.id, true)).statusCode).toBe(404);
    expect((await patch(a.cookie, "999999999999", true)).statusCode).toBe(404);
    expect((await list(b.cookie))[0]!.done).toBe(false);
  });

  it("refuses to tick when the notes changed since the list was loaded (409)", async () => {
    const gym = (await list(a.cookie)).find((i) => i.text === "Book the gym")!;
    // edited elsewhere: the first item is now a different one, but action_items still has the old row
    await repo.saveNotesVersion(older, notes([{ text: "Book the hall", owner: "Dana", dueDate: "Monday" }]), true);
    expect((await patch(a.cookie, gym.id, true)).statusCode).toBe(409);
  });

  it("validates input and needs a session", async () => {
    expect((await app.inject({ method: "GET", url: "/api/action-items?status=later", headers: { cookie: a.cookie } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/api/action-items/abc", headers: { cookie: a.cookie }, payload: { done: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/action-items" })).statusCode).toBe(401);
  });
});
