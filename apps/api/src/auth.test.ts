import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";
import { buildServer } from "./server.js";
import { containsPersonalInfo } from "./auth.js";
import type { JobQueue } from "./modules/recordings/recordings.service.js";

// integration test: needs Postgres (docker compose up -d). The breach check is off here (package.json), see auth-breach.test.ts
const noQueue: JobQueue = { add: async () => undefined, getJob: async () => undefined };
let app: FastifyInstance;
const emails: string[] = [];

const signUp = (password: string, name = "Kim", local = `user-${randomUUID().slice(0, 8)}`) => {
  const email = `${local}@example.com`;
  emails.push(email);
  return app.inject({ method: "POST", url: "/api/auth/sign-up/email", headers: { origin: config.WEB_ORIGIN }, payload: { email, password, name } });
};

beforeAll(async () => { app = await buildServer({ queues: { transcribe: noQueue, notes: noQueue } }); });
afterAll(async () => {
  const users = await db("user").whereIn("email", emails).pluck("id");
  await db("session").whereIn("userId", users).delete();
  await db("account").whereIn("userId", users).delete();
  await db("user").whereIn("id", users).delete();
  await app.close();
  await db.destroy();
});

describe("password rules (Task 1.35)", () => {
  it("needs at least 12 characters and at most 128", async () => {
    const short = await signUp("Lamp-harbor");                                   // 11
    expect(short.statusCode).toBe(400);
    expect(short.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect((await signUp("Lamp-harbor7")).statusCode).toBe(200);                 // 12
    expect((await signUp("x".repeat(129))).json()).toMatchObject({ code: "PASSWORD_TOO_LONG" });
  });

  it("refuses your email's name part or your name inside the password", async () => {
    const byEmail = await signUp("my-rita.walker-secret", "Kim", "rita.walker");
    expect(byEmail.statusCode).toBe(400);
    expect(byEmail.json()).toMatchObject({ code: "PASSWORD_CONTAINS_PERSONAL_INFO", message: "Don't use your name or email in the password." });
    expect((await signUp("QuietOlena-harbor-7", "Olena Koval")).json()).toMatchObject({ code: "PASSWORD_CONTAINS_PERSONAL_INFO" });
  });

  it("applies the same to changing a password", async () => {
    const res = await signUp("Quiet-harbor-lamp-7", "Marta Lis");
    const cookie = [res.headers["set-cookie"]].flat().join(";").match(/better-auth\.session_token=[^;]+/)![0];
    const change = (newPassword: string) => app.inject({ method: "POST", url: "/api/auth/change-password", headers: { origin: config.WEB_ORIGIN, cookie },
      payload: { currentPassword: "Quiet-harbor-lamp-7", newPassword } });
    expect((await change("short-1")).json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect((await change("marta-and-a-long-tail")).json()).toMatchObject({ code: "PASSWORD_CONTAINS_PERSONAL_INFO" });
    expect((await change("Another-quiet-lamp-8")).statusCode).toBe(200);
  });

  it("personal-info check: 4+ letters, any case, ignores short words", () => {
    expect(containsPersonalInfo("XxROMANxx-long-one", "roman@example.com", "")).toBe(true);
    expect(containsPersonalInfo("my-ana-password-1", "ana@example.com", "Ana Li")).toBe(false);   // "ana" is under 4 letters
    expect(containsPersonalInfo("harbor-lamp-quiet", "kim@example.com", "Kim Lee")).toBe(false);
  });
});
