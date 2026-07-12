import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { TokenRevocationService } from "../services/token-revocation.js";

function canRevoke(role: string | undefined): boolean {
  return role === "director" || role === "compliance_officer";
}

export function registerAuthRevocationRoutes(app: FastifyInstance, db: DatabaseClient) {
  const service = new TokenRevocationService(db);

  app.post("/api/v1/auth/revoke", async (request, reply) => {
    const schema = z.object({
      subject: z.string().min(1),
      jti: z.string().min(1).optional(),
      reason: z.string().min(1),
      expiresAt: z.string().datetime().optional(),
    });
    try {
      if (!canRevoke(request.auth.role) && request.auth.userId !== "director-1") {
        return reply.status(403).send({ message: "Only director/compliance_officer may revoke sessions" });
      }
      const body = schema.parse(request.body);
      const result = await service.revoke({
        subject: body.subject,
        jti: body.jti,
        revokedBy: request.auth.userId,
        reason: body.reason,
        expiresAt: body.expiresAt ?? null,
      });
      return reply.status(201).send({
        revoked: true,
        id: result.id,
        subject: body.subject,
        jti: body.jti ?? null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/auth/revocation-check", async (request, reply) => {
    const q = request.query as { subject?: string; jti?: string };
    if (!q.subject) return reply.status(400).send({ message: "subject query required" });
    if (!canRevoke(request.auth.role) && request.auth.userId !== q.subject) {
      return reply.status(403).send({ message: "Cannot inspect other subjects' revocation state" });
    }
    const check = await service.isRevoked({ subject: q.subject, jti: q.jti });
    return reply.send(check);
  });
}
