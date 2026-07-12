import type { PortfolioRollup } from "@rarecrest/contracts";

export interface PortfolioSignal {
  id: string;
  severity: "info" | "watch" | "critical";
  title: string;
  detail: string;
  entityId?: string;
  suggestedRoute?: "diagnostics" | "design" | "migration" | "companion";
}

export interface PortfolioBrief {
  headline: string;
  narrative: string;
  signals: PortfolioSignal[];
  schema: Record<string, unknown>;
  generatedAt: string;
}

/** Deterministic director briefing from server-owned portfolio roll-up (zero client authority). */
export function buildPortfolioBrief(rollup: PortfolioRollup): PortfolioBrief {
  const blocked = rollup.entities.filter((e) => !e.clearForAgentDeployment);
  const flagged = rollup.entities.filter((e) => e.attentionFlagCount > 0);
  const incomplete = rollup.entities.filter(
    (e) => e.regulatoryProfileIncomplete || e.entityType == null,
  );
  const signals: PortfolioSignal[] = [];

  for (const entity of flagged.slice(0, 5)) {
    signals.push({
      id: `flag-${entity.id}`,
      severity: entity.attentionFlagCount >= 3 ? "critical" : "watch",
      title: `${entity.name} needs attention`,
      detail: `${entity.attentionFlagCount} open flag(s) · ${entity.stateSummary}`,
      entityId: entity.id,
      suggestedRoute: "diagnostics",
    });
  }

  for (const entity of blocked.slice(0, 3)) {
    if (signals.some((s) => s.entityId === entity.id)) continue;
    signals.push({
      id: `deploy-${entity.id}`,
      severity: "critical",
      title: `${entity.name} blocked for agent deployment`,
      detail: `Governance ${entity.governanceStatus} · band ${entity.band}`,
      entityId: entity.id,
      suggestedRoute: "companion",
    });
  }

  for (const entity of incomplete.slice(0, 3)) {
    if (signals.some((s) => s.entityId === entity.id)) continue;
    signals.push({
      id: `profile-${entity.id}`,
      severity: "watch",
      title: `${entity.name} profile incomplete`,
      detail: "Set entity type and regulatory regimes before substantive guidance.",
      entityId: entity.id,
      suggestedRoute: "diagnostics",
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "clear",
      severity: "info",
      title: "Portfolio clear for director review",
      detail: "No open attention flags or deployment blocks in current roll-up.",
    });
  }

  const criticalCount = signals.filter((s) => s.severity === "critical").length;
  const headline =
    criticalCount > 0
      ? `${criticalCount} critical director signal${criticalCount === 1 ? "" : "s"}`
      : rollup.summary.portfolioClear
        ? "Holding portfolio is clear"
        : "Watch items require director judgment";

  const narrative = [
    `${rollup.summary.totalEntities} entities under holding scope.`,
    `${rollup.summary.attentionFlagCount} attention flags open.`,
    blocked.length > 0
      ? `${blocked.length} entity(ies) blocked from agent deployment.`
      : "No deployment blocks in current roll-up.",
    "Companion answers remain framing-guarded and server-owned — this brief never grants authority.",
  ].join(" ");

  return {
    headline,
    narrative,
    signals,
    schema: {
      authority: "none",
      totalEntities: rollup.summary.totalEntities,
      attentionFlagCount: rollup.summary.attentionFlagCount,
      portfolioClear: rollup.summary.portfolioClear,
      byBand: rollup.summary.byBand,
      byGovernanceStatus: rollup.summary.byGovernanceStatus,
      signalCount: signals.length,
      criticalCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function suggestedPrompts(input: {
  entityName: string;
  band?: string | null;
  governanceStatus?: string | null;
  attentionFlagCount?: number;
  clearForAgentDeployment?: boolean;
}): string[] {
  const prompts = [
    `What should a director verify next for ${input.entityName}?`,
    `Explain DRIVE vs SHAPE gaps for ${input.entityName} without inventing facts.`,
  ];
  if (input.attentionFlagCount && input.attentionFlagCount > 0) {
    prompts.unshift(`Prioritize the open attention flags on ${input.entityName}.`);
  }
  if (input.clearForAgentDeployment === false) {
    prompts.unshift(`Why is ${input.entityName} blocked from agent deployment?`);
  }
  if (input.band === "red" || input.governanceStatus === "hard_rule_exception") {
    prompts.unshift(`What hard-rule or maturity controls must clear before ${input.entityName} advances?`);
  }
  return prompts.slice(0, 4);
}
