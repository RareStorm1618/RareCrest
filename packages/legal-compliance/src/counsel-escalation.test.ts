import { describe, expect, it } from "vitest";
import { evaluateCounselEscalation } from "./counsel-escalation.js";

describe("Counsel escalation (WO-59)", () => {
  it("escalates critical privacy/harm scenarios", () => {
    const result = evaluateCounselEscalation({
      issueType: "privacy",
      crossBorderImpact: true,
      customerHarmRisk: true,
      financialExposureUsd: 500000,
    });
    expect(result.escalated).toBe(true);
    expect(result.urgency).toBe("critical");
    expect(result.requiredWithinHours).toBeLessThanOrEqual(4);
  });

  it("does not escalate low-risk contract questions", () => {
    const result = evaluateCounselEscalation({
      issueType: "contract",
      crossBorderImpact: false,
      customerHarmRisk: false,
      financialExposureUsd: 5000,
    });
    expect(result.escalated).toBe(false);
    expect(result.urgency).toBe("low");
  });
});
