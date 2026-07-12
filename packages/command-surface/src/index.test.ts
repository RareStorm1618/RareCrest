import { describe, expect, it } from "vitest";
import {
  buildMorningBrief,
  classifyQueueItem,
  filterDecisionItems,
  isPortfolioClear,
  rankPriorityItems,
} from "./index.js";

const sampleItem = {
  id: "1",
  entityId: "e1",
  signalType: "hard_rule_exception" as const,
  severity: "critical" as const,
  message: "Exception",
  linkPath: null,
  sourceRef: null,
  createdAt: new Date().toISOString(),
  sourceFeature: "portfolio",
  kind: "decision" as const,
};

describe("Command Surface (WO-64/65)", () => {
  it("AC-CMD-001.4: states when nothing changed", () => {
    const brief = buildMorningBrief(null, [], [], [], []);
    expect(brief.unchanged).toBe(true);
  });

  it("AC-CMD-002.4: portfolio clear when queue empty", () => {
    expect(isPortfolioClear([])).toBe(true);
  });

  it("AC-CMD-005.2: filters decision items", () => {
    const awareness = { ...sampleItem, id: "2", kind: "awareness" as const, signalType: "unverified_claim" as const };
    expect(filterDecisionItems([sampleItem, awareness])).toHaveLength(1);
  });

  it("WO-65: ranks by severity and decision kind", () => {
    const ranked = rankPriorityItems([sampleItem]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(100);
  });

  it("classifies high-stakes as decision", () => {
    expect(classifyQueueItem("pending_high_stakes_decision")).toBe("decision");
  });
});
