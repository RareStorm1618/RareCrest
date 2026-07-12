import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import {
  ParliamentError,
  ParliamentService,
  parliamentRequired,
  financialSealHours,
  assertEffectDigestConsistent,
} from "./services/parliament.js";

interface FakeSession {
  id: string;
  entityId: string;
  topic: string;
  stakeClass: string;
  status: string;
  createdBy: string;
  redTeamNay: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FakeVote {
  id: string;
  sessionId: string;
  officerRole: string;
  agentId: string;
  vote: string;
  rationale: string;
  stakeholderLens: string;
  createdAt: string;
}

interface FakeSeal {
  id: string;
  sessionId: string;
  sealedBy: string;
  sealedAt: string;
  mode: string;
  executeAfter: string | null;
  cancelledAt: string | null;
  executedAt: string | null;
  humanInstructionId: string | null;
  overrideNote: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
  effectDigest: string | null;
}

/**
 * Minimal in-memory Postgres double: real branching/filtering logic keyed off distinctive
 * substrings of the exact SQL emitted by ParliamentService — same style as
 * services/kill-switch.test.ts, extended to a tiny relational model since Parliament + Seal
 * has three related tables instead of one row-per-entity table.
 */
function createFakeDb() {
  let sessionSeq = 0;
  let voteSeq = 0;
  let sealSeq = 0;
  const sessions = new Map<string, FakeSession>();
  const votes = new Map<string, FakeVote>();
  const seals = new Map<string, FakeSeal>();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO rarecrest.parliament_sessions")) {
      const id = `session-${++sessionSeq}`;
      const now = new Date().toISOString();
      const row: FakeSession = {
        id,
        entityId: params[0] as string,
        topic: params[1] as string,
        stakeClass: params[2] as string,
        status: "open",
        createdBy: params[3] as string,
        redTeamNay: false,
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(id, row);
      return { rows: [row] };
    }
    if (sql.includes("FROM rarecrest.parliament_sessions") && sql.includes("WHERE id = $1")) {
      const row = sessions.get(params[0] as string);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("FROM rarecrest.parliament_sessions") && sql.includes("WHERE entity_id = $1")) {
      return { rows: [...sessions.values()].filter((s) => s.entityId === params[0]) };
    }
    if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("red_team_nay = $3")) {
      const row = sessions.get(params[0] as string)!;
      row.status = params[1] as string;
      row.redTeamNay = params[2] as boolean;
      row.updatedAt = new Date().toISOString();
      return { rows: [row] };
    }
    if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("status = 'sealed'")) {
      const row = sessions.get(params[0] as string)!;
      row.status = "sealed";
      row.updatedAt = new Date().toISOString();
      return { rows: [] };
    }
    if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("status = 'rejected'")) {
      const seal = seals.get(params[0] as string);
      if (seal) {
        const row = sessions.get(seal.sessionId);
        if (row) row.status = "rejected";
      }
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO rarecrest.parliament_votes")) {
      const [sessionId, officerRole, agentId, voteVal, rationale, stakeholderLens] = params as string[];
      const existing = [...votes.values()].find(
        (v) => v.sessionId === sessionId && v.agentId === agentId && v.stakeholderLens === stakeholderLens,
      );
      if (existing) {
        existing.officerRole = officerRole;
        existing.vote = voteVal;
        existing.rationale = rationale;
        return { rows: [existing] };
      }
      const id = `vote-${++voteSeq}`;
      const row: FakeVote = {
        id,
        sessionId,
        officerRole,
        agentId,
        vote: voteVal,
        rationale,
        stakeholderLens,
        createdAt: new Date().toISOString(),
      };
      votes.set(id, row);
      return { rows: [row] };
    }
    if (sql.includes("FROM rarecrest.parliament_votes")) {
      return { rows: [...votes.values()].filter((v) => v.sessionId === params[0]) };
    }
    if (sql.includes("INSERT INTO rarecrest.seals")) {
      const id = `seal-${++sealSeq}`;
      const row: FakeSeal = {
        id,
        sessionId: params[0] as string,
        sealedBy: params[1] as string,
        sealedAt: new Date().toISOString(),
        mode: params[2] as string,
        executeAfter: (params[3] as string | null) ?? null,
        cancelledAt: null,
        executedAt: (params[4] as string | null) ?? null,
        humanInstructionId: (params[5] as string | null) ?? null,
        overrideNote: (params[6] as string | null) ?? null,
        correlationId: params[7] as string,
        payload: JSON.parse(params[8] as string),
        effectDigest: (params[9] as string | null) ?? null,
      };
      seals.set(id, row);
      return { rows: [row] };
    }
    if (sql.includes("UPDATE rarecrest.seals") && sql.includes("SET cancelled_at = NOW()")) {
      const row = seals.get(params[0] as string);
      if (!row || row.executedAt) return { rows: [] };
      row.cancelledAt = new Date().toISOString();
      return { rows: [row] };
    }
    if (sql.includes("UPDATE rarecrest.seals") && sql.includes("executed_at IS NULL AND cancelled_at IS NULL")) {
      const row = seals.get(params[0] as string);
      if (!row || row.executedAt || row.cancelledAt) return { rows: [] };
      row.executedAt = new Date().toISOString();
      return { rows: [row] };
    }
    if (sql.includes("FROM rarecrest.seals") && sql.includes("WHERE mode = 'time_lock'")) {
      const now = params[0] as string;
      return {
        rows: [...seals.values()].filter(
          (s) => s.mode === "time_lock" && !s.cancelledAt && !s.executedAt && (s.executeAfter ?? "") <= now,
        ),
      };
    }
    if (sql.includes("FROM rarecrest.seals") && sql.includes("WHERE session_id = $1")) {
      const rows = [...seals.values()]
        .filter((s) => s.sessionId === params[0])
        .sort((a, b) => (a.sealedAt < b.sealedAt ? 1 : -1));
      return { rows: rows.length ? [rows[0]] : [] };
    }
    if (sql.includes("FROM rarecrest.seals") && sql.includes("WHERE id = $1")) {
      const row = seals.get(params[0] as string);
      return { rows: row ? [row] : [] };
    }
    throw new Error(`Unhandled fake query: ${sql}`);
  });

  return { query, sessions, votes, seals } as unknown as DatabaseClient & {
    sessions: Map<string, FakeSession>;
    votes: Map<string, FakeVote>;
    seals: Map<string, FakeSeal>;
  };
}

describe("ParliamentService", () => {
  let db: ReturnType<typeof createFakeDb>;
  let service: ParliamentService;

  beforeEach(() => {
    db = createFakeDb();
    service = new ParliamentService(db);
  });

  it("requires PARLIAMENT_MIN_VOTES (default 2) distinct stakeholder lenses before ready_for_seal", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Promote canon page",
      stakeClass: "wiki_promote",
      createdBy: "director-a",
    });
    expect(session.status).toBe("open");

    const afterFirst = await service.castVote({
      sessionId: session.id,
      officerRole: "canon_librarian",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "engineering",
    });
    expect(afterFirst.session.status).toBe("open");

    const afterSecond = await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "regulator",
    });
    expect(afterSecond.session.status).toBe("ready_for_seal");
  });

  it("respects PARLIAMENT_MIN_VOTES override from env", async () => {
    process.env.PARLIAMENT_MIN_VOTES = "3";
    try {
      const session = await service.openSession({
        entityId: "entity-1",
        topic: "Doctrine change",
        stakeClass: "doctrine",
        createdBy: "director-a",
      });
      await service.castVote({
        sessionId: session.id,
        officerRole: "canon_librarian",
        agentId: "agent-1",
        vote: "aye",
        stakeholderLens: "engineering",
      });
      const afterTwo = await service.castVote({
        sessionId: session.id,
        officerRole: "compliance_prep",
        agentId: "agent-2",
        vote: "aye",
        stakeholderLens: "regulator",
      });
      expect(afterTwo.session.status).toBe("open");

      const afterThree = await service.castVote({
        sessionId: session.id,
        officerRole: "treasury_prep",
        agentId: "agent-3",
        vote: "aye",
        stakeholderLens: "fiduciary",
      });
      expect(afterThree.session.status).toBe("ready_for_seal");
    } finally {
      delete process.env.PARLIAMENT_MIN_VOTES;
    }
  });

  it("blocks sealing over a red-team nay without an overrideNote, allows with one", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Activate agent",
      stakeClass: "activation",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "red_team",
      agentId: "agent-red",
      vote: "nay",
      rationale: "Envelope not enforceable yet",
      stakeholderLens: "engineering",
    });
    const afterSecond = await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "regulator",
    });
    expect(afterSecond.session.redTeamNay).toBe(true);
    expect(afterSecond.session.status).toBe("ready_for_seal");

    await expect(
      service.sealSession("director-a", { sessionId: session.id, mode: "immediate" }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const sealed = await service.sealSession("director-a", {
      sessionId: session.id,
      mode: "immediate",
      overrideNote: "Director accepts red-team risk; envelope patched in parallel WO",
    });
    expect(sealed.mode).toBe("immediate");
    expect(sealed.executedAt).not.toBeNull();

    const session2 = await service.getSession(session.id);
    expect(session2.status).toBe("sealed");
  });

  it("refuses to execute a time-locked seal before execute_after has elapsed", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Financial release",
      stakeClass: "financial_release",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "treasury_prep",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "fiduciary",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "lp",
    });

    const seal = await service.sealSession("director-a", {
      sessionId: session.id,
      mode: "time_lock",
      executeAfterHours: 4,
    });
    expect(seal.mode).toBe("time_lock");
    expect(seal.executedAt).toBeNull();
    expect(new Date(seal.executeAfter!).getTime()).toBeGreaterThan(Date.now());

    await expect(service.executeSeal(seal.id)).rejects.toMatchObject({ statusCode: 403 });

    const due = await service.listDueSeals(new Date());
    expect(due).toHaveLength(0);

    const dueLater = await service.listDueSeals(new Date(Date.now() + 5 * 3600_000));
    expect(dueLater.map((s) => s.id)).toContain(seal.id);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 5 * 3600_000));
      const executed = await service.executeSeal(seal.id);
      expect(executed.executedAt).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel blocks execution of a time-locked seal, and blocks re-cancel after execution", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Financial release",
      stakeClass: "financial_release",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "treasury_prep",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "fiduciary",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "lp",
    });
    const seal = await service.sealSession("director-a", {
      sessionId: session.id,
      mode: "time_lock",
      executeAfterHours: 1,
    });

    const cancelled = await service.cancelSeal(seal.id);
    expect(cancelled.cancelledAt).not.toBeNull();

    const sessionAfterCancel = await service.getSession(session.id);
    expect(sessionAfterCancel.status).toBe("rejected");

    await expect(service.executeSeal(seal.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects casting votes on a session that is already sealed", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Promote canon page",
      stakeClass: "wiki_promote",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "canon_librarian",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "engineering",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "regulator",
    });
    await service.sealSession("director-a", { sessionId: session.id, mode: "immediate" });

    await expect(
      service.castVote({
        sessionId: session.id,
        officerRole: "treasury_prep",
        agentId: "agent-3",
        vote: "aye",
        stakeholderLens: "fiduciary",
      }),
    ).rejects.toBeInstanceOf(ParliamentError);
  });

  it("resolveOrSealForAction auto-seals a ready_for_seal session inline (immediate) for the matching stake class", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Promote canon page",
      stakeClass: "wiki_promote",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "canon_librarian",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "engineering",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "regulator",
    });

    const { session: resolvedSession, seal } = await service.resolveOrSealForAction({
      sessionId: session.id,
      stakeClass: "wiki_promote",
      actorId: "director-b",
      payload: { namespace: "holding/canon", slug: "example" },
    });
    expect(resolvedSession.status).toBe("sealed");
    expect(seal.mode).toBe("immediate");
    expect(seal.payload).toEqual({ namespace: "holding/canon", slug: "example" });
  });

  it("resolveOrSealForAction refuses a stake_class mismatch", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Financial release",
      stakeClass: "financial_release",
      createdBy: "director-a",
    });
    await expect(
      service.resolveOrSealForAction({
        sessionId: session.id,
        stakeClass: "wiki_promote",
        actorId: "director-b",
        payload: {},
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("resolveOrSealForAction refuses a session that is still open (not ready_for_seal)", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Promote canon page",
      stakeClass: "wiki_promote",
      createdBy: "director-a",
    });
    await expect(
      service.resolveOrSealForAction({
        sessionId: session.id,
        stakeClass: "wiki_promote",
        actorId: "director-b",
        payload: {},
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("stores effectDigest on sealSession and executeSeal succeeds when payload.effectDigest matches", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Financial release",
      stakeClass: "financial_release",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "treasury_prep",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "fiduciary",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "lp",
    });

    const seal = await service.sealSession("director-a", {
      sessionId: session.id,
      mode: "immediate",
      payload: { effectDigest: "digest-abc" },
      effectDigest: "digest-abc",
    });
    expect(seal.effectDigest).toBe("digest-abc");

    // immediate seals execute at seal time (executedAt already set) — cancelling/re-executing
    // is refused, so directly assert the consistency helper instead of re-executing.
    expect(() => assertEffectDigestConsistent(seal)).not.toThrow();
  });

  it("assertEffectDigestConsistent fails closed when effect_digest and payload digest disagree", () => {
    const seal: FakeSeal = {
      id: "seal-x",
      sessionId: "session-x",
      sealedBy: "director-a",
      sealedAt: new Date().toISOString(),
      mode: "immediate",
      executeAfter: null,
      cancelledAt: null,
      executedAt: null,
      humanInstructionId: null,
      overrideNote: null,
      correlationId: null,
      payload: { effectDigest: "digest-other" },
      effectDigest: "digest-abc",
    };
    expect(() => assertEffectDigestConsistent(seal as never)).toThrow(ParliamentError);
    expect(() => assertEffectDigestConsistent(seal as never)).toThrow(/fail closed/);
  });

  it("assertEffectDigestConsistent is a no-op when either side is absent", () => {
    const noEffectDigest: FakeSeal = {
      id: "seal-y",
      sessionId: "session-y",
      sealedBy: "director-a",
      sealedAt: new Date().toISOString(),
      mode: "immediate",
      executeAfter: null,
      cancelledAt: null,
      executedAt: null,
      humanInstructionId: null,
      overrideNote: null,
      correlationId: null,
      payload: { effectDigest: "digest-abc" },
      effectDigest: null,
    };
    expect(() => assertEffectDigestConsistent(noEffectDigest as never)).not.toThrow();

    const noPayloadDigest: FakeSeal = { ...noEffectDigest, effectDigest: "digest-abc", payload: {} };
    expect(() => assertEffectDigestConsistent(noPayloadDigest as never)).not.toThrow();
  });

  it("executeSeal refuses a time-locked seal whose payload digest no longer matches effect_digest", async () => {
    const session = await service.openSession({
      entityId: "entity-1",
      topic: "Financial release",
      stakeClass: "financial_release",
      createdBy: "director-a",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "treasury_prep",
      agentId: "agent-1",
      vote: "aye",
      stakeholderLens: "fiduciary",
    });
    await service.castVote({
      sessionId: session.id,
      officerRole: "compliance_prep",
      agentId: "agent-2",
      vote: "aye",
      stakeholderLens: "lp",
    });

    const seal = await service.sealSession("director-a", {
      sessionId: session.id,
      mode: "time_lock",
      executeAfterHours: 1,
      payload: { effectDigest: "digest-tampered" },
      effectDigest: "digest-original",
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 2 * 3600_000));
      await expect(service.executeSeal(seal.id)).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("financialSealHours", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to 4 when FINANCIAL_SEAL_HOURS is unset", () => {
    delete process.env.FINANCIAL_SEAL_HOURS;
    expect(financialSealHours()).toBe(4);
  });

  it("reads a positive FINANCIAL_SEAL_HOURS override", () => {
    process.env.FINANCIAL_SEAL_HOURS = "8";
    expect(financialSealHours()).toBe(8);
  });

  it("falls back to 4 for a non-positive or non-numeric override", () => {
    process.env.FINANCIAL_SEAL_HOURS = "0";
    expect(financialSealHours()).toBe(4);
    process.env.FINANCIAL_SEAL_HOURS = "not-a-number";
    expect(financialSealHours()).toBe(4);
  });
});

describe("parliamentRequired", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is required under AUTH_TRUST_MODE=strict by default", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    delete process.env.PARLIAMENT_REQUIRED;
    expect(parliamentRequired()).toBe(true);
  });

  it("is not required in dev mode by default", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.PARLIAMENT_REQUIRED;
    expect(parliamentRequired()).toBe(false);
  });

  it("PARLIAMENT_REQUIRED=false always wins, even under strict trust mode", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    process.env.PARLIAMENT_REQUIRED = "false";
    expect(parliamentRequired()).toBe(false);
  });

  it("PARLIAMENT_REQUIRED=true forces it on even in dev trust mode", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    process.env.PARLIAMENT_REQUIRED = "true";
    expect(parliamentRequired()).toBe(true);
  });
});
