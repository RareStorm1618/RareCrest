/** WO-32: MigrationRecommender — mode, on-ramp, maturity reconciliation */

import type { ReadinessBand } from "./index.js";

export type ImmuneSystemStrength = "weak" | "moderate" | "strong";
export type MigrationMode = "direct" | "edge" | "light_edge";

export const IMMUNE_SYSTEM_DESCRIPTORS: Record<ImmuneSystemStrength, string> = {
  weak: "Low resistance — leadership actively sponsors change",
  moderate: "Some pockets resist; change requires ongoing air cover",
  strong: "High resistance — legacy power centers block structural change",
};

export const MATURITY_LEVELS = [
  { level: 0, label: "L0 Theater", description: "AI theater without operational change" },
  { level: 1, label: "L1 Assisted", description: "Individual productivity gains only" },
  { level: 2, label: "L2 Workflow", description: "Workflow-level AI integration" },
  { level: 3, label: "L3 Infrastructure", description: "Compounding threshold — organizational infrastructure" },
  { level: 4, label: "L4 Autonomous", description: "Agent teams operate with human oversight" },
  { level: 5, label: "L5 Self-Driving", description: "Virtually self-driving operations" },
];

export interface MigrationRecommendInput {
  headcount: number;
  immuneSystem: ImmuneSystemStrength;
  readinessBand: ReadinessBand;
  maturityLevel: number;
  dabblingPass: boolean | null;
  tokenMaxxingPass: boolean | null;
  deploymentLocked: boolean;
  migrationHalted: boolean;
}

export interface MigrationRecommendation {
  blocked: boolean;
  blockReasons: string[];
  mode: MigrationMode | null;
  lightEdgeAvailable: boolean;
  onRamp: string | null;
  immuneSystem: ImmuneSystemStrength;
  immuneDescriptor: string;
  headcount: number;
  maturityReconciliation: {
    trustedLevel: number;
    trustedLabel: string;
    impliedLevel: number;
    divergences: string[];
  };
}

/** AC-DIAG-007.2 / AC-DIAG-007.3 */
export function recommendMigrationMode(
  headcount: number,
  immuneSystem: ImmuneSystemStrength,
): MigrationMode {
  if (headcount <= 50 && immuneSystem === "weak") return "direct";
  return "edge";
}

/** AC-DIAG-007.4 */
export function recommendOnRamp(band: ReadinessBand): string {
  switch (band) {
    case "survival_risk":
      return "Stand up the minimal viable intelligence stack urgently";
    case "foundational":
      return "Begin a 90-day edge-twin sprint";
    case "ready_for_rewrite":
      return "Proceed with full rewrite migration";
    default:
      return "Complete readiness assessment before selecting on-ramp";
  }
}

/** AC-DIAG-007.5 — Light Edge when Edge applies and band is foundational */
export function isLightEdgeAvailable(mode: MigrationMode, band: ReadinessBand): boolean {
  return mode === "edge" && band === "foundational";
}

/** Infer maturity level from diagnostic signals (for reconciliation comparison) */
export function inferMaturityFromDiagnostics(
  readinessBand: ReadinessBand,
  dabblingPass: boolean | null,
  tokenMaxxingPass: boolean | null,
): number {
  if (tokenMaxxingPass === false) return 2;
  if (dabblingPass === false) return 1;
  if (readinessBand === "survival_risk") return 1;
  if (readinessBand === "foundational") return 2;
  if (readinessBand === "ready_for_rewrite") return 3;
  return 0;
}

/** AC-DIAG-006.2 — trust ladder, surface divergence */
export function reconcileMaturityLadder(
  ladderLevel: number,
  readinessBand: ReadinessBand,
  dabblingPass: boolean | null,
  tokenMaxxingPass: boolean | null,
): { trustedLevel: number; impliedLevel: number; divergences: string[] } {
  const clamped = Math.max(0, Math.min(5, ladderLevel));
  const implied = inferMaturityFromDiagnostics(readinessBand, dabblingPass, tokenMaxxingPass);
  const divergences: string[] = [];

  if (implied !== clamped) {
    divergences.push(
      `Ladder reports L${clamped} but diagnostics imply L${implied} — trusting ladder per ADR-001`,
    );
  }
  if (tokenMaxxingPass === false && clamped >= 3) {
    divergences.push("Token-maxxing failure conflicts with L3+ placement — ladder trusted");
  }
  if (dabblingPass === false && clamped >= 2) {
    divergences.push("Dabbling test failure conflicts with L2+ placement — ladder trusted");
  }
  if (readinessBand === "survival_risk" && clamped >= 3) {
    divergences.push("Survival-risk band conflicts with L3+ placement — ladder trusted");
  }

  return { trustedLevel: clamped, impliedLevel: implied, divergences };
}

export function buildMigrationRecommendation(input: MigrationRecommendInput): MigrationRecommendation {
  const blockReasons: string[] = [];
  if (input.deploymentLocked) {
    blockReasons.push("Deployment lock active — governance pillars below threshold (WO-13)");
  }
  if (input.migrationHalted) {
    blockReasons.push("Migration diagnostic halt — red gating questions (WO-13)");
  }
  if (input.readinessBand === "incomplete") {
    blockReasons.push("Readiness assessment incomplete");
  }

  const blocked = blockReasons.length > 0;
  const mode = blocked ? null : recommendMigrationMode(input.headcount, input.immuneSystem);
  const reconciliation = reconcileMaturityLadder(
    input.maturityLevel,
    input.readinessBand,
    input.dabblingPass,
    input.tokenMaxxingPass,
  );

  const trustedMeta = MATURITY_LEVELS.find((m) => m.level === reconciliation.trustedLevel);

  return {
    blocked,
    blockReasons,
    mode,
    lightEdgeAvailable: mode ? isLightEdgeAvailable(mode, input.readinessBand) : false,
    onRamp: blocked ? null : recommendOnRamp(input.readinessBand),
    immuneSystem: input.immuneSystem,
    immuneDescriptor: IMMUNE_SYSTEM_DESCRIPTORS[input.immuneSystem],
    headcount: input.headcount,
    maturityReconciliation: {
      trustedLevel: reconciliation.trustedLevel,
      trustedLabel: trustedMeta?.label ?? `L${reconciliation.trustedLevel}`,
      impliedLevel: reconciliation.impliedLevel,
      divergences: reconciliation.divergences,
    },
  };
}
