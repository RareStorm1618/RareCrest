/** WO-68/72/70: Runtime control plane domain */

export type AgentStatus = "running" | "inactive" | "halted";
export type AgentHealth = "healthy" | "degraded" | "critical";
export type ReviewCategory = "money" | "legal" | "customer_of_record" | "crisis" | "hard_rule_adjacent";

export interface AgentRosterEntry {
  id: string;
  agentId: string;
  entityId: string;
  owner: string;
  currentActivity: string | null;
  status: AgentStatus;
  health: AgentHealth;
  version: string | null;
}

export interface HumanReviewItem {
  id: string;
  entityId: string;
  agentId: string;
  category: ReviewCategory;
  decisionNeeded: string;
  status: "pending" | "approved" | "denied";
  slaTargetAt: string;
}

export function filterRoster(
  agents: AgentRosterEntry[],
  filters: { entityId?: string; status?: AgentStatus; health?: AgentHealth },
): AgentRosterEntry[] {
  return agents.filter((a) => {
    if (filters.entityId && a.entityId !== filters.entityId) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (filters.health && a.health !== filters.health) return false;
    return true;
  });
}

export function isHealthDegraded(health: AgentHealth): boolean {
  return health === "degraded" || health === "critical";
}

export function evaluateDrift(accuracy: number, overrideRate: number, accuracyFloor: number, overrideCeiling: number): boolean {
  return accuracy < accuracyFloor || overrideRate > overrideCeiling;
}

export function defaultSlaTargetHours(category: ReviewCategory): number {
  const map: Record<ReviewCategory, number> = {
    money: 4,
    legal: 24,
    customer_of_record: 8,
    crisis: 1,
    hard_rule_adjacent: 2,
  };
  return map[category];
}

export function isSlaBreached(slaTargetAt: string): boolean {
  return new Date(slaTargetAt).getTime() < Date.now();
}

export * from "./human-review.js";
export * from "./version-history.js";
