import { describe, expect, it } from "vitest";
import { issueAgentPassport } from "./passport.js";

describe("Agent passport (WO-50)", () => {
  it("issues low-risk passport for compliant rights set", () => {
    const passport = issueAgentPassport({
      agentId: "agent-1",
      entityId: "entity-1",
      requestedRights: ["code_execution"],
      touchesPhi: false,
      touchesFinancial: false,
      encryptionLayerPresent: true,
      issuedBy: "director-1",
    });
    expect(passport.riskTier).toBe("low");
    expect(passport.hardRuleClear).toBe(true);
  });

  it("marks passport high risk when all three rights are requested", () => {
    const passport = issueAgentPassport({
      agentId: "agent-2",
      entityId: "entity-1",
      requestedRights: ["sensitive_data", "code_execution", "external_comms"],
      touchesPhi: true,
      touchesFinancial: true,
      encryptionLayerPresent: false,
      issuedBy: "director-1",
    });
    expect(passport.hardRuleClear).toBe(false);
    expect(passport.riskTier).toBe("high");
    expect(passport.constraints).toContain("two_of_three_rights_violation");
  });
});
