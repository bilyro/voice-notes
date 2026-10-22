import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActionItemPatch, ActionItemStatus } from "@vn/shared";
import { requireUser } from "../../plugins/require-user.js";
import type { ActionItemsService } from "./action-items.service.js";

export async function actionItemsController(app: FastifyInstance, service: ActionItemsService) {
  app.get("/action-items", { preHandler: requireUser }, async (req) => {
    const { status } = z.object({ status: ActionItemStatus.default("open") }).parse(req.query);
    return service.list(req.userId, status);
  });

  app.patch("/action-items/:id", { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(/^\d{1,18}$/) }).parse(req.params);
    const { done } = ActionItemPatch.parse(req.body);
    await service.setDone(req.userId, id, done);
    return reply.status(204).send();
  });
}
