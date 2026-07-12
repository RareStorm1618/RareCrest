import { describe, expect, it } from "vitest";
import { evaluateDrift, filterRoster, isHealthDegraded, isSlaBreached } from "./index.js";

describe("Runtime control (WO-68/72/70)", () => {
  const agent = {
    id: "1", agentId: "a1", entityId: "e1", owner: "director",
    currentActivity: "triage", status: "running" as const, health: "degraded" as const, version: "v2",
  };

  it("AC-RCP-001.3: filters roster by entity/status/health", () => {
    expect(filterRoster([agent], { health: "degraded" })).toHaveLength(1);
    expect(filterRoster([agent], { health: "healthy" })).toHaveLength(0);
  });

  it("AC-RCP-001.4: detects degraded health", () => {
    expect(isHealthDegraded("degraded")).toBe(true);
    expect(isHealthDegraded("healthy")).toBe(false);
  });

  it("AC-RCP-005.2: flags drift below accuracy floor", () => {
    expect(evaluateDrift(0.7, 0.1, 0.85, 0.2)).toBe(true);
  });

  it("AC-RCP-009.5: detects SLA breach", () => {
    expect(isSlaBreached(new Date(Date.now() - 3600000).toISOString())).toBe(true);
  });
});
