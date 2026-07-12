import { describe, it, expect } from "vitest";
import {
  recommendMigrationMode,
  recommendOnRamp,
  isLightEdgeAvailable,
  reconcileMaturityLadder,
  buildMigrationRecommendation,
  inferMaturityFromDiagnostics,
} from "./migration.js";

describe("recommendMigrationMode", () => {
  it("recommends Direct when headcount <= 50 and immune weak (AC-DIAG-007.2)", () => {
    expect(recommendMigrationMode(40, "weak")).toBe("direct");
  });

  it("recommends Edge when headcount > 50 (AC-DIAG-007.3)", () => {
    expect(recommendMigrationMode(51, "weak")).toBe("edge");
  });

  it("recommends Edge when immune moderate or strong", () => {
    expect(recommendMigrationMode(30, "moderate")).toBe("edge");
    expect(recommendMigrationMode(30, "strong")).toBe("edge");
  });
});

describe("recommendOnRamp", () => {
  it("maps bands to on-ramps (AC-DIAG-007.4)", () => {
    expect(recommendOnRamp("survival_risk")).toContain("minimal viable intelligence");
    expect(recommendOnRamp("foundational")).toContain("90-day");
    expect(recommendOnRamp("ready_for_rewrite")).toContain("full rewrite");
  });
});

describe("light edge mode", () => {
  it("offers Light Edge for foundational + edge (AC-DIAG-007.5)", () => {
    expect(isLightEdgeAvailable("edge", "foundational")).toBe(true);
    expect(isLightEdgeAvailable("direct", "foundational")).toBe(false);
    expect(isLightEdgeAvailable("edge", "ready_for_rewrite")).toBe(false);
  });
});

describe("maturity reconciliation", () => {
  it("trusts ladder and surfaces divergence (AC-DIAG-006.2)", () => {
    const result = reconcileMaturityLadder(4, "foundational", true, true);
    expect(result.trustedLevel).toBe(4);
    expect(result.divergences.length).toBeGreaterThan(0);
  });

  it("flags token-maxxing conflict with L3+", () => {
    const result = reconcileMaturityLadder(3, "ready_for_rewrite", true, false);
    expect(result.divergences.some((d) => d.includes("Token-maxxing"))).toBe(true);
  });
});

describe("buildMigrationRecommendation", () => {
  it("blocks when deployment locked (WO-13 gate)", () => {
    const rec = buildMigrationRecommendation({
      headcount: 30,
      immuneSystem: "weak",
      readinessBand: "foundational",
      maturityLevel: 2,
      dabblingPass: true,
      tokenMaxxingPass: true,
      deploymentLocked: true,
      migrationHalted: false,
    });
    expect(rec.blocked).toBe(true);
    expect(rec.mode).toBeNull();
    expect(rec.blockReasons[0]).toContain("Deployment lock");
  });

  it("returns full recommendation when clear", () => {
    const rec = buildMigrationRecommendation({
      headcount: 25,
      immuneSystem: "weak",
      readinessBand: "ready_for_rewrite",
      maturityLevel: 3,
      dabblingPass: true,
      tokenMaxxingPass: true,
      deploymentLocked: false,
      migrationHalted: false,
    });
    expect(rec.blocked).toBe(false);
    expect(rec.mode).toBe("direct");
    expect(rec.onRamp).toContain("full rewrite");
  });
});

describe("inferMaturityFromDiagnostics", () => {
  it("places below L3 when token-maxxing fails", () => {
    expect(inferMaturityFromDiagnostics("ready_for_rewrite", true, false)).toBe(2);
  });
});
