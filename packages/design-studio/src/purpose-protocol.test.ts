import { describe, expect, it } from "vitest";
import { buildPurposeProtocol } from "./purpose-protocol.js";

describe("purpose-protocol (WO-39)", () => {
  it("normalizes duplicate constraints and success signals", () => {
    const protocol = buildPurposeProtocol({
      entityId: "entity-1",
      mission: "  Protect critical workflows  ",
      nonNegotiables: ["human review", "human review", "audit trail"],
      successSignals: ["lower incidents", "lower incidents", "faster cycle time"],
    });

    expect(protocol.mission).toBe("Protect critical workflows");
    expect(protocol.nonNegotiables).toEqual(["human review", "audit trail"]);
    expect(protocol.successSignals).toEqual(["lower incidents", "faster cycle time"]);
    expect(protocol.checks.missionPresent).toBe(true);
  });
});
