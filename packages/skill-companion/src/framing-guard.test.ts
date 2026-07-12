import { describe, expect, it } from "vitest";
import { checkDiagnosticGate, checkFramingRule, evaluateGuard } from "./framing-guard.js";

const fullContext = {
  entityId: "e1",
  entityType: "fund",
  vertical: "rareedge",
  regulatoryRegimes: ["SEC"],
  readinessBand: "foundational",
  maturityLevel: 2,
  migrationMode: "edge",
  diagnosticsComplete: true,
};

describe("FramingRuleGuard (WO-37)", () => {
  it("AC-SKILL-002.3: declines generic summary requests", () => {
    const v = checkFramingRule("generic_summary");
    expect(v.allowed).toBe(false);
  });

  it("AC-SKILL-002.2: reframes drive-only with SHAPE", () => {
    const v = checkFramingRule("drive_only");
    expect(v.allowed).toBe(true);
    expect(v.frameworks).toContain("rewrite");
  });

  it("AC-SKILL-003.1: blocks architecture before diagnostics", () => {
    const v = checkDiagnosticGate({ ...fullContext, diagnosticsComplete: false }, true);
    expect(v.allowed).toBe(false);
  });

  it("AC-SKILL-003.2: uses band/mode/maturity when diagnostics exist", () => {
    const v = checkDiagnosticGate(fullContext, true);
    expect(v.allowed).toBe(true);
    expect(v.reason).toContain("foundational");
  });
});

describe("evaluateGuard integration", () => {
  it("requires entity for substantive advice", () => {
    expect(evaluateGuard("substantive", null).allowed).toBe(false);
  });
});
