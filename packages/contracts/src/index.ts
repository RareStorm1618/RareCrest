/** Vertical tenancy keys — strict inter-vertical isolation */
export type VerticalKey =
  | "rarestorm"
  | "rareangels"
  | "rareedge"
  | "hopecoin"
  | "healkids"
  | "holding";

export type EntityType =
  | "nonprofit"
  | "for_profit_platform"
  | "fund"
  | "token_protocol"
  | "holding";

export type GovernanceStatus =
  | "not_assessed"
  | "in_progress"
  | "clear"
  | "blocked"
  | "hard_rule_exception";

export type AttentionSeverity = "low" | "medium" | "high" | "critical";

/** Agent rights — two-of-three rule */
export type AgentRight = "sensitive_data" | "code_execution" | "external_comms";

export interface RightsGrant {
  agentId: string;
  entityId: string;
  vertical: VerticalKey;
  rights: AgentRight[];
  grantedAt: string;
  grantedBy: string;
}

export interface HardRuleCheckRequest {
  agentId: string;
  entityId: string;
  vertical: VerticalKey;
  requestedRights: AgentRight[];
  touchesPhi: boolean;
  touchesFinancial: boolean;
  encryptionLayerPresent: boolean;
  humanInstructionId?: string;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface HardRuleVerdict {
  allowed: boolean;
  reasons: FieldError[];
  traceId: string;
  evaluatedAt: string;
}

export interface ActivationRequest {
  agentId: string;
  entityId: string;
  hardRuleClear: boolean;
  envelopeEnforceable: boolean;
  evaluationSuiteRegistered: boolean;
  killSwitchesLive: boolean;
  humanReviewRoutingLive: boolean;
}

export interface ActivationVerdict {
  permitted: boolean;
  missingControls: string[];
}

export interface DecisionTraceEntry {
  id: string;
  entityId: string;
  vertical: VerticalKey;
  action: string;
  verdict: "allow" | "deny";
  payload: Record<string, unknown>;
  createdAt: string;
  retentionRegime: string;
  /** Wave 3 hash chain: sha256(entityId+action+payload); null for the first trace on an entity. */
  prevHash?: string | null;
  /** Wave 3 hash chain: sha256 of this trace's own content, chained to prevHash. */
  contentHash?: string;
}

export interface EntityState {
  id: string;
  name: string;
  vertical: VerticalKey;
  tenancyKey: string;
  entityType: EntityType | null;
  isHoldingEntity: boolean;
  mode: string;
  band: string;
  regulatoryRegimes: string[];
  governanceStatus: GovernanceStatus;
  deploymentLocked: boolean;
  maturityLevel: number;
  assessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AttentionFlag {
  id: string;
  entityId: string;
  flagType: string;
  severity: AttentionSeverity;
  message: string;
  linkPath: string | null;
  createdAt: string;
}

export interface EntityRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  direction: string;
  constraintNote: string | null;
}

export interface PortfolioEntitySummary {
  id: string;
  name: string;
  vertical: VerticalKey;
  entityType: EntityType | null;
  isHoldingEntity: boolean;
  mode: string;
  band: string;
  regulatoryRegimes: string[];
  regulatoryProfileIncomplete: boolean;
  governanceStatus: GovernanceStatus;
  deploymentLocked: boolean;
  maturityLevel: number;
  attentionFlagCount: number;
  clearForAgentDeployment: boolean;
  stateSummary: string;
}

export interface PortfolioRollup {
  entities: PortfolioEntitySummary[];
  summary: {
    byBand: Record<string, number>;
    byGovernanceStatus: Record<string, number>;
    totalEntities: number;
    attentionFlagCount: number;
    portfolioClear: boolean;
  };
  generatedAt: string;
}

/** S2 Officer Passports — pre-shaped agent roles scoped by the same two-of-three rights rule. */
export type OfficerRole =
  | "chief_of_staff"
  | "treasury_prep"
  | "compliance_prep"
  | "care_ops"
  | "markets_research"
  | "delivery_build"
  | "red_team"
  | "canon_librarian"
  | "bridge_diplomat";

export interface OfficerRoleTemplate {
  role: OfficerRole;
  /** Ceiling for requested rights on this role — at most 2, never all three. */
  maxRights: AgentRight[];
  /** True if the role must never receive sensitive_data / raw-PHI access. */
  phiBlind: boolean;
  /** True if the role may only prepare financial actions, never commit them. */
  financialPrepOnly: boolean;
  /** False for roles that must stay confined to non-production sandboxes (e.g. red_team). */
  mayExecuteProduction: boolean;
  defaultCriticalTokens: number;
  defaultAwarenessTokens: number;
}

/** Sensible per-role defaults — director-assignable, never self-escalating beyond maxRights. */
export const OFFICER_ROLE_TEMPLATES: Record<OfficerRole, OfficerRoleTemplate> = {
  chief_of_staff: {
    role: "chief_of_staff",
    maxRights: ["external_comms"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 2,
    defaultAwarenessTokens: 10,
  },
  treasury_prep: {
    role: "treasury_prep",
    maxRights: ["external_comms"],
    phiBlind: false,
    financialPrepOnly: true,
    mayExecuteProduction: false,
    defaultCriticalTokens: 3,
    defaultAwarenessTokens: 5,
  },
  compliance_prep: {
    role: "compliance_prep",
    maxRights: ["external_comms"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 3,
    defaultAwarenessTokens: 5,
  },
  care_ops: {
    role: "care_ops",
    maxRights: [],
    phiBlind: true,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 2,
    defaultAwarenessTokens: 4,
  },
  markets_research: {
    role: "markets_research",
    maxRights: ["external_comms"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 2,
    defaultAwarenessTokens: 6,
  },
  delivery_build: {
    role: "delivery_build",
    maxRights: ["code_execution"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: true,
    defaultCriticalTokens: 4,
    defaultAwarenessTokens: 4,
  },
  red_team: {
    role: "red_team",
    maxRights: ["code_execution"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 5,
    defaultAwarenessTokens: 3,
  },
  canon_librarian: {
    role: "canon_librarian",
    maxRights: [],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 1,
    defaultAwarenessTokens: 6,
  },
  bridge_diplomat: {
    role: "bridge_diplomat",
    maxRights: ["external_comms"],
    phiBlind: false,
    financialPrepOnly: false,
    mayExecuteProduction: false,
    defaultCriticalTokens: 2,
    defaultAwarenessTokens: 6,
  },
};

export class OfficerTemplateViolationError extends Error {
  constructor(
    message: string,
    public readonly role: OfficerRole,
    public readonly rights: AgentRight[],
  ) {
    super(message);
    this.name = "OfficerTemplateViolationError";
  }
}

/**
 * Fail-closed officer-rights check: throws unless `rights` is a subset of the
 * role's `maxRights`, at most 2 entries, and never all three AgentRights at
 * once (the global two-of-three rule still applies within the officer ceiling).
 */
export function assertRightsWithinOfficerTemplate(role: OfficerRole, rights: AgentRight[]): void {
  const template = OFFICER_ROLE_TEMPLATES[role];
  if (!template) {
    throw new OfficerTemplateViolationError(`Unknown officer role: ${role}`, role, rights);
  }
  if (rights.length > 2) {
    throw new OfficerTemplateViolationError(
      `Officer role ${role} requested ${rights.length} rights — at most 2 allowed`,
      role,
      rights,
    );
  }
  const hasAllThree =
    rights.includes("sensitive_data") && rights.includes("code_execution") && rights.includes("external_comms");
  if (hasAllThree) {
    throw new OfficerTemplateViolationError(
      `Officer role ${role} requested all three agent rights — two-of-three rule violation`,
      role,
      rights,
    );
  }
  const notInTemplate = rights.filter((right) => !template.maxRights.includes(right));
  if (notInTemplate.length > 0) {
    throw new OfficerTemplateViolationError(
      `Officer role ${role} requested rights outside its template ceiling: ${notInTemplate.join(", ")}`,
      role,
      rights,
    );
  }
}

export interface ValidationErrorResponse {
  errors: FieldError[];
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}
