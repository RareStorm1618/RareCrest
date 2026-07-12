import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { MigrationRecommenderService } from "../services/migration-recommender.js";
import { IMMUNE_SYSTEM_DESCRIPTORS } from "@rarecrest/diagnostics";

const immuneSchema = z.enum(["weak", "moderate", "strong"]);

export function registerMigrationRoutes(app: FastifyInstance, db: DatabaseClient) {
  const recommender = new MigrationRecommenderService(db);

  app.post("/api/v1/diagnostics/:entityId/migration-recommend", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      immuneSystem: immuneSchema,
      headcount: z.number().int().min(1).max(1_000_000),
      maturityLevel: z.number().int().min(0).max(5),
    });
    try {
      const body = schema.parse(request.body);
      const result = await recommender.recommend(entityId, body);
      return reply.send({
        ...result,
        immuneSystemDescriptors: IMMUNE_SYSTEM_DESCRIPTORS,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/migration-recommend/descriptors", async (_request, reply) => {
    return reply.send({ immuneSystemDescriptors: IMMUNE_SYSTEM_DESCRIPTORS });
  });
}
