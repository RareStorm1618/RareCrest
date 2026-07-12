/** WO-29: SpecValidationService */

import type { AgentRight, FieldError } from "@rarecrest/contracts";

export interface StructuredDocumentInput {
  docType: string;
  narrative: string;
  schemaPayload: Record<string, unknown>;
  requestedRights?: AgentRight[];
}

export interface ValidationResult {
  valid: boolean;
  deployable: boolean;
  errors: FieldError[];
}

export function validateStructuredDocument(input: StructuredDocumentInput): ValidationResult {
  const errors: FieldError[] = [];
  if (!input.schemaPayload.name) {
    errors.push({ field: "name", code: "REQUIRED", message: "Specification name is required" });
  }
  if (!input.narrative.trim()) {
    errors.push({ field: "narrative", code: "REQUIRED", message: "Narrative track is required" });
  }
  if (input.requestedRights && input.requestedRights.length > 2) {
    errors.push({ field: "requestedRights", code: "MAX_TWO_RIGHTS", message: "At most 2 rights allowed" });
  }
  if (input.docType === "agent_blueprint" && !input.schemaPayload.agentId) {
    errors.push({ field: "agentId", code: "REQUIRED", message: "agentId required for agent_blueprint" });
  }
  if (input.docType === "workflow_spec" && !input.schemaPayload.workflowId) {
    errors.push({ field: "workflowId", code: "REQUIRED", message: "workflowId required for workflow_spec" });
  }
  const deployable = errors.length === 0;
  return { valid: deployable, deployable, errors };
}

export function mergeValidationWithHardRule(
  local: ValidationResult,
  hardRuleAllowed: boolean,
  hardRuleReasons: FieldError[],
): ValidationResult {
  const errors = [...local.errors, ...hardRuleReasons];
  const deployable = local.deployable && hardRuleAllowed && errors.length === 0;
  return { valid: deployable, deployable, errors };
}
