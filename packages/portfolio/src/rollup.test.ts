import { describe, expect, it } from "vitest";
import {
  aggregateByBand,
  aggregateByGovernanceStatus,
  aggregateByMigrationMode,
  isPortfolioClear,
  totalAttentionFlagCount,
  type PortfolioRollupEntity,
} from "./rollup.js";

const entities: PortfolioRollupEntity[] = [
  { band: "foundational", governanceStatus: "clear", attentionFlagCount: 0, mode: "edge" },
  { band: "foundational", governanceStatus: "blocked", attentionFlagCount: 2, mode: "edge" },
  { band: "ready_for_rewrite", governanceStatus: "clear", attentionFlagCount: 1, mode: "direct" },
];

describe("rollup aggregates (WO-24)", () => {
  it("counts entities by readiness band", () => {
    expect(aggregateByBand(entities)).toEqual({
      foundational: 2,
      ready_for_rewrite: 1,
    });
  });

  it("counts entities by governance status", () => {
    expect(aggregateByGovernanceStatus(entities)).toEqual({
      clear: 2,
      blocked: 1,
    });
  });

  it("counts entities by migration mode", () => {
    expect(aggregateByMigrationMode(entities)).toEqual({
      edge: 2,
      direct: 1,
    });
  });

  it("computes portfolio-clear from unresolved attention flags", () => {
    expect(totalAttentionFlagCount(entities)).toBe(3);
    expect(isPortfolioClear(entities)).toBe(false);
    expect(isPortfolioClear([{ ...entities[0] }])).toBe(true);
  });
});
