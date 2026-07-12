/** WO-37: FramingRuleGuard — framing rule + diagnostic gate */

export const FRAMING_FRAMEWORKS = ["destination", "intelligence_stack", "rewrite"] as const;
export type FramingFramework = (typeof FRAMING_FRAMEWORKS)[number];

export type RequestKind =
  | "substantive"
  | "architecture"
  | "drive_only"
  | "generic_summary"
  | "migration";

export interface EntityContext {
  entityId: string;
  entityType: string | null;
  vertical: string;
  regulatoryRegimes: string[];
  readinessBand: string | null;
  maturityLevel: number | null;
  migrationMode: string | null;
  diagnosticsComplete: boolean;
}

export interface GuardVerdict {
  allowed: boolean;
  reason?: string;
  redirectTo?: string;
  frameworks: FramingFramework[];
}

/** AC-SKILL-001.2 */
export function checkEntityContext(context: EntityContext | null): GuardVerdict {
  if (!context?.entityId) {
    return {
      allowed: false,
      reason: "Select an entity before requesting substantive guidance.",
      redirectTo: "/portfolio",
      frameworks: [],
    };
  }
  if (context.entityType == null || context.regulatoryRegimes.length === 0) {
    return {
      allowed: false,
      reason: "Entity context is incomplete — set type and regulatory profile first.",
      redirectTo: `/entities/${context.entityId}/regulatory-profile`,
      frameworks: [],
    };
  }
  return { allowed: true, frameworks: [...FRAMING_FRAMEWORKS] };
}

/** AC-SKILL-003.1 / AC-SKILL-003.2 */
export function checkDiagnosticGate(context: EntityContext, requestingArchitecture: boolean): GuardVerdict {
  const base = checkEntityContext(context);
  if (!base.allowed) return base;
  if (requestingArchitecture && !context.diagnosticsComplete) {
    return {
      allowed: false,
      reason: "Complete readiness diagnostics before architecture recommendations.",
      redirectTo: `/diagnostics/${context.entityId}`,
      frameworks: [],
    };
  }
  return {
    allowed: true,
    frameworks: [...FRAMING_FRAMEWORKS],
    reason: context.diagnosticsComplete
      ? `Using band=${context.readinessBand ?? "unknown"}, mode=${context.migrationMode ?? "unknown"}, maturity=${context.maturityLevel ?? 0}`
      : undefined,
  };
}

/** AC-SKILL-002.1–002.3 */
export function checkFramingRule(kind: RequestKind): GuardVerdict {
  if (kind === "generic_summary") {
    return {
      allowed: false,
      reason: "Ungrounded summaries are declined — provide entity context for grounded guidance.",
      redirectTo: "/portfolio",
      frameworks: [],
    };
  }
  if (kind === "drive_only") {
    return {
      allowed: true,
      frameworks: ["destination", "intelligence_stack", "rewrite"],
      reason: "DRIVE guidance must include SHAPE (organizational chassis) — framing all three frameworks.",
    };
  }
  return { allowed: true, frameworks: [...FRAMING_FRAMEWORKS] };
}

export function evaluateGuard(
  kind: RequestKind,
  context: EntityContext | null,
): GuardVerdict {
  const framing = checkFramingRule(kind);
  if (!framing.allowed) return framing;
  if (kind === "architecture" || kind === "migration") {
    if (!context) return checkEntityContext(null);
    return checkDiagnosticGate(context, true);
  }
  if (kind === "substantive" || kind === "drive_only") {
    return checkEntityContext(context);
  }
  return framing;
}
