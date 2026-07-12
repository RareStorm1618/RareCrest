import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { ParliamentError, ParliamentService } from "../services/parliament.js";

/**
 * EXO Wave A doctrine stub: rather than a full doctrine registry (future work), this route
 * gates the `doctrine` Parliament stake class — the same `resolveOrSealForAction` pattern as
 * `wiki_promote`/`financial_release`/`activation` — and hands back the resolved session/seal
 * for a future doctrine UI to key off of. It writes nothing to the wiki or any doctrine table
 * itself; it only proves a `doctrine` session is `sealed` (or auto-seals a `ready_for_seal`
 * one inline) for the given entity.
 */
export function registerDoctrineRoutes(app: FastifyInstance, db: DatabaseClient) {
  const parliament = new ParliamentService(db);

  app.post("/api/v1/doctrine/seal-gate", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      parliamentSessionId: z.string().uuid(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const { session, seal } = await parliament.resolveOrSealForAction({
        sessionId: body.parliamentSessionId,
        stakeClass: "doctrine",
        actorId: request.auth.userId,
        payload: { entityId: body.entityId },
      });
      return reply.send({ session, seal });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof ParliamentError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
