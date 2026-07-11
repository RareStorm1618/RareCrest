/** Vertical tenancy keys — strict inter-vertical isolation */
export type VerticalKey =
  | "rarestorm"
  | "rareangels"
  | "rareedge"
  | "hopecoin"
  | "healkids";

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
  mode: string;
  band: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
