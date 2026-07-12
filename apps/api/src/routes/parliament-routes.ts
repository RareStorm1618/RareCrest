import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { OFFICER_ROLE_TEMPLATES, type OfficerRole } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedDirector } from "../trust.js";
import { readInternalServiceToken } from "../fortress.js";
import { ParliamentError, ParliamentService } from "../services/parliament.js";
import { WikiService } from "../services/wiki.js";

const stakeClassSchema = z.enum(["wiki_promote", "financial_release", "activation", "doctrine"]);
const voteSchema = z.enum(["aye", "nay", "abstain"]);
const stakeholderLensSchema = z.enum(["lp", "patient", "regulator", "engineering", "fiduciary"]);
const sealModeSchema = z.enum(["immediate", "time_lock"]);
/** Officer roles voting in Parliament are the same S2 officer-role vocabulary
 * (@rarecrest/contracts) that agent_studio/officer-routes.ts assigns passports for — a red-team
 * `nay` here is what flips `parliament_sessions.red_team_nay`. */
const officerRoleSchema = z.enum(Object.keys(OFFICER_ROLE_TEMPLATES) as [OfficerRole, ...OfficerRole[]]);

function mapErr(err: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
  if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
  if (err instanceof ParliamentError) return reply.status(err.statusCode).send({ message: err.message });
  throw err;
}

/** Director-only gate for seal/cancel actions — fail-closed, mirrors kill-switch routes. */
function assertDirector(request: FastifyRequest) {
  if (!isVerifiedDirector(request.auth, request.headers as Record<string, unknown>)) {
    throw new ParliamentError("This action requires a verified director", 403);
  }
}

/** Batch time-lock execution is director-triggered or invoked by a trusted internal caller. */
function assertDirectorOrInternal(request: FastifyRequest) {
  if (isVerifiedDirector(request.auth, request.headers as Record<string, unknown>)) return;
  const expected = readInternalServiceToken();
  const provided = (request.headers as Record<string, unknown>)["x-internal-service-token"];
  if (expected && typeof provided === "string" && provided === expected) return;
  throw new ParliamentError(
    "Seal execution requires a verified director or a valid x-internal-service-token",
    403,
  );
}

/**
 * S3: Parliament + Seal — multi-officer, multi-stakeholder-lens deliberation gate with an
 * explicit human seal (immediate or time-locked) in front of wiki_promote, financial_release,
 * activation, and doctrine actions. See `parliamentRequired()` (services/parliament.ts) for the
 * fail-closed default (required under `AUTH_TRUST_MODE=strict` unless explicitly disabled) and
 * `docs/SOLO-ORGANISM.md` for the ceremony this implements.
 */
export function registerParliamentRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
) {
  const parliament = new ParliamentService(db);

  app.post("/api/v1/parliament", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      topic: z.string().min(1),
      stakeClass: stakeClassSchema,
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const session = await parliament.openSession({
        entityId: body.entityId,
        topic: body.topic,
        stakeClass: body.stakeClass,
        createdBy: request.auth.userId,
      });
      return reply.status(201).send(session);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get("/api/v1/parliament", async (request, reply) => {
    const q = request.query as { entityId?: string };
    if (!q.entityId) return reply.status(400).send({ message: "entityId is required" });
    try {
      await assertEntityAccess(db, q.entityId, request.auth);
      const sessions = await parliament.listSessions(q.entityId);
      return reply.send({ sessions });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get("/api/v1/parliament/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await parliament.getSession(id);
      await assertEntityAccess(db, session.entityId, request.auth);
      const [votes, seal] = await Promise.all([
        parliament.listVotes(id),
        parliament.getLatestSealForSession(id),
      ]);
      return reply.send({ session, votes, seal });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post("/api/v1/parliament/:id/votes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      officerRole: officerRoleSchema,
      vote: voteSchema,
      rationale: z.string().optional(),
      stakeholderLens: stakeholderLensSchema,
    });
    try {
      const body = schema.parse(request.body);
      const session = await parliament.getSession(id);
      await assertEntityAccess(db, session.entityId, request.auth);
      const result = await parliament.castVote({
        sessionId: id,
        officerRole: body.officerRole,
        agentId: request.auth.userId,
        vote: body.vote,
        rationale: body.rationale,
        stakeholderLens: body.stakeholderLens,
      });
      return reply.status(201).send(result);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post("/api/v1/parliament/:id/seal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      mode: sealModeSchema,
      executeAfterHours: z.number().positive().max(720).optional(),
      humanInstructionId: z.string().uuid().optional(),
      overrideNote: z.string().optional(),
      payload: z.record(z.unknown()).default({}),
    });
    try {
      const body = schema.parse(request.body);
      const session = await parliament.getSession(id);
      await assertEntityAccess(db, session.entityId, request.auth);
      assertDirector(request);
      const seal = await parliament.sealSession(request.auth.userId, {
        sessionId: id,
        mode: body.mode,
        executeAfterHours: body.executeAfterHours,
        humanInstructionId: body.humanInstructionId,
        overrideNote: body.overrideNote,
        payload: body.payload,
      });
      try {
        await intelligence.appendTrace({
          entityId: session.entityId,
          vertical: request.auth.vertical,
          action: "parliament_seal",
          verdict: "allow",
          payload: { sessionId: session.id, sealId: seal.id, mode: seal.mode, stakeClass: session.stakeClass },
        });
      } catch {
        // Decision-trace append is best-effort — the durable seal row is the source of truth.
      }
      return reply.status(201).send(seal);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post("/api/v1/seals/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const seal = await parliament.getSeal(id);
      const session = await parliament.getSession(seal.sessionId);
      await assertEntityAccess(db, session.entityId, request.auth);
      assertDirector(request);
      const cancelled = await parliament.cancelSeal(id);
      return reply.send(cancelled);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post("/api/v1/seals/due/execute", async (request, reply) => {
    try {
      assertDirectorOrInternal(request);
      const wiki = new WikiService(db);
      const due = await parliament.listDueSeals();
      const results: Array<{ sealId: string; sessionId: string; status: "executed" | "failed"; detail?: string }> = [];

      for (const seal of due) {
        try {
          const session = await parliament.getSession(seal.sessionId);
          const executed = await parliament.executeSeal(seal.id);

          if (
            session.stakeClass === "wiki_promote" &&
            typeof executed.payload.namespace === "string" &&
            typeof executed.payload.slug === "string"
          ) {
            try {
              await wiki.promote({
                namespace: executed.payload.namespace,
                slug: executed.payload.slug,
                actorId: executed.sealedBy,
                reason: `Parliament time-lock execute (seal ${executed.id})`,
                requireDualControl: false,
              });
            } catch {
              // Best-effort: the seal itself is still recorded as executed; promote can be retried.
            }
          }

          try {
            await intelligence.appendTrace({
              entityId: session.entityId,
              vertical: request.auth.vertical,
              action: "parliament_seal_execute",
              verdict: "allow",
              payload: { sealId: executed.id, sessionId: session.id, stakeClass: session.stakeClass },
            });
          } catch {
            // best-effort decision trace
          }

          results.push({ sealId: executed.id, sessionId: session.id, status: "executed" });
        } catch (err) {
          results.push({
            sealId: seal.id,
            sessionId: seal.sessionId,
            status: "failed",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return reply.send({ executed: results.filter((r) => r.status === "executed").length, results });
    } catch (err) {
      return mapErr(err, reply);
    }
  });
}
