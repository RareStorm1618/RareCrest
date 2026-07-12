export type EscalationUrgency = "low" | "medium" | "high" | "critical";

export interface CounselEscalationInput {
  matterId?: string;
  issueType: "regulatory" | "litigation" | "privacy" | "contract";
  crossBorderImpact: boolean;
  customerHarmRisk: boolean;
  financialExposureUsd: number;
}

export interface CounselEscalationDecision {
  escalated: boolean;
  triggerCode: string;
  rationale: string;
  urgency: EscalationUrgency;
  requiredWithinHours: number;
}

export function evaluateCounselEscalation(input: CounselEscalationInput): CounselEscalationDecision {
  const triggers: string[] = [];
  if (input.crossBorderImpact) triggers.push("cross_border");
  if (input.customerHarmRisk) triggers.push("customer_harm");
  if (input.financialExposureUsd >= 250000) triggers.push("high_exposure");
  if (input.issueType === "litigation" || input.issueType === "privacy") triggers.push(`issue:${input.issueType}`);

  const escalated = triggers.length > 0;
  const urgency: EscalationUrgency =
    triggers.includes("customer_harm") || triggers.includes("issue:litigation")
      ? "critical"
      : triggers.includes("high_exposure") || triggers.includes("issue:privacy")
        ? "high"
        : escalated
          ? "medium"
          : "low";
  const requiredWithinHours = urgency === "critical" ? 4 : urgency === "high" ? 12 : urgency === "medium" ? 24 : 72;

  return {
    escalated,
    triggerCode: triggers.join("|") || "none",
    rationale: escalated ? `Escalate due to ${triggers.join(", ")}` : "No escalation trigger reached",
    urgency,
    requiredWithinHours,
  };
}
