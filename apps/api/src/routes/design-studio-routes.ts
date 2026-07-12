import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  bindDataGovernance,
  buildDecisionTraceTemplate,
  buildIntelligenceStackPlan,
  buildPurposeProtocol,
  scoreDriveShape,
} from "@rarecrest/design-studio";
import { z } from "zod";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { formatZodErrors } from "../validation.js";

const purposeProtocolSchema = z.object({
  mission: z.string().min(1),
  nonNegotiables: z.array(z.string().min(1)),
  successSignals: z.array(z.string().min(1)),
});

const driveShapeSchema = z.object({
  clarity: z.number().min(1).max(10),
  speed: z.number().min(1).max(10),
  resilience: z.number().min(1).max(10),
  leverage: z.number().min(1).max(10),
});

const intelligenceStackSchema = z.object({
  selectedLayers: z.array(z.enum(["signals", "models", "workflows", "governance"])).min(1),
  humanReviewRequired: z.boolean(),
});

const dataGovernanceSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      sensitivity: z.enum(["public", "internal", "restricted", "phi"]),
      encryptedAtRest: z.boolean(),
    }),
  ),
});

const decisionTraceSchema = z.object({
  decisionType: z.string().min(1),
  requiredEvidence: z.array(z.string().min(1)),
});

export function registerDesignStudioRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/design-studio/:entityId/purpose-protocol", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const body = purposeProtocolSchema.parse(request.body);
      return reply.send(
        buildPurposeProtocol({
          entityId,
          mission: body.mission,
          nonNegotiables: body.nonNegotiables,
          successSignals: body.successSignals,
        }),
      );
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/design-studio/:entityId/drive-shape", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const body = driveShapeSchema.parse(request.body);
      return reply.send(scoreDriveShape(body));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/design-studio/:entityId/intelligence-stack", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const body = intelligenceStackSchema.parse(request.body);
      return reply.send(
        buildIntelligenceStackPlan({
          entityId,
          selectedLayers: body.selectedLayers,
          humanReviewRequired: body.humanReviewRequired,
        }),
      );
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/design-studio/:entityId/data-governance", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const body = dataGovernanceSchema.parse(request.body);
      return reply.send({
        entityId,
        binder: bindDataGovernance(body.assets),
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/design-studio/:entityId/decision-trace-template", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const body = decisionTraceSchema.parse(request.body);
      return reply.send(
        buildDecisionTraceTemplate({
          entityId,
          decisionType: body.decisionType,
          requiredEvidence: body.requiredEvidence,
        }),
      );
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
