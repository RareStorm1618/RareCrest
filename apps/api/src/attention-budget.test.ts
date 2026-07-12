import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import {
  ensureBudget,
  listBudgetsForEntities,
  listBudgetsForEntity,
  repossess,
  spendInterruptToken,
} from "./services/attention-budget.js";
import { AttentionFlagService } from "./services/attention-flag.js";

/** S1 Attention Budget Protocol */

const AGENT = "agent-1";
const ENTITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface BudgetRow {
  id: string;
  agent_id: string;
  entity_id: string;
  day: string;
  critical_tokens: number;
  awareness_tokens: number;
  critical_spent: number;
  awareness_spent: number;
}

function makeBudgetDb() {
  const budgets: BudgetRow[] = [];
  const escalations: Array<{ agentId: string; entityId: string; flagId: string | null; severity: string; tokenKind: string }> = [];
  let idCounter = 0;

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO rarecrest.agent_attention_budgets")) {
      const [agentId, entityId, criticalTokens, awarenessTokens] = params as [string, string, number, number];
      let row = budgets.find((b) => b.agent_id === agentId && b.entity_id === entityId);
      if (!row) {
        row = {
          id: `budget-${++idCounter}`,
          agent_id: agentId,
          entity_id: entityId,
          day: "2026-07-12",
          critical_tokens: criticalTokens,
          awareness_tokens: awarenessTokens,
          critical_spent: 0,
          awareness_spent: 0,
        };
        budgets.push(row);
      }
      return { rows: [row] };
    }
    if (sql.includes("critical_spent = critical_spent + 1")) {
      const [agentId, entityId] = params as [string, string];
      const row = budgets.find((b) => b.agent_id === agentId && b.entity_id === entityId);
      if (!row || row.critical_spent >= row.critical_tokens) return { rows: [] };
      row.critical_spent += 1;
      return { rows: [row] };
    }
    if (sql.includes("awareness_spent = awareness_spent + 1")) {
      const [agentId, entityId] = params as [string, string];
      const row = budgets.find((b) => b.agent_id === agentId && b.entity_id === entityId);
      if (!row || row.awareness_spent >= row.awareness_tokens) return { rows: [] };
      row.awareness_spent += 1;
      return { rows: [row] };
    }
    if (sql.startsWith("UPDATE rarecrest.agent_attention_budgets")) {
      // repossess: generic SET clause (no `+ 1` condition, handled above)
      const [agentId, entityId, ...rest] = params as unknown[];
      const row = budgets.find((b) => b.agent_id === agentId && b.entity_id === entityId);
      if (!row) return { rows: [] };
      if (sql.includes("critical_spent = 0")) {
        row.critical_spent = 0;
        row.awareness_spent = 0;
      }
      let restIdx = 0;
      if (sql.includes("critical_tokens = $")) row.critical_tokens = rest[restIdx++] as number;
      if (sql.includes("awareness_tokens = $")) row.awareness_tokens = rest[restIdx++] as number;
      return { rows: [row] };
    }
    if (sql.includes("INSERT INTO rarecrest.attention_escalations")) {
      const [agentId, entityId, flagId, severity, tokenKind] = params as [string, string, string | null, string, string];
      escalations.push({ agentId, entityId, flagId, severity, tokenKind });
      return { rows: [] };
    }
    if (sql.includes("FROM rarecrest.agent_attention_budgets") && sql.includes("entity_id = ANY")) {
      const [entityIds] = params as [string[]];
      return { rows: budgets.filter((b) => entityIds.includes(b.entity_id)) };
    }
    if (sql.includes("FROM rarecrest.agent_attention_budgets")) {
      const [entityId] = params as [string];
      return { rows: budgets.filter((b) => b.entity_id === entityId) };
    }
    return { rows: [] };
  });

  return { db: { query } as unknown as DatabaseClient, budgets, escalations };
}

describe("S1 Attention Budget Protocol — ensureBudget", () => {
  afterEach(() => {
    delete process.env.ATTENTION_CRITICAL_DAILY;
    delete process.env.ATTENTION_AWARENESS_DAILY;
  });

  it("seeds a new row with the 3/10 defaults when env is unset", async () => {
    const { db } = makeBudgetDb();
    const budget = await ensureBudget(db, AGENT, ENTITY);
    expect(budget).toMatchObject({
      agentId: AGENT,
      entityId: ENTITY,
      criticalTokens: 3,
      awarenessTokens: 10,
      criticalSpent: 0,
      awarenessSpent: 0,
    });
  });

  it("is idempotent — a second ensureBudget call does not create a duplicate row", async () => {
    const { db, budgets } = makeBudgetDb();
    await ensureBudget(db, AGENT, ENTITY);
    await ensureBudget(db, AGENT, ENTITY);
    expect(budgets).toHaveLength(1);
  });

  it("reads ATTENTION_CRITICAL_DAILY / ATTENTION_AWARENESS_DAILY overrides", async () => {
    process.env.ATTENTION_CRITICAL_DAILY = "5";
    process.env.ATTENTION_AWARENESS_DAILY = "20";
    const { db } = makeBudgetDb();
    const budget = await ensureBudget(db, AGENT, ENTITY);
    expect(budget.criticalTokens).toBe(5);
    expect(budget.awarenessTokens).toBe(20);
  });
});

describe("S1 Attention Budget Protocol — spendInterruptToken", () => {
  it("spends a critical token for critical severity and reports paid=true", async () => {
    const { db, escalations } = makeBudgetDb();
    const result = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    expect(result).toMatchObject({ paid: true, deferred: false, tokenKind: "critical" });
    expect(result.remaining.criticalRemaining).toBe(2);
    expect(escalations).toHaveLength(1);
    expect(escalations[0]).toMatchObject({ tokenKind: "critical" });
  });

  it("spends a critical token for high severity", async () => {
    const { db } = makeBudgetDb();
    const result = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "high" });
    expect(result.tokenKind).toBe("critical");
  });

  it("spends an awareness token for medium/low severity", async () => {
    const { db } = makeBudgetDb();
    const medium = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "medium" });
    expect(medium.tokenKind).toBe("awareness");
    const low = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "low" });
    expect(low.tokenKind).toBe("awareness");
    expect(low.remaining.awarenessRemaining).toBe(8);
  });

  it("defers instead of throwing once the daily critical budget is exhausted", async () => {
    const { db, escalations } = makeBudgetDb();
    for (let i = 0; i < 3; i += 1) {
      const spend = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
      expect(spend.paid).toBe(true);
    }
    const fourth = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical", flagId: "flag-4" });
    expect(fourth).toMatchObject({ paid: false, deferred: true, tokenKind: "critical" });
    expect(fourth.remaining.criticalRemaining).toBe(0);
    expect(escalations.at(-1)).toMatchObject({ tokenKind: "deferred", flagId: "flag-4" });
  });

  it("critical and awareness pools are independent — exhausting one leaves the other untouched", async () => {
    const { db } = makeBudgetDb();
    for (let i = 0; i < 3; i += 1) {
      await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    }
    const deferred = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    expect(deferred.deferred).toBe(true);
    const awareness = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "low" });
    expect(awareness).toMatchObject({ paid: true, deferred: false });
  });
});

describe("S1 Attention Budget Protocol — repossess (director ritual)", () => {
  it("resets today's spent counters to 0 by default", async () => {
    const { db } = makeBudgetDb();
    await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "low" });
    const reset = await repossess(db, { agentId: AGENT, entityId: ENTITY });
    expect(reset.criticalSpent).toBe(0);
    expect(reset.awarenessSpent).toBe(0);
  });

  it("sets new critical/awareness token totals when provided", async () => {
    const { db } = makeBudgetDb();
    await ensureBudget(db, AGENT, ENTITY);
    const updated = await repossess(db, { agentId: AGENT, entityId: ENTITY, criticalTokens: 5, awarenessTokens: 25 });
    expect(updated.criticalTokens).toBe(5);
    expect(updated.awarenessTokens).toBe(25);
  });

  it("a repossessed agent can spend interrupt tokens again", async () => {
    const { db } = makeBudgetDb();
    for (let i = 0; i < 3; i += 1) {
      await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    }
    const exhausted = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    expect(exhausted.deferred).toBe(true);

    await repossess(db, { agentId: AGENT, entityId: ENTITY });
    const afterRepossess = await spendInterruptToken(db, { agentId: AGENT, entityId: ENTITY, severity: "critical" });
    expect(afterRepossess.paid).toBe(true);
  });
});

describe("S1 Attention Budget Protocol — listBudgetsForEntity / listBudgetsForEntities", () => {
  it("lists today's budgets for a single entity", async () => {
    const { db } = makeBudgetDb();
    await ensureBudget(db, AGENT, ENTITY);
    await ensureBudget(db, "agent-2", ENTITY);
    const rows = await listBudgetsForEntity(db, ENTITY);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.agentId).sort()).toEqual(["agent-1", "agent-2"]);
  });

  it("returns an empty array for an entity with no budgets", async () => {
    const { db } = makeBudgetDb();
    const rows = await listBudgetsForEntity(db, ENTITY);
    expect(rows).toEqual([]);
  });

  it("listBudgetsForEntities short-circuits without a query for an empty entity list", async () => {
    const { db } = makeBudgetDb();
    const spy = db.query as unknown as ReturnType<typeof vi.fn>;
    const rows = await listBudgetsForEntities(db, []);
    expect(rows).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("listBudgetsForEntities aggregates budgets across multiple entities", async () => {
    const { db } = makeBudgetDb();
    const ENTITY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await ensureBudget(db, AGENT, ENTITY);
    await ensureBudget(db, AGENT, ENTITY_B);
    const rows = await listBudgetsForEntities(db, [ENTITY, ENTITY_B]);
    expect(rows).toHaveLength(2);
  });
});

describe("AttentionFlagService.raiseFlag — S1 wiring", () => {
  interface FlagRow {
    id: string;
    entity_id: string;
    signal_type: string;
    severity: string;
    message: string;
    link_path: string | null;
    source_ref: string | null;
    created_at: Date;
    deferred_to_brief: boolean;
    interrupt_paid: boolean;
    agent_id: string | null;
  }

  function makeCombinedDb() {
    const budgetDb = makeBudgetDb();
    const flags: FlagRow[] = [];
    let flagIdCounter = 0;

    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO rarecrest.attention_flags")) {
        const [entityId, signalType, severity, message, linkPath, sourceRef] = params as [
          string,
          string,
          string,
          string,
          string | null,
          string | null,
        ];
        const row: FlagRow = {
          id: `flag-${++flagIdCounter}`,
          entity_id: entityId,
          signal_type: signalType,
          severity,
          message,
          link_path: linkPath,
          source_ref: sourceRef,
          created_at: new Date("2026-07-12T00:00:00Z"),
          deferred_to_brief: false,
          interrupt_paid: false,
          agent_id: null,
        };
        flags.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith("UPDATE rarecrest.attention_flags")) {
        const [flagId, deferredToBrief, interruptPaid, agentId] = params as [string, boolean, boolean, string | null];
        const row = flags.find((f) => f.id === flagId);
        if (row) {
          row.deferred_to_brief = deferredToBrief;
          row.interrupt_paid = interruptPaid;
          row.agent_id = agentId;
        }
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      return budgetDb.db.query(sql, params);
    });

    return { db: { query } as unknown as DatabaseClient, flags, budgets: budgetDb.budgets };
  }

  it("agent-raised critical flag spends a critical token and interrupts immediately", async () => {
    const { db, flags } = makeCombinedDb();
    const service = new AttentionFlagService(db);
    const item = await service.raiseFlag(ENTITY, {
      signalType: "hard_rule_exception",
      message: "Agent-detected hard rule exception",
      agentId: AGENT,
    });
    expect(item.deferredToBrief).toBe(false);
    expect(item.interruptPaid).toBe(true);
    expect(item.agentId).toBe(AGENT);
    expect(flags[0]).toMatchObject({ deferred_to_brief: false, interrupt_paid: true, agent_id: AGENT });
  });

  it("defers to the brief once the agent's critical budget is exhausted", async () => {
    const { db, flags } = makeCombinedDb();
    const service = new AttentionFlagService(db);
    for (let i = 0; i < 3; i += 1) {
      await service.raiseFlag(ENTITY, {
        signalType: "hard_rule_exception",
        message: `Exception ${i}`,
        agentId: AGENT,
      });
    }
    const fourth = await service.raiseFlag(ENTITY, {
      signalType: "hard_rule_exception",
      message: "Exception 4",
      agentId: AGENT,
    });
    expect(fourth.deferredToBrief).toBe(true);
    expect(fourth.interruptPaid).toBe(false);
    expect(flags.at(-1)).toMatchObject({ deferred_to_brief: true, interrupt_paid: false });
  });

  it("human-raised flags (no agentId) always interrupt immediately and never spend agent tokens", async () => {
    const { db, flags, budgets } = makeCombinedDb();
    const service = new AttentionFlagService(db);
    const item = await service.raiseFlag(ENTITY, {
      signalType: "unresolved_conflict",
      message: "Human-raised conflict",
    });
    expect(item.deferredToBrief).toBe(false);
    expect(item.interruptPaid).toBe(true);
    expect(item.agentId).toBeNull();
    expect(flags[0].agent_id).toBeNull();
    expect(budgets).toHaveLength(0);
  });
});
