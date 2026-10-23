import type { FastifyInstance } from "fastify";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins";
import { fromNodeHeaders } from "better-auth/node";
import { Pool } from "pg";
import { config } from "./config.js";

// Task 1.35: length and breach checks (NIST SP 800-63B), no forced symbols or rotation
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const SETS_A_PASSWORD = new Set(["/sign-up/email", "/change-password"]);

/** Your email's name part or a word of your name (4+ letters) inside the password, in any case. */
export function containsPersonalInfo(password: string, email = "", name = "") {
  const p = password.toLowerCase();
  const words = [email.split("@")[0] ?? "", ...name.split(/\s+/)].map((w) => w.toLowerCase()).filter((w) => w.length >= 4);
  return words.some((w) => p.includes(w));
}

export const auth = betterAuth({
  database: new Pool({ connectionString: config.DATABASE_URL }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  trustedOrigins: [config.WEB_ORIGIN],
  emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: PASSWORD_MAX },
  // refuses passwords found in known data breaches; only 5 characters of the password's SHA-1 hash leave the server
  plugins: [haveIBeenPwned({ enabled: config.PASSWORD_BREACH_CHECK, customPasswordCompromisedMessage: "This password appeared in a data breach. Choose a different one." })],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!SETS_A_PASSWORD.has(ctx.path)) return;
      const body = (ctx.body ?? {}) as { password?: string; newPassword?: string; email?: string; name?: string };
      const password = ctx.path === "/change-password" ? body.newPassword : body.password;
      if (!password) return;
      let { email, name } = body;
      if (ctx.path === "/change-password") ({ email, name } = (await getSessionFromCtx(ctx))?.user ?? {});
      if (containsPersonalInfo(password, email, name)) {
        throw APIError.from("BAD_REQUEST", { message: "Don't use your name or email in the password.", code: "PASSWORD_CONTAINS_PERSONAL_INFO" });
      }
    }),
  },
});

/** Mounts Better Auth's handler under /api/auth/* (official Fastify integration). */
export function registerAuthRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(req, reply) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const response = await auth.handler(
        new Request(url, {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          ...(req.body ? { body: JSON.stringify(req.body) } : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
