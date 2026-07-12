import { describe, expect, it } from "vitest";
import { buildDecisionTraceTemplate } from "./decision-trace-template.js";

describe("decision-trace-template (WO-45)", () => {
  it("creates canonical decision-trace sections with deduplicated evidence", () => {
    const template = buildDecisionTraceTemplate({
      entityId: "entity-3",
      decisionType: " policy_change ",
      requiredEvidence: ["runbook", "runbook", "approval_ticket"],
    });

    expect(template.decisionType).toBe("policy_change");
    expect(template.requiredEvidence).toEqual(["runbook", "approval_ticket"]);
    expect(template.sections.map((section) => section.key)).toEqual([
      "context",
      "options",
      "verdict",
      "evidence",
      "rollback",
    ]);
  });
});
