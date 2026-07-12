import type { FastifyInstance } from "fastify";
import type { VerticalKey } from "@rarecrest/contracts";
import { z } from "zod";
import type { AuthContext } from "../auth.js";
import { formatZodErrors, verticalSchema } from "../validation.js";
import { mapEntityRow, PortfolioService } from "../services/portfolio.js";

const entityTypeSchema = z.enum([
  "nonprofit",
  "for_profit_platform",
  "fund",
  "token_protocol",
  "holding",
]);

const registerEntitySchema = z.object({
  name: z.string().min(1).max(255),
  vertical: verticalSchema,
  tenancyKey: z.string().min(1).max(255),
  entityType: entityTypeSchema,
  isHoldingEntity: z.boolean().default(false),
  mode: z.string().default("assessment"),
  band: z.string().default("unknown"),
});

/** Director role sees all verticals in portfolio roll-up */
export function isDirectorScope(auth: AuthContext, request: { headers: Record<string, unknown> }): boolean {
  const role = request.headers["x-user-role"];
  return role === "director" || auth.userId === "director-1";
}

export function registerPortfolioRoutes(app: FastifyInstance, portfolio: PortfolioService) {
  app.get("/api/v1/portfolio/status", async (request, reply) => {
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    const rollup = await portfolio.getRollup(scope);
    return reply.send(rollup);
  });

  app.post("/api/v1/portfolio/entities", async (request, reply) => {
    try {
      const body = registerEntitySchema.parse(request.body);
      if (!isDirectorScope(request.auth, request) && body.vertical !== request.auth.vertical) {
        return reply.status(403).send({ message: "Cross-vertical registration denied" });
      }
      const row = await portfolio.registerEntity(body);
      return reply.status(201).send(mapEntityRow(row));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/portfolio/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
    const row = await portfolio.getEntityById(id, scope);
    if (!row) return reply.status(404).send({ message: "Entity not found" });
    const flags = await portfolio.listAttentionFlags(id);
    const relationships = await portfolio.listRelationships(id);
    return reply.send({ ...mapEntityRow(row), attentionFlags: flags, relationships });
  });

  app.patch("/api/v1/portfolio/entities/:id/regulatory-profile", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ regimes: z.array(z.string().min(1)) });
    try {
      const body = schema.parse(request.body);
      const scope = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
      const row = await portfolio.updateRegulatoryProfile(id, body.regimes, scope);
      if (!row) return reply.status(404).send({ message: "Entity not found" });
      return reply.send(mapEntityRow(row));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/portfolio/entities/:id/attention-flags", async (request, reply) => {
    const { id } = request.params as { id: string };
    const flags = await portfolio.listAttentionFlags(id);
    return reply.send(flags);
  });

  app.post("/api/v1/portfolio/relationships", async (request, reply) => {
    const schema = z.object({
      fromEntityId: z.string().uuid(),
      toEntityId: z.string().uuid(),
      relationshipType: z.string().min(1),
      constraintNote: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const rel = await portfolio.addRelationship(
        body.fromEntityId,
        body.toEntityId,
        body.relationshipType,
        body.constraintNote,
      );
      return reply.status(201).send(rel);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
