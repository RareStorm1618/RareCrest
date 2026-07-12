/** Diagnostics Suite domain logic — WO-31, WO-26 */

export * from "./sequencer.js";

export interface ReadinessDimension {
  id: string;
  name: string;
  anchor1: string;
  anchor10: string;
}

export const READINESS_DIMENSIONS: ReadinessDimension[] = [
  { id: "organizational_drag", name: "Organizational Drag", anchor1: "Change requires executive meetings for every decision", anchor10: "Teams ship autonomously with clear guardrails" },
  { id: "ai_elevation", name: "AI Elevation", anchor1: "AI is a chat sidebar", anchor10: "AI is embedded in core workflows" },
  { id: "work_architecture", name: "Work Architecture", anchor1: "Roles defined by headcount boxes", anchor10: "Work decomposed into agent-amenable units" },
  { id: "firm_boundary", name: "Firm-Boundary Design", anchor1: "Siloed vertical systems", anchor10: "Shared platform with strict tenancy" },
  { id: "decision_autonomy", name: "Decision Autonomy", anchor1: "All decisions escalate to director", anchor10: "Agents decide within policy envelopes" },
  { id: "network_structure", name: "Network Structure", anchor1: "Hub-and-spoke through director", anchor10: "Mesh of accountable agent teams" },
  { id: "reinvention_cadence", name: "Reinvention Cadence", anchor1: "Annual planning cycles only", anchor10: "Continuous improvement loops" },
  { id: "tacit_knowledge", name: "Tacit-Knowledge Accessibility", anchor1: "Knowledge trapped in individuals", anchor10: "Canon searchable and agent-grounded" },
];

export type ReadinessBand = "ready_for_rewrite" | "foundational" | "survival_risk" | "incomplete";

export interface BandResult {
  band: ReadinessBand;
  label: string;
  recommendation: string;
  total: number;
  dimensionScores: Record<string, number>;
}

export function validateDimensionScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 10;
}

export function computeReadinessTotal(scores: Record<string, number>): number | null {
  const ids = READINESS_DIMENSIONS.map((d) => d.id);
  if (!ids.every((id) => validateDimensionScore(scores[id] ?? 0))) {
    if (ids.some((id) => scores[id] === undefined)) return null;
  }
  for (const id of ids) {
    if (!validateDimensionScore(scores[id])) return null;
  }
  return ids.reduce((sum, id) => sum + scores[id], 0);
}

export function computeReadinessBand(scores: Record<string, number>): BandResult {
  const total = computeReadinessTotal(scores);
  if (total === null) {
    return {
      band: "incomplete",
      label: "Incomplete",
      recommendation: "Score all eight readiness dimensions (1-10 each).",
      total: 0,
      dimensionScores: scores,
    };
  }
  if (total >= 56) {
    return {
      band: "ready_for_rewrite",
      label: "Ready for full rewrite",
      recommendation: "Proceed with full rewrite migration mode.",
      total,
      dimensionScores: scores,
    };
  }
  if (total >= 33) {
    return {
      band: "foundational",
      label: "Foundational",
      recommendation: "Start with a 90-day edge-twin sprint.",
      total,
      dimensionScores: scores,
    };
  }
  return {
    band: "survival_risk",
    label: "Survival risk",
    recommendation: "Stand up the minimal viable intelligence stack urgently.",
    total,
    dimensionScores: scores,
  };
}

export function evaluateDabblingTest(leadershipShift: boolean, cadenceChanged: boolean): { pass: boolean; message: string } {
  const pass = leadershipShift && cadenceChanged;
  return {
    pass,
    message: pass ? "Passes Dabbling Test — entity shows AI-native cadence" : "Dabbling detected — not AI-native",
  };
}

export type TokenAnswer = "yes" | "no" | "unknown";

export function evaluateTokenMaxxing(answers: [TokenAnswer, TokenAnswer, TokenAnswer]): {
  pass: boolean;
  belowL3: boolean;
  theater: boolean;
  message: string;
} {
  const yesCount = answers.filter((a) => a === "yes").length;
  const unknownCount = answers.filter((a) => a === "unknown").length;
  const belowL3 = answers.some((a) => a === "yes");
  const theater = yesCount >= 3 || unknownCount >= 3;
  const pass = answers.every((a) => a === "no");
  return {
    pass,
    belowL3,
    theater,
    message: theater
      ? "Transformation theater detected"
      : pass
        ? "Passes Token-Maxxing Test"
        : "Below L3 threshold — token-maxxing signals present",
  };
}

export function computeGovernanceMaturity(pillars: Record<string, number>): {
  maturity: number;
  deploymentLocked: boolean;
  belowThreshold: string[];
} {
  const keys = ["trusted_evaluations", "searchable_logs", "granular_rollback", "human_review_queue"];
  const belowThreshold: string[] = [];
  let min = 10;
  for (const key of keys) {
    const score = pillars[key] ?? 0;
    if (score < 3) belowThreshold.push(key);
    min = Math.min(min, score);
  }
  return { maturity: min, deploymentLocked: belowThreshold.length > 0, belowThreshold };
}

export function evaluateMigrationGate(gatingAnswers: Record<string, "green" | "yellow" | "red">): {
  halted: boolean;
  haltReasons: string[];
} {
  const gatingKeys = ["q5", "q6", "q7", "q8"];
  const haltReasons = gatingKeys.filter((k) => gatingAnswers[k] === "red");
  return { halted: haltReasons.length > 0, haltReasons };
}

export * from "./migration.js";
export * from "./task-decomposition.js";
