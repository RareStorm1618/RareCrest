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

export interface ValidationErrorResponse {
  errors: FieldError[];
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}
