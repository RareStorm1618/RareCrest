import type { AgentRight } from "@rarecrest/contracts";

export interface AgentPassportInput {
  agentId: string;
  entityId: string;
  requestedRights: AgentRight[];
  touchesPhi: boolean;
  touchesFinancial: boolean;
  encryptionLayerPresent: boolean;
  issuedBy: string;
}

export interface AgentPassport {
  agentId: string;
  entityId: string;
  rights: AgentRight[];
  riskTier: "low" | "moderate" | "high";
  hardRuleClear: boolean;
  constraints: string[];
  validUntil: string;
  issuedBy: string;
}

export function issueAgentPassport(input: AgentPassportInput): AgentPassport {
  const constraints: string[] = [];
  const hasAllThreeRights =
    input.requestedRights.includes("sensitive_data") &&
    input.requestedRights.includes("code_execution") &&
    input.requestedRights.includes("external_comms");

  if (input.requestedRights.length > 2 || hasAllThreeRights) {
    constraints.push("two_of_three_rights_violation");
  }
  if (input.touchesPhi && !input.encryptionLayerPresent) {
    constraints.push("encrypt_before_phi_access_required");
  }
  if (input.touchesFinancial) {
    constraints.push("financial_actions_require_human_commit");
  }

  const riskTier: AgentPassport["riskTier"] =
    constraints.length === 0
      ? "low"
      : constraints.includes("two_of_three_rights_violation")
        ? "high"
        : "moderate";

  const validHours = riskTier === "low" ? 72 : riskTier === "moderate" ? 24 : 8;
  const validUntil = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();

  return {
    agentId: input.agentId,
    entityId: input.entityId,
    rights: input.requestedRights,
    riskTier,
    hardRuleClear: constraints.length === 0,
    constraints,
    validUntil,
    issuedBy: input.issuedBy,
  };
}
