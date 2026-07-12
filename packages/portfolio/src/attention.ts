/** WO-36: AttentionFlagService — shared AttentionItem signal set */

import type { AttentionSeverity } from "@rarecrest/contracts";

/** AC-PORT-006.2 signal types (shared with Command Surface) */
export const ATTENTION_SIGNAL_TYPES = [
  "open_governance_gate",
  "unresolved_conflict",
  "hard_rule_exception",
  "pending_high_stakes_decision",
  "unverified_claim",
] as const;

export type AttentionSignalType = (typeof ATTENTION_SIGNAL_TYPES)[number];

export interface AttentionItem {
  id: string;
  entityId: string;
  signalType: AttentionSignalType;
  severity: AttentionSeverity;
  message: string;
  linkPath: string | null;
  sourceRef: string | null;
  createdAt: string;
}

export const RELATIONSHIP_TYPES = [
  "fiscal_sponsorship",
  "profit_donation_dependency",
  "charitable_license",
  "shared_infrastructure",
  "data_sharing",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_DIRECTIONS = ["directed", "bidirectional"] as const;
export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTIONS)[number];

export interface EntityRelationshipInput {
  fromEntityId: string;
  toEntityId: string;
  relationshipType: RelationshipType;
  direction?: RelationshipDirection;
  constraintNote?: string;
}

const DEFAULT_SEVERITY: Record<AttentionSignalType, AttentionSeverity> = {
  open_governance_gate: "high",
  unresolved_conflict: "medium",
  hard_rule_exception: "critical",
  pending_high_stakes_decision: "high",
  unverified_claim: "medium",
};

export function defaultSeverityForSignal(signalType: AttentionSignalType): AttentionSeverity {
  return DEFAULT_SEVERITY[signalType];
}

export function validateAttentionSignalType(value: string): value is AttentionSignalType {
  return (ATTENTION_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function validateRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

/** AC-PORT-005.4 — hard-rule exception blocks agent deployment clearance */
export function isClearForAgentDeployment(items: AttentionItem[]): boolean {
  return !items.some(
    (item) =>
      item.signalType === "hard_rule_exception" || item.signalType === "open_governance_gate",
  );
}

/** AC-PORT-006.2 — portfolio not clear when any attention signal is open */
export function hasOpenAttentionSignals(items: AttentionItem[]): boolean {
  return items.length > 0;
}

export function buildAttentionItem(input: {
  id: string;
  entityId: string;
  signalType: AttentionSignalType;
  message: string;
  severity?: AttentionSeverity;
  linkPath?: string | null;
  sourceRef?: string | null;
  createdAt: string;
}): AttentionItem {
  return {
    id: input.id,
    entityId: input.entityId,
    signalType: input.signalType,
    severity: input.severity ?? defaultSeverityForSignal(input.signalType),
    message: input.message,
    linkPath: input.linkPath ?? null,
    sourceRef: input.sourceRef ?? null,
    createdAt: input.createdAt,
  };
}

export function messageForUnverifiedClaim(claimType: string, claimText: string): string {
  return `Unverified claim (${claimType}): ${claimText}`;
}
