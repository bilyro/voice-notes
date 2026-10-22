import type { FastifyInstance } from "fastify";
import { SearchQuery } from "@vn/shared";
import { requireUser } from "../../plugins/require-user.js";
import type { SearchService } from "./search.service.js";

export async function searchController(app: FastifyInstance, service: SearchService) {
  // only your own recordings: every query is filtered by req.userId
  app.get("/search", { preHandler: requireUser }, async (req) => {
    const { q } = SearchQuery.parse(req.query);
    return service.search(req.userId, q);
  });
}
