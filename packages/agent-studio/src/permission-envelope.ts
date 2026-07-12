/** WO-43: PermissionEnvelopeValidator */

import type { AgentRight, FieldError } from "@rarecrest/contracts";

export const ENVELOPE_CHECKLIST = [
  "scoped_workload_identity",
  "separated_read_write_credentials",
  "destructive_not_auto_executed",
  "soft_delete_windows",
  "approval_thresholds_on_destructive",
] as const;

export type EnvelopeChecklistItem = (typeof ENVELOPE_CHECKLIST)[number];

export interface PermissionEnvelope {
  checklist: Record<EnvelopeChecklistItem, boolean>;
  requestedRights: AgentRight[];
  touchesPhi: boolean;
  touchesFinancial: boolean;
  encryptionLayerPresent: boolean;
  destructiveWithinBounds: boolean;
  humanInstructionId?: string;
}

export interface EnvelopeValidationResult {
  deployable: boolean;
  checklistComplete: boolean;
  violations: FieldError[];
  hardRuleClear: boolean;
}

/** AC-STUDIO-AS-002.2 */
export function validateEnvelopeChecklist(envelope: PermissionEnvelope): FieldError[] {
  const errors: FieldError[] = [];
  for (const item of ENVELOPE_CHECKLIST) {
    if (!envelope.checklist[item]) {
      errors.push({ field: item, code: "CHECKLIST_INCOMPLETE", message: `${item} must be satisfied` });
    }
  }
  if (envelope.destructiveWithinBounds) {
    errors.push({
      field: "destructiveWithinBounds",
      code: "DESTRUCTIVE_WITHIN_BOUNDS",
      message: "Destructive operations cannot execute within bounds — violation",
    });
  }
  return errors;
}

/** AC-STUDIO-AS-003.1–003.4 — local pre-check before GovernanceGateway */
export function evaluateHardRulePreCheck(envelope: PermissionEnvelope): FieldError[] {
  const errors: FieldError[] = [];
  if (envelope.requestedRights.length > 2) {
    errors.push({ field: "requestedRights", code: "TWO_OF_THREE", message: "At most two rights allowed" });
  }
  const hasAllThree =
    envelope.requestedRights.includes("sensitive_data") &&
    envelope.requestedRights.includes("code_execution") &&
    envelope.requestedRights.includes("external_comms");
  if (hasAllThree) {
    errors.push({ field: "requestedRights", code: "ALL_THREE_RIGHTS", message: "Cannot hold all three rights" });
  }
  if (envelope.touchesPhi && !envelope.encryptionLayerPresent) {
    errors.push({ field: "encryptionLayerPresent", code: "PHI_ENCRYPTION", message: "Encryption layer required before PHI access" });
  }
  if (envelope.touchesFinancial && !envelope.humanInstructionId) {
    errors.push({ field: "humanInstructionId", code: "HUMAN_FINANCIAL", message: "Human instruction required for financial actions" });
  }
  return errors;
}

export function validatePermissionEnvelope(envelope: PermissionEnvelope): EnvelopeValidationResult {
  const checklistErrors = validateEnvelopeChecklist(envelope);
  const hardRuleErrors = evaluateHardRulePreCheck(envelope);
  const violations = [...checklistErrors, ...hardRuleErrors];
  return {
    deployable: violations.length === 0,
    checklistComplete: checklistErrors.length === 0,
    violations,
    hardRuleClear: hardRuleErrors.length === 0,
  };
}
