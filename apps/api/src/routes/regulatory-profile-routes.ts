import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { ENTITY_TYPES } from "@rarecrest/portfolio";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { RegulatoryProfileService } from "../services/regulatory-profile.js";
import { isDirectorScope } from "./portfolio-routes.js";

const entityTypeSchema = z.enum([
  "nonprofit",
  "for_profit_platform",
  "fund",
  "token_protocol",
  "holding",
]);

export function registerRegulatoryProfileRoutes(app: FastifyInstance, db: DatabaseClient) {
  const service = new RegulatoryProfileService(db);

  app.get("/api/v1/portfolio/entity-types", async (_request, reply) => {
    return reply.send({ entityTypes: ENTITY_TYPES });
  });

  app.get("/api/v1/entities/:id/regulatory-profile", async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    const profile = await service.getProfile(id, scope);
    if (!profile) return reply.status(404).send({ message: "Entity not found" });
    return reply.send(profile);
  });

  app.patch("/api/v1/entities/:id/entity-type", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ entityType: entityTypeSchema });
    try {
      const body = schema.parse(request.body);
      const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
      const profile = await service.setEntityType(id, body.entityType, request.auth.userId, scope);
      if (!profile) return reply.status(404).send({ message: "Entity not found" });
      return reply.send(profile);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/regulatory-profile/regimes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ regime: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
      const profile = await service.addRegimeToProfile(id, body.regime, request.auth.userId, scope);
      if (!profile) return reply.status(404).send({ message: "Entity not found" });
      return reply.send(profile);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.delete("/api/v1/entities/:id/regulatory-profile/regimes/:regime", async (request, reply) => {
    const { id, regime } = request.params as { id: string; regime: string };
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    const profile = await service.removeRegimeFromProfile(
      id,
      decodeURIComponent(regime),
      request.auth.userId,
      scope,
    );
    if (!profile) return reply.status(404).send({ message: "Entity not found" });
    return reply.send(profile);
  });

  app.get("/api/v1/entities/:id/regulatory-profile/changes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    const profile = await service.getProfile(id, scope);
    if (!profile) return reply.status(404).send({ message: "Entity not found" });
    const changes = await service.listRegimeChanges(id);
    return reply.send({ entityId: id, changes });
  });
}
