import { describe, expect, it } from "vitest";
import { ENVELOPE_CHECKLIST, validatePermissionEnvelope } from "./permission-envelope.js";

const completeChecklist = Object.fromEntries(ENVELOPE_CHECKLIST.map((k) => [k, true])) as Record<
  (typeof ENVELOPE_CHECKLIST)[number],
  boolean
>;

describe("PermissionEnvelopeValidator (WO-43)", () => {
  it("AC-STUDIO-AS-002.1: presents envelope checklist", () => {
    expect(ENVELOPE_CHECKLIST).toContain("scoped_workload_identity");
    expect(ENVELOPE_CHECKLIST).toHaveLength(5);
  });

  it("AC-STUDIO-AS-002.2: blocks destructive within bounds", () => {
    const r = validatePermissionEnvelope({
      checklist: completeChecklist,
      requestedRights: ["code_execution"],
      touchesPhi: false,
      touchesFinancial: false,
      encryptionLayerPresent: true,
      destructiveWithinBounds: true,
    });
    expect(r.deployable).toBe(false);
  });

  it("AC-STUDIO-AS-003.1: blocks all three rights", () => {
    const r = validatePermissionEnvelope({
      checklist: completeChecklist,
      requestedRights: ["sensitive_data", "code_execution", "external_comms"],
      touchesPhi: true,
      touchesFinancial: false,
      encryptionLayerPresent: true,
      destructiveWithinBounds: false,
    });
    expect(r.hardRuleClear).toBe(false);
  });

  it("AC-STUDIO-AS-003.4: passes when envelope and hard rules clear", () => {
    const r = validatePermissionEnvelope({
      checklist: completeChecklist,
      requestedRights: ["code_execution"],
      touchesPhi: false,
      touchesFinancial: false,
      encryptionLayerPresent: true,
      destructiveWithinBounds: false,
    });
    expect(r.deployable).toBe(true);
    expect(r.hardRuleClear).toBe(true);
  });
});
