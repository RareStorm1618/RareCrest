import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPES,
  addRegime,
  buildDefaultRegulatoryProfile,
  buildRegulatoryProfileView,
  isRegulatoryProfileIncomplete,
  removeRegime,
} from "./regulatory-profile.js";

describe("RegulatoryProfileService (WO-35)", () => {
  it("AC-PORT-002.1: offers nonprofit, for-profit platform, fund, token/protocol, holding", () => {
    expect(ENTITY_TYPES).toEqual([
      "nonprofit",
      "for_profit_platform",
      "fund",
      "token_protocol",
      "holding",
    ]);
  });

  it("AC-PORT-002.2: attaches default profile by type and domain", () => {
    const rareangelsNonprofit = buildDefaultRegulatoryProfile("nonprofit", "rareangels");
    expect(rareangelsNonprofit).toContain("IRS-501c3");
    expect(rareangelsNonprofit).toContain("HIPAA");

    const hopecoinToken = buildDefaultRegulatoryProfile("token_protocol", "hopecoin");
    expect(hopecoinToken).toContain("AML");
    expect(hopecoinToken).toContain("Money-Transmission");
  });

  it("AC-PORT-002.4: records regime additions and removals", () => {
    const base = ["GDPR"];
    expect(addRegime(base, "SEC")).toEqual(["GDPR", "SEC"]);
    expect(removeRegime(["GDPR", "SEC"], "SEC")).toEqual(["GDPR"]);
  });

  it("AC-PORT-002.5: flags incomplete profile when type unset", () => {
    expect(isRegulatoryProfileIncomplete(null)).toBe(true);
    expect(isRegulatoryProfileIncomplete("fund")).toBe(false);
    const view = buildRegulatoryProfileView({
      entityId: "e1",
      entityType: null,
      vertical: "rareedge",
      regimes: [],
      isHoldingEntity: false,
    });
    expect(view.incomplete).toBe(true);
  });

  it("AC-PORT-004.2: holding entity represents cross-cutting hard rules", () => {
    const view = buildRegulatoryProfileView({
      entityId: "h1",
      entityType: "holding",
      vertical: "holding",
      regimes: buildDefaultRegulatoryProfile("holding", "holding"),
      isHoldingEntity: true,
    });
    expect(view.holdingCrossCutting).toBe(true);
    expect(view.regimes).toContain("NIST-AI-RMF");
  });
});
