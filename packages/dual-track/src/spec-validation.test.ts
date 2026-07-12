import { describe, expect, it } from "vitest";
import { mergeValidationWithHardRule, validateStructuredDocument } from "./spec-validation.js";

describe("SpecValidationService (WO-29)", () => {
  it("requires narrative and schema separation", () => {
    const r = validateStructuredDocument({
      docType: "agent_spec",
      narrative: "",
      schemaPayload: { name: "Agent A" },
    });
    expect(r.deployable).toBe(false);
  });

  it("server-authoritative deployability merges hard-rule verdict", () => {
    const local = validateStructuredDocument({
      docType: "agent_spec",
      narrative: "Purpose",
      schemaPayload: { name: "Agent A" },
      requestedRights: ["code_execution"],
    });
    const merged = mergeValidationWithHardRule(local, false, [
      { field: "requestedRights", code: "DENIED", message: "Hard rule violation" },
    ]);
    expect(merged.deployable).toBe(false);
  });

  it("requires agent_blueprint agentId", () => {
    const r = validateStructuredDocument({
      docType: "agent_blueprint",
      narrative: "Purpose",
      schemaPayload: { name: "Agent A" },
    });
    expect(r.deployable).toBe(false);
    expect(r.errors.some((e) => e.field === "agentId")).toBe(true);
  });
});
