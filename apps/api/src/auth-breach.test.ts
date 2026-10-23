import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// the breach check switched on (the other tests run with it off), with the Have I Been Pwned range API faked: no internet needed
process.env.PASSWORD_BREACH_CHECK = "true";
const BREACHED = "Correct-horse-battery-7";
const sha1 = createHash("sha1").update(BREACHED).digest("hex").toUpperCase();
const asked: string[] = [];
let hibpDown = false;
const realFetch = globalThis.fetch;
vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.pwnedpasswords.com/range/")) return realFetch(input, init);
  asked.push(url);
  if (hibpDown) return new Response("down", { status: 503 });
  const prefix = url.slice(-5);
  const body = prefix === sha1.slice(0, 5) ? `${sha1.slice(5)}:4213\r\n0000000000000000000000000000000000A:0` : "0000000000000000000000000000000000B:3";
  return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
});

let app: FastifyInstance;
let db: typeof import("./db.js").db;
const emails: string[] = [];
beforeAll(async () => {
  const { buildServer } = await import("./server.js");                 // imported after the env change above
  ({ db } = await import("./db.js"));
  const noQueue = { add: async () => undefined, getJob: async () => undefined };
  app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } });
});
afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});
const signUp = async (password: string) => {
  const { config } = await import("./config.js");
  const email = `breach-${randomUUID().slice(0, 8)}@example.com`;
  emails.push(email);
  return app.inject({ method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN }, payload: { email, password, name: "Kim" } });
};

describe("breached passwords (Task 1.35)", () => {
  it("refuses a password found in a breach, sending only 5 hash characters", async () => {
    const res = await signUp(BREACHED);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED", message: "This password appeared in a data breach. Choose a different one." });
    expect(asked.at(-1)).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(asked.at(-1)).not.toContain(BREACHED);
  });

  it("accepts a password that isn't in the breach list", async () => {
    expect((await signUp("Unlisted-quiet-lamp-42")).statusCode).toBe(200);
  });

  it("refuses to set a password while the check can't be done (fails closed)", async () => {
    hibpDown = true;
    const res = await signUp("Unlisted-quiet-lamp-43");
    hibpDown = false;
    expect(res.statusCode).toBe(500);
  });
});
