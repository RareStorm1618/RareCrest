use crate::types::{AgentRight, FieldError, HardRuleCheckRequest, HardRuleVerdict};
use chrono::Utc;
use uuid::Uuid;

/// WO-11: HardRuleEvaluator — two-of-three rights, no autonomous financial action
pub struct HardRuleEvaluator;

impl HardRuleEvaluator {
    pub fn evaluate(request: &HardRuleCheckRequest) -> HardRuleVerdict {
        let mut reasons: Vec<FieldError> = [];

        // Rule 1: Two-of-three rights — holding all three is structurally impossible
        if request.requested_rights.len() >= 3 {
            let has_all = [
                AgentRight::SensitiveData,
                AgentRight::CodeExecution,
                AgentRight::ExternalComms,
            ]
            .iter()
            .all(|r| request.requested_rights.contains(r));

            if has_all {
                reasons.push(FieldError {
                    field: "requestedRights".into(),
                    code: "TWO_OF_THREE_VIOLATION".into(),
                    message: "Agent cannot hold all three rights simultaneously: sensitive_data, code_execution, external_comms".into(),
                });
            }
        }

        if request.requested_rights.len() > 2 {
            reasons.push(FieldError {
                field: "requestedRights".into(),
                code: "MAX_TWO_RIGHTS".into(),
                message: format!(
                    "Agent may hold at most 2 rights, requested {}",
                    request.requested_rights.len()
                ),
            });
        }

        // Rule 2: Encrypt-before-access for PHI
        if request.touches_phi && !request.encryption_layer_present {
            reasons.push(FieldError {
                field: "encryptionLayerPresent".into(),
                code: "ENCRYPT_BEFORE_ACCESS".into(),
                message: "Protected health data requires encryption layer before agent access".into(),
            });
        }

        // Rule 3: No autonomous financial action
        if request.touches_financial && request.human_instruction_id.is_none() {
            reasons.push(FieldError {
                field: "humanInstructionId".into(),
                code: "NO_AUTONOMOUS_FINANCIAL".into(),
                message: "Financial actions require explicit human instruction ID".into(),
            });
        }

        HardRuleVerdict {
            allowed: reasons.is_empty(),
            reasons,
            trace_id: Uuid::new_v4().to_string(),
            evaluated_at: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AgentRight;

    fn base_request() -> HardRuleCheckRequest {
        HardRuleCheckRequest {
            agent_id: "agent-1".into(),
            entity_id: Uuid::new_v4().to_string(),
            vertical: "rareangels".into(),
            requested_rights: vec![AgentRight::SensitiveData],
            touches_phi: false,
            touches_financial: false,
            encryption_layer_present: true,
            human_instruction_id: None,
        }
    }

    #[test]
    fn allows_valid_two_rights_request() {
        let mut req = base_request();
        req.requested_rights = vec![AgentRight::SensitiveData, AgentRight::CodeExecution];
        let verdict = HardRuleEvaluator::evaluate(&req);
        assert!(verdict.allowed);
    }

    #[test]
    fn denies_all_three_rights() {
        let mut req = base_request();
        req.requested_rights = vec![
            AgentRight::SensitiveData,
            AgentRight::CodeExecution,
            AgentRight::ExternalComms,
        ];
        let verdict = HardRuleEvaluator::evaluate(&req);
        assert!(!verdict.allowed);
        assert!(verdict.reasons.iter().any(|r| r.code == "TWO_OF_THREE_VIOLATION"));
    }

    #[test]
    fn denies_phi_without_encryption() {
        let mut req = base_request();
        req.touches_phi = true;
        req.encryption_layer_present = false;
        let verdict = HardRuleEvaluator::evaluate(&req);
        assert!(!verdict.allowed);
        assert!(verdict.reasons.iter().any(|r| r.code == "ENCRYPT_BEFORE_ACCESS"));
    }

    #[test]
    fn denies_autonomous_financial_action() {
        let mut req = base_request();
        req.touches_financial = true;
        req.human_instruction_id = None;
        let verdict = HardRuleEvaluator::evaluate(&req);
        assert!(!verdict.allowed);
        assert!(verdict.reasons.iter().any(|r| r.code == "NO_AUTONOMOUS_FINANCIAL"));
    }

    #[test]
    fn allows_financial_with_human_instruction() {
        let mut req = base_request();
        req.touches_financial = true;
        req.human_instruction_id = Some("human-cmd-123".into());
        let verdict = HardRuleEvaluator::evaluate(&req);
        assert!(verdict.allowed);
    }
}
