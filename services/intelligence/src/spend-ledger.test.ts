import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import { estimateSpendUsd, isDatabaseAvailable, recordSpend } from "./spend-ledger.js";

/** EXO Wave C — durable AI spend ledger: recordSpend + estimateSpendUsd. */

describe("estimateSpendUsd", () => {
  afterEach(() => {
    delete process.env.AI_SPEND_INPUT_USD_PER_1M;
    delete process.env.AI_SPEND_OUTPUT_USD_PER_1M;
  });

  it("defaults to $0.50/1M input + $1.50/1M output tokens", () => {
    expect(estimateSpendUsd(1_000_000, 0)).toBeCloseTo(0.5, 6);
    expect(estimateSpendUsd(0, 1_000_000)).toBeCloseTo(1.5, 6);
    expect(estimateSpendUsd(1_000_000, 1_000_000)).toBeCloseTo(2.0, 6);
  });

  it("honors AI_SPEND_INPUT_USD_PER_1M / AI_SPEND_OUTPUT_USD_PER_1M overrides", () => {
    process.env.AI_SPEND_INPUT_USD_PER_1M = "1";
    process.env.AI_SPEND_OUTPUT_USD_PER_1M = "3";
    expect(estimateSpendUsd(1_000_000, 1_000_000)).toBeCloseTo(4, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateSpendUsd(0, 0)).toBe(0);
  });
});

describe("isDatabaseAvailable", () => {
  afterEach(() => {
    delete process.env.INTELLIGENCE_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  it("is false when neither env var is set", () => {
    delete process.env.INTELLIGENCE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(isDatabaseAvailable()).toBe(false);
  });

  it("is true when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgres://localhost/rarecrest";
    expect(isDatabaseAvailable()).toBe(true);
  });

  it("is true when INTELLIGENCE_DATABASE_URL is set (preferred over DATABASE_URL)", () => {
    process.env.INTELLIGENCE_DATABASE_URL = "postgres://localhost/rarecrest_intel";
    expect(isDatabaseAvailable()).toBe(true);
  });
});

describe("recordSpend", () => {
  afterEach(() => {
    delete process.env.INTELLIGENCE_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  it("no-ops without throwing when no database URL is configured", async () => {
    delete process.env.INTELLIGENCE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    const query = vi.fn();
    const db = { query } as unknown as DatabaseClient;
    await expect(
      recordSpend(db, { vertical: "healkids", provider: "primary", inputTokens: 10, outputTokens: 5 }),
    ).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("no-ops without throwing when db is undefined", async () => {
    process.env.DATABASE_URL = "postgres://localhost/rarecrest";
    await expect(
      recordSpend(undefined, { vertical: "healkids", provider: "primary", inputTokens: 10, outputTokens: 5 }),
    ).resolves.toBeUndefined();
  });

  it("inserts into rarecrest.ai_spend_ledger when a database URL is configured", async () => {
    process.env.DATABASE_URL = "postgres://localhost/rarecrest";
    const query = vi.fn(async () => ({ rows: [] }));
    const db = { query } as unknown as DatabaseClient;
    await recordSpend(db, {
      vertical: "healkids",
      entityId: "e1",
      agentId: "agent-1",
      provider: "primary",
      model: "mock-model",
      inputTokens: 100,
      outputTokens: 50,
      correlationId: "corr-1",
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("INSERT INTO rarecrest.ai_spend_ledger");
    expect(params).toEqual([
      "healkids",
      "e1",
      "agent-1",
      "primary",
      "mock-model",
      100,
      50,
      estimateSpendUsdFor(100, 50),
      "corr-1",
    ]);
  });

  it("swallows a query failure — best-effort write never throws", async () => {
    process.env.DATABASE_URL = "postgres://localhost/rarecrest";
    const query = vi.fn(async () => {
      throw new Error("relation \"rarecrest.ai_spend_ledger\" does not exist");
    });
    const db = { query } as unknown as DatabaseClient;
    await expect(
      recordSpend(db, { vertical: "healkids", provider: "primary", inputTokens: 10, outputTokens: 5 }),
    ).resolves.toBeUndefined();
  });

  it("uses an explicit estimatedUsd over the default heuristic when provided", async () => {
    process.env.DATABASE_URL = "postgres://localhost/rarecrest";
    const query = vi.fn(async () => ({ rows: [] }));
    const db = { query } as unknown as DatabaseClient;
    await recordSpend(db, {
      vertical: "healkids",
      provider: "primary",
      inputTokens: 10,
      outputTokens: 5,
      estimatedUsd: 9.99,
    });
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[7]).toBe(9.99);
  });
});

function estimateSpendUsdFor(inputTokens: number, outputTokens: number): number {
  return estimateSpendUsd(inputTokens, outputTokens);
}
