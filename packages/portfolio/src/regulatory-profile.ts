/** WO-35: RegulatoryProfileService domain logic */

import type { EntityType, VerticalKey } from "@rarecrest/contracts";

/** AC-PORT-002.1 */
export const ENTITY_TYPES: EntityType[] = [
  "nonprofit",
  "for_profit_platform",
  "fund",
  "token_protocol",
  "holding",
];

/** Domain-specific regimes layered on type defaults (AC-PORT-002.2) */
export const VERTICAL_DOMAIN_REGIMES: Record<VerticalKey, string[]> = {
  rareangels: ["HIPAA", "HITECH", "GDPR"],
  rareedge: ["SEC", "AML", "GDPR"],
  rarestorm: ["IRS-501c3", "Form-990"],
  hopecoin: ["AML", "Money-Transmission"],
  healkids: ["COPPA", "HIPAA"],
  holding: ["NIST-AI-RMF", "GDPR"],
};

export const TYPE_DEFAULT_REGIMES: Record<EntityType, string[]> = {
  nonprofit: ["IRS-501c3", "Form-990"],
  for_profit_platform: ["GDPR", "State-Privacy"],
  fund: ["SEC", "AML"],
  token_protocol: ["AML", "Money-Transmission"],
  holding: ["GDPR", "NIST-AI-RMF"],
};

export interface RegulatoryProfileView {
  entityId: string;
  entityType: EntityType | null;
  vertical: VerticalKey;
  regimes: string[];
  incomplete: boolean;
  isHoldingEntity: boolean;
  holdingCrossCutting: boolean;
}

/** AC-PORT-002.2 — merge type + domain defaults */
export function buildDefaultRegulatoryProfile(
  entityType: EntityType,
  vertical: VerticalKey,
): string[] {
  const merged = new Set([
    ...TYPE_DEFAULT_REGIMES[entityType],
    ...VERTICAL_DOMAIN_REGIMES[vertical],
  ]);
  return [...merged].sort();
}

/** AC-PORT-002.5 */
export function isRegulatoryProfileIncomplete(entityType: EntityType | null | undefined): boolean {
  return entityType == null;
}

/** AC-PORT-002.4 */
export function addRegime(regimes: string[], regime: string): string[] {
  const next = new Set(regimes);
  next.add(regime);
  return [...next].sort();
}

export function removeRegime(regimes: string[], regime: string): string[] {
  return regimes.filter((r) => r !== regime).sort();
}

export function buildRegulatoryProfileView(input: {
  entityId: string;
  entityType: EntityType | null;
  vertical: VerticalKey;
  regimes: string[];
  isHoldingEntity: boolean;
}): RegulatoryProfileView {
  const incomplete = isRegulatoryProfileIncomplete(input.entityType);
  return {
    entityId: input.entityId,
    entityType: input.entityType,
    vertical: input.vertical,
    regimes: input.regimes,
    incomplete,
    isHoldingEntity: input.isHoldingEntity,
    holdingCrossCutting: input.isHoldingEntity || input.entityType === "holding",
  };
}

export function validateEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}
