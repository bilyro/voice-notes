import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateRecordingInput, SavedNotes } from "@vn/shared";
import { requireUser } from "../../plugins/require-user.js";
import { RecordingsService } from "./recordings.service.js";

const IdParams = z.object({ id: z.uuid() });

export async function recordingsController(app: FastifyInstance, service: RecordingsService) {
  // accept raw audio bytes for chunk uploads
  app.addContentTypeParser(
    ["application/octet-stream", "audio/webm", "audio/mp4", "audio/ogg"],
    { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post("/recordings", { preHandler: requireUser }, async (req, reply) => {
    const input = CreateRecordingInput.parse(req.body);
    const rec = await service.create(req.userId, input);
    return reply.status(201).send({ id: rec.id });
  });

  app.put("/recordings/:id/chunks/:index", { preHandler: requireUser }, async (req, reply) => {
    const { id, index } = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0) }).parse(req.params);
    const body = z.instanceof(Buffer).refine((b) => b.length > 0, "Empty chunk").parse(req.body);
    await service.saveChunk(req.userId, id, index, body);
    return reply.status(204).send();
  });

  app.post("/recordings/:id/finish", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = z.object({ chunkCount: z.number().int().min(1), durationMs: z.number().int() }).parse(req.body);
    await service.finish(req.userId, id, body);
    return { ok: true };
  });

  app.get("/recordings", { preHandler: requireUser }, async (req) => service.list(req.userId));

  app.get("/recordings/:id", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    return service.get(req.userId, id);
  });

  app.get("/recordings/:id/audio", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    return { url: await service.audioUrl(req.userId, id) };
  });

  app.put("/recordings/:id/notes", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const version = await service.saveNotes(req.userId, id, SavedNotes.parse(req.body));
    return { version };
  });

  app.post("/recordings/:id/retry", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    await service.retry(req.userId, id);
    return { ok: true };
  });

  // Task 1.30: the read-only link to the notes (the public side is modules/shared)
  app.post("/recordings/:id/share", { preHandler: requireUser }, async (req) => {
    const { id } = IdParams.parse(req.params);
    return service.share(req.userId, id);
  });

  app.delete("/recordings/:id/share", { preHandler: requireUser }, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await service.unshare(req.userId, id);
    return reply.status(204).send();
  });

  app.delete("/recordings/:id", { preHandler: requireUser }, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await service.delete(req.userId, id);
    return reply.status(204).send();
  });
}
