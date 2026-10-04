import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });

  app.get("/health", async () => ({ ok: true }));

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

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
