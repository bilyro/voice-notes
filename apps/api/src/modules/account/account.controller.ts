import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../../plugins/require-user.js";
import type { AccountService } from "./account.service.js";

export async function accountController(app: FastifyInstance, service: AccountService) {
  app.get("/account/export", { preHandler: requireUser }, async (req, reply) => {
    const data = await service.export(req.userId);
    const day = data.exportedAt.slice(0, 10);
    return reply.header("Content-Disposition", `attachment; filename="voice-notes-export-${day}.json"`).header("Cache-Control", "no-store").send(data);
  });

  app.delete("/account", { preHandler: requireUser }, async (req, reply) => {
    const { email } = z.object({ email: z.string() }).parse(req.body);
    await service.deleteAccount(req.userId, email);
    return reply.status(204).send();
  });
}
