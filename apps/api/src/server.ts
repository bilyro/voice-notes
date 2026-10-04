import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerAuthRoutes } from "./auth.js";
import { requireUser } from "./plugins/require-user.js";

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });

  // set before registering routes, so the /api plugin below inherits it
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    // Fastify types `err` as unknown: anything can be thrown, so narrow before reading fields
    const status =
      err instanceof Error && "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    reply.status(status).send({ error: status === 500 ? "Internal error" : message });
  });

  // Better Auth's route is already /api/auth/*, so it stays outside the /api prefix
  registerAuthRoutes(app);

  // all app routes live under /api, the same in dev and production (Caddy routes /api/* here)
  await app.register(
    async (api) => {
      api.get("/health", async () => ({ ok: true }));
      api.get("/me", { preHandler: requireUser }, async (req) => ({ userId: req.userId }));
    },
    { prefix: "/api" },
  );

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
