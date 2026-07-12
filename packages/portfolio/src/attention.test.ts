import { describe, expect, it } from "vitest";
import {
  ATTENTION_SIGNAL_TYPES,
  buildAttentionItem,
  defaultSeverityForSignal,
  hasOpenAttentionSignals,
  isClearForAgentDeployment,
  messageForUnverifiedClaim,
  validateRelationshipType,
} from "./attention.js";

describe("AttentionFlagService (WO-36)", () => {
  it("AC-PORT-006.2: defines shared attention signal types", () => {
    expect(ATTENTION_SIGNAL_TYPES).toContain("open_governance_gate");
    expect(ATTENTION_SIGNAL_TYPES).toContain("hard_rule_exception");
    expect(ATTENTION_SIGNAL_TYPES).toContain("unverified_claim");
  });

  it("AC-PORT-005.4: hard-rule exception blocks agent deployment clearance", () => {
    const blocked = [
      buildAttentionItem({
        id: "1",
        entityId: "e1",
        signalType: "hard_rule_exception",
        message: "Exception pending",
        createdAt: new Date().toISOString(),
      }),
    ];
    expect(isClearForAgentDeployment(blocked)).toBe(false);
    expect(isClearForAgentDeployment([])).toBe(true);
  });

  it("assigns critical severity to hard-rule exceptions", () => {
    expect(defaultSeverityForSignal("hard_rule_exception")).toBe("critical");
  });

  it("AC-PORT-008.3: formats unverified claim attention messages", () => {
    const msg = messageForUnverifiedClaim("granted_patent", "Patent US-123 granted");
    expect(msg).toContain("Unverified claim");
    expect(msg).toContain("granted_patent");
  });

  it("AC-PORT-007: validates relationship types including charitable-license constraints", () => {
    expect(validateRelationshipType("charitable_license")).toBe(true);
    expect(validateRelationshipType("profit_donation_dependency")).toBe(true);
    expect(hasOpenAttentionSignals([{ id: "1", entityId: "e", signalType: "unresolved_conflict", severity: "medium", message: "m", linkPath: null, sourceRef: null, createdAt: "" }])).toBe(true);
  });
});
