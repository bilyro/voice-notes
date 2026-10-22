import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { httpError } from "../../lib/http-error.js";
import type { RecordingsService } from "../recordings/recordings.service.js";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;                  // 32 random bytes in base64url

/** The one route without a session (Task 1.30): anyone with the link reads the notes, nothing else. */
export async function sharedController(app: FastifyInstance, service: RecordingsService) {
  app.get("/shared/:token", async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.params);
    if (!TOKEN.test(token)) throw httpError(404, "Link not found");     // a malformed link looks like any dead one
    // turning the link off must work at once (no copies in caches), and shared notes stay out of search engines
    reply.header("Cache-Control", "no-store").header("X-Robots-Tag", "noindex");
    return service.shared(token);
  });
}
