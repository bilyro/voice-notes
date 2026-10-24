import type { FastifyInstance } from "fastify";
import { AskRequest } from "@vn/shared";
import { requireUser } from "../../plugins/require-user.js";
import type { AskService } from "./ask.service.js";

export async function askController(app: FastifyInstance, service: AskService) {
  // only your own recordings: every query is filtered by req.userId (another user's recordingId → 404)
  app.post("/ask", { preHandler: requireUser }, async (req) => service.ask(req.userId, AskRequest.parse(req.body)));
}
