import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { config } from "./config.js";
import { registerAuthRoutes } from "./auth.js";
import { requireUser } from "./plugins/require-user.js";
import { repo } from "./modules/recordings/recordings.repository.js";
import { RecordingsService, type Queues } from "./modules/recordings/recordings.service.js";
import { recordingsController } from "./modules/recordings/recordings.controller.js";
import { searchRepo } from "./modules/search/search.repository.js";
import { SearchService } from "./modules/search/search.service.js";
import { searchController } from "./modules/search/search.controller.js";

async function realQueues(app: FastifyInstance): Promise<Queues> {
  const { queues, connection } = await import("./queue/queues.js");
  app.addHook("onClose", async () => {
    await Promise.all([queues.transcribe.close(), queues.notes.close()]);
    await connection.quit();
  });
  return queues;
}

export async function buildServer(opts: { queues?: Queues } = {}) {
  const app = Fastify({ logger: true });
  // dev only (production is same-origin behind Caddy); PUT/DELETE must be listed, the default is GET,HEAD,POST
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "DELETE"] });

  // set before registering routes, so the /api plugin below inherits it
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: "Invalid request", issues: err.issues });
    }
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

  // tests pass fake queues; only the real server opens a Redis connection (lazy import)
  const queues = opts.queues ?? (await realQueues(app));
  const recordings = new RecordingsService(repo, queues);

  // all app routes live under /api, the same in dev and production (Caddy routes /api/* here)
  await app.register(
    async (api) => {
      api.get("/health", async () => ({ ok: true }));
      api.get("/me", { preHandler: requireUser }, async (req) => ({ userId: req.userId }));
      // the web app can't read .env: it needs to know when the free (no privacy guarantee) stack is on
      api.get("/app-config", { preHandler: requireUser }, async () => ({
        freeMode: config.STT_PROVIDER === "groq" || config.NOTES_PROVIDER === "groq",
      }));
      await recordingsController(api, recordings);
      await searchController(api, new SearchService(searchRepo));
    },
    { prefix: "/api" },
  );

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
