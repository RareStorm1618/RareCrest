import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { enforceTenancy } from "../auth.js";
import { mapEntityRow, PortfolioService } from "../services/portfolio.js";
import { isDirectorScope } from "./portfolio-routes.js";

export function registerEntityRegistryRoutes(app: FastifyInstance, db: DatabaseClient) {
  const portfolio = new PortfolioService(db);

  app.get("/api/v1/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    if (!isDirectorScope(request.auth, request)) {
      enforceTenancy(request.auth, request.auth.vertical);
    }
    const row = await portfolio.getEntityById(id, scope);
    if (!row) return reply.status(404).send({ message: "Entity not found" });
    return reply.send(mapEntityRow(row));
  });

  app.delete("/api/v1/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    enforceTenancy(request.auth, request.auth.vertical);
    const result = await db.query(
      `UPDATE rarecrest.entities SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND vertical = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, request.auth.vertical],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Entity not found" });
    return reply.status(204).send();
  });
}
