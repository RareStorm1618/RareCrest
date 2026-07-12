import type { DatabaseClient } from "@rarecrest/db";
import { trustMode } from "../auth.js";
import { requireHumanInstruction, attachCorrelationId, PolicyGatewayError } from "../policy/index.js";

export class ParliamentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ParliamentError";
  }
}

export type StakeClass = "wiki_promote" | "financial_release" | "activation" | "doctrine";
export type SessionStatus = "open" | "ready_for_seal" | "sealed" | "rejected" | "expired";
export type VoteChoice = "aye" | "nay" | "abstain";
export type StakeholderLens = "lp" | "patient" | "regulator" | "engineering" | "fiduciary";
export type SealMode = "immediate" | "time_lock";

export interface ParliamentSessionRow {
  id: string;
  entityId: string;
  topic: string;
  stakeClass: StakeClass;
  status: SessionStatus;
  createdBy: string;
  redTeamNay: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParliamentVoteRow {
  id: string;
  sessionId: string;
  officerRole: string;
  agentId: string;
  vote: VoteChoice;
  rationale: string;
  stakeholderLens: StakeholderLens;
  createdAt: string;
}

export interface SealRow {
  id: string;
  sessionId: string;
  sealedBy: string;
  sealedAt: string;
  mode: SealMode;
  executeAfter: string | null;
  cancelledAt: string | null;
  executedAt: string | null;
  humanInstructionId: string | null;
  overrideNote: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}

const DEFAULT_MIN_VOTES = 2;
const DEFAULT_TIME_LOCK_HOURS = 4;

const SESSION_COLUMNS = `id, entity_id AS "entityId", topic, stake_class AS "stakeClass", status,
                created_by AS "createdBy", red_team_nay AS "redTeamNay",
                created_at AS "createdAt", updated_at AS "updatedAt"`;

const VOTE_COLUMNS = `id, session_id AS "sessionId", officer_role AS "officerRole", agent_id AS "agentId",
                vote, rationale, stakeholder_lens AS "stakeholderLens", created_at AS "createdAt"`;

const SEAL_COLUMNS = `id, session_id AS "sessionId", sealed_by AS "sealedBy", sealed_at AS "sealedAt",
                mode, execute_after AS "executeAfter", cancelled_at AS "cancelledAt",
                executed_at AS "executedAt", human_instruction_id AS "humanInstructionId",
                override_note AS "overrideNote", correlation_id AS "correlationId", payload`;

function minVotes(): number {
  const raw = Number(process.env.PARLIAMENT_MIN_VOTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MIN_VOTES;
}

/**
 * Whether a Parliament session + Seal is required before a wiki_promote/financial_release
 * (etc.) action may proceed. Explicit `PARLIAMENT_REQUIRED=false` always wins — this is the
 * dev-loopback / test opt-out. Otherwise required when `PARLIAMENT_REQUIRED=true` OR
 * `AUTH_TRUST_MODE=strict` (fail-closed default for any strict deployment).
 */
export function parliamentRequired(): boolean {
  const raw = process.env.PARLIAMENT_REQUIRED?.trim().toLowerCase();
  if (raw === "false") return false;
  if (raw === "true") return true;
  return trustMode() === "strict";
}

function mapSession(row: Record<string, unknown>): ParliamentSessionRow {
  return {
    id: String(row.id),
    entityId: String(row.entityId),
    topic: String(row.topic),
    stakeClass: row.stakeClass as StakeClass,
    status: row.status as SessionStatus,
    createdBy: String(row.createdBy),
    redTeamNay: Boolean(row.redTeamNay),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapVote(row: Record<string, unknown>): ParliamentVoteRow {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    officerRole: String(row.officerRole),
    agentId: String(row.agentId),
    vote: row.vote as VoteChoice,
    rationale: String(row.rationale ?? ""),
    stakeholderLens: row.stakeholderLens as StakeholderLens,
    createdAt: String(row.createdAt),
  };
}

function mapSeal(row: Record<string, unknown>): SealRow {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    sealedBy: String(row.sealedBy),
    sealedAt: String(row.sealedAt),
    mode: row.mode as SealMode,
    executeAfter: row.executeAfter ? String(row.executeAfter) : null,
    cancelledAt: row.cancelledAt ? String(row.cancelledAt) : null,
    executedAt: row.executedAt ? String(row.executedAt) : null,
    humanInstructionId: row.humanInstructionId ? String(row.humanInstructionId) : null,
    overrideNote: row.overrideNote ? String(row.overrideNote) : null,
    correlationId: row.correlationId ? String(row.correlationId) : null,
    payload: (row.payload as Record<string, unknown>) ?? {},
  };
}

/**
 * Parliament + Seal: a multi-officer, multi-stakeholder-lens deliberation gate in front of
 * consequential actions (wiki promote to canon, financial release, activation, doctrine
 * changes). A session collects votes from distinct `stakeholder_lens` values; once enough
 * distinct lenses have voted it becomes `ready_for_seal`. A human director then explicitly
 * seals it (immediately, or with a time-locked cooling-off window that can be cancelled before
 * it executes). A red-team `nay` vote never blocks by itself, but sealing over one requires an
 * explicit `overrideNote` — the override is always on the human record, never silent.
 */
export class ParliamentService {
  constructor(private db: DatabaseClient) {}

  async openSession(input: {
    entityId: string;
    topic: string;
    stakeClass: StakeClass;
    createdBy: string;
  }): Promise<ParliamentSessionRow> {
    const result = await this.db.query(
      `INSERT INTO rarecrest.parliament_sessions (entity_id, topic, stake_class, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SESSION_COLUMNS}`,
      [input.entityId, input.topic, input.stakeClass, input.createdBy],
    );
    return mapSession(result.rows[0]);
  }

  async getSession(id: string): Promise<ParliamentSessionRow> {
    const result = await this.db.query(
      `SELECT ${SESSION_COLUMNS} FROM rarecrest.parliament_sessions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new ParliamentError("Parliament session not found", 404);
    return mapSession(row);
  }

  async listSessions(entityId: string): Promise<ParliamentSessionRow[]> {
    const result = await this.db.query(
      `SELECT ${SESSION_COLUMNS} FROM rarecrest.parliament_sessions
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [entityId],
    );
    return result.rows.map(mapSession);
  }

  async listVotes(sessionId: string): Promise<ParliamentVoteRow[]> {
    const result = await this.db.query(
      `SELECT ${VOTE_COLUMNS} FROM rarecrest.parliament_votes WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );
    return result.rows.map(mapVote);
  }

  /**
   * Record (or update) one officer's vote for one stakeholder lens on a session, then
   * recompute session status: `ready_for_seal` once distinct `stakeholder_lens` votes reach
   * `PARLIAMENT_MIN_VOTES` (default 2), and `red_team_nay` whenever any `red_team` officer has
   * an outstanding `nay` vote recorded.
   */
  async castVote(input: {
    sessionId: string;
    officerRole: string;
    agentId: string;
    vote: VoteChoice;
    rationale?: string;
    stakeholderLens: StakeholderLens;
  }): Promise<{ session: ParliamentSessionRow; vote: ParliamentVoteRow }> {
    const session = await this.getSession(input.sessionId);
    if (session.status !== "open" && session.status !== "ready_for_seal") {
      throw new ParliamentError(`Cannot vote on a session with status=${session.status}`, 409);
    }

    const inserted = await this.db.query(
      `INSERT INTO rarecrest.parliament_votes
         (session_id, officer_role, agent_id, vote, rationale, stakeholder_lens)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, agent_id, stakeholder_lens) DO UPDATE SET
         officer_role = EXCLUDED.officer_role,
         vote = EXCLUDED.vote,
         rationale = EXCLUDED.rationale
       RETURNING ${VOTE_COLUMNS}`,
      [
        input.sessionId,
        input.officerRole,
        input.agentId,
        input.vote,
        input.rationale ?? "",
        input.stakeholderLens,
      ],
    );

    const allVotes = await this.listVotes(input.sessionId);
    const distinctLenses = new Set(allVotes.map((v) => v.stakeholderLens)).size;
    const redTeamNay = allVotes.some((v) => v.officerRole === "red_team" && v.vote === "nay");
    const nextStatus: SessionStatus =
      session.status === "open" && distinctLenses >= minVotes() ? "ready_for_seal" : session.status;

    const updated = await this.db.query(
      `UPDATE rarecrest.parliament_sessions
       SET status = $2, red_team_nay = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING ${SESSION_COLUMNS}`,
      [input.sessionId, nextStatus, redTeamNay],
    );

    return { session: mapSession(updated.rows[0]), vote: mapVote(inserted.rows[0]) };
  }

  /**
   * A human director seals a `ready_for_seal` session. `immediate` seals execute right away;
   * `time_lock` seals record `execute_after` (now + hours, default 4) and are picked up later
   * by `listDueSeals`/`executeSeal`. A red-team nay on the session requires an explicit
   * `overrideNote` — sealing is refused otherwise. When a `humanInstructionId` is supplied for
   * a `financial_release`/`wiki_promote` session it is verified server-side (never trusted bare).
   */
  async sealSession(
    director: string,
    input: {
      sessionId: string;
      mode: SealMode;
      executeAfterHours?: number;
      humanInstructionId?: string;
      overrideNote?: string;
      payload?: Record<string, unknown>;
      correlationId?: string;
    },
  ): Promise<SealRow> {
    const session = await this.getSession(input.sessionId);
    if (session.status !== "ready_for_seal") {
      throw new ParliamentError(`Session must be ready_for_seal to seal (status=${session.status})`, 409);
    }
    if (session.redTeamNay && !input.overrideNote?.trim()) {
      throw new ParliamentError("Red-team nay recorded — sealing requires an explicit overrideNote", 403);
    }

    if (
      input.humanInstructionId &&
      (session.stakeClass === "financial_release" || session.stakeClass === "wiki_promote")
    ) {
      try {
        await requireHumanInstruction(this.db, input.humanInstructionId, session.entityId);
      } catch (err) {
        if (err instanceof PolicyGatewayError) {
          throw new ParliamentError(err.message, err.statusCode);
        }
        throw err;
      }
    }

    const executeAfter =
      input.mode === "time_lock"
        ? new Date(Date.now() + (input.executeAfterHours ?? DEFAULT_TIME_LOCK_HOURS) * 3600_000).toISOString()
        : null;
    const executedAt = input.mode === "immediate" ? new Date().toISOString() : null;
    const correlationId = attachCorrelationId(input.correlationId);

    const inserted = await this.db.query(
      `INSERT INTO rarecrest.seals
         (session_id, sealed_by, mode, execute_after, executed_at, human_instruction_id,
          override_note, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING ${SEAL_COLUMNS}`,
      [
        input.sessionId,
        director,
        input.mode,
        executeAfter,
        executedAt,
        input.humanInstructionId ?? null,
        input.overrideNote ?? null,
        correlationId,
        JSON.stringify(input.payload ?? {}),
      ],
    );

    await this.db.query(
      `UPDATE rarecrest.parliament_sessions SET status = 'sealed', updated_at = NOW() WHERE id = $1`,
      [input.sessionId],
    );

    return mapSeal(inserted.rows[0]);
  }

  async getSeal(id: string): Promise<SealRow> {
    const result = await this.db.query(`SELECT ${SEAL_COLUMNS} FROM rarecrest.seals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw new ParliamentError("Seal not found", 404);
    return mapSeal(row);
  }

  async getLatestSealForSession(sessionId: string): Promise<SealRow | null> {
    const result = await this.db.query(
      `SELECT ${SEAL_COLUMNS} FROM rarecrest.seals WHERE session_id = $1 ORDER BY sealed_at DESC LIMIT 1`,
      [sessionId],
    );
    return result.rows[0] ? mapSeal(result.rows[0]) : null;
  }

  /** Cancels a not-yet-executed time-locked seal (the cooling-off window). Rejects the session. */
  async cancelSeal(sealId: string): Promise<SealRow> {
    const seal = await this.getSeal(sealId);
    if (seal.mode !== "time_lock") {
      throw new ParliamentError("Only time-locked seals can be cancelled", 400);
    }
    if (seal.executedAt) {
      throw new ParliamentError("Seal already executed — cannot cancel", 409);
    }
    if (seal.cancelledAt) {
      return seal;
    }
    const result = await this.db.query(
      `UPDATE rarecrest.seals SET cancelled_at = NOW() WHERE id = $1 AND executed_at IS NULL
       RETURNING ${SEAL_COLUMNS}`,
      [sealId],
    );
    if (result.rows.length === 0) {
      throw new ParliamentError("Seal already executed — cannot cancel", 409);
    }
    await this.db.query(
      `UPDATE rarecrest.parliament_sessions ps SET status = 'rejected', updated_at = NOW()
       FROM rarecrest.seals s WHERE s.id = $1 AND ps.id = s.session_id`,
      [sealId],
    );
    return mapSeal(result.rows[0]);
  }

  /** Time-locked seals that are unlocked (execute_after <= now), not cancelled, not yet executed. */
  async listDueSeals(now: Date = new Date()): Promise<SealRow[]> {
    const result = await this.db.query(
      `SELECT ${SEAL_COLUMNS} FROM rarecrest.seals
       WHERE mode = 'time_lock' AND cancelled_at IS NULL AND executed_at IS NULL
         AND execute_after <= $1
       ORDER BY execute_after ASC`,
      [now.toISOString()],
    );
    return result.rows.map(mapSeal);
  }

  /** Low-level: marks a seal executed unconditionally (idempotent no-op if already done/cancelled). */
  async markExecuted(sealId: string): Promise<SealRow> {
    const result = await this.db.query(
      `UPDATE rarecrest.seals SET executed_at = NOW()
       WHERE id = $1 AND executed_at IS NULL AND cancelled_at IS NULL
       RETURNING ${SEAL_COLUMNS}`,
      [sealId],
    );
    if (result.rows.length === 0) {
      throw new ParliamentError("Seal already executed or cancelled", 409);
    }
    return mapSeal(result.rows[0]);
  }

  /**
   * Executes a single seal now, enforcing the time-lock: a `time_lock` seal cannot be executed
   * before `execute_after` has elapsed — this is what makes the cooling-off window real rather
   * than cosmetic. `listDueSeals` is the batch-safe way to find seals that pass this check.
   */
  async executeSeal(sealId: string): Promise<SealRow> {
    const seal = await this.getSeal(sealId);
    if (seal.cancelledAt) {
      throw new ParliamentError("Seal was cancelled — cannot execute", 409);
    }
    if (seal.executedAt) {
      throw new ParliamentError("Seal already executed", 409);
    }
    if (seal.mode === "time_lock" && seal.executeAfter && new Date(seal.executeAfter).getTime() > Date.now()) {
      throw new ParliamentError("Time-lock has not elapsed yet", 403);
    }
    return this.markExecuted(sealId);
  }

  /**
   * Shared "resolve a Parliament gate" helper for callers (wiki promote, financial release):
   * a session pointed to by `sessionId` must exist, match `stakeClass`, and be either already
   * `sealed` (returns the latest seal) or `ready_for_seal` (auto-seals it `immediate` inline,
   * on this same request, with the acting director as seal-owner). Any other status refuses.
   */
  async resolveOrSealForAction(input: {
    sessionId: string;
    stakeClass: StakeClass;
    actorId: string;
    payload: Record<string, unknown>;
  }): Promise<{ session: ParliamentSessionRow; seal: SealRow }> {
    const session = await this.getSession(input.sessionId);
    if (session.stakeClass !== input.stakeClass) {
      throw new ParliamentError(
        `Parliament session stake_class mismatch (expected ${input.stakeClass}, got ${session.stakeClass})`,
        403,
      );
    }
    if (session.status === "sealed") {
      const seal = await this.getLatestSealForSession(session.id);
      if (!seal) throw new ParliamentError("Sealed session has no seal record", 500);
      return { session, seal };
    }
    if (session.status === "ready_for_seal") {
      const seal = await this.sealSession(input.actorId, {
        sessionId: session.id,
        mode: "immediate",
        payload: input.payload,
      });
      return { session: await this.getSession(session.id), seal };
    }
    throw new ParliamentError(
      `Parliament session is not ready for this action (status=${session.status})`,
      403,
    );
  }
}
