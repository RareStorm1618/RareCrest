use crate::deployment_gate::DeploymentGateService;
use crate::hard_rule_evaluator::HardRuleEvaluator;
use crate::types::{HardRuleCheckRequest, HardRuleVerdict};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRequest {
    pub agent_id: String,
    pub entity_id: String,
    pub hard_rule_clear: bool,
    pub envelope_enforceable: bool,
    pub evaluation_suite_registered: bool,
    pub kill_switches_live: bool,
    pub human_review_routing_live: bool,
    /// WO-13: optional deployment gate inputs
    pub maturity_score: Option<u8>,
    pub maturity_threshold: Option<u8>,
    pub migration_blocked: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationVerdict {
    pub permitted: bool,
    pub missing_controls: Vec<String>,
}

pub struct RuntimeEnforcementService;

impl RuntimeEnforcementService {
    /// AC-RCP-002.1–002.3
    pub fn evaluate_activation(req: &ActivationRequest) -> ActivationVerdict {
        let mut missing = Vec::new();
        if !req.hard_rule_clear {
            missing.push("hard_rule_clear".into());
        }
        if !req.envelope_enforceable {
            missing.push("permission_envelope".into());
        }
        if !req.evaluation_suite_registered {
            missing.push("evaluation_suite".into());
        }
        if !req.kill_switches_live {
            missing.push("kill_switches".into());
        }
        if !req.human_review_routing_live {
            missing.push("human_review_routing".into());
        }
        if let (Some(score), Some(threshold)) = (req.maturity_score, req.maturity_threshold) {
            if !DeploymentGateService::check_maturity_floor(score, threshold) {
                missing.push("maturity_floor".into());
            }
        }
        if let Some(blocked) = req.migration_blocked {
            if !DeploymentGateService::check_migration_red_halt(blocked) {
                missing.push("migration_red_halt".into());
            }
        }
        ActivationVerdict {
            permitted: missing.is_empty(),
            missing_controls: missing,
        }
    }

    /// AC-RCP-003.1–003.4 — reuse hard rule evaluator at action time
    pub fn enforce_action(request: &HardRuleCheckRequest) -> HardRuleVerdict {
        HardRuleEvaluator::evaluate(request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_controls() -> ActivationRequest {
        ActivationRequest {
            agent_id: "a1".into(),
            entity_id: "e1".into(),
            hard_rule_clear: true,
            envelope_enforceable: true,
            evaluation_suite_registered: true,
            kill_switches_live: true,
            human_review_routing_live: true,
            maturity_score: Some(4),
            maturity_threshold: Some(3),
            migration_blocked: Some(false),
        }
    }

    #[test]
    fn permits_activation_when_all_controls_live() {
        let v = RuntimeEnforcementService::evaluate_activation(&full_controls());
        assert!(v.permitted);
        assert!(v.missing_controls.is_empty());
    }

    #[test]
    fn blocks_activation_and_lists_missing_controls() {
        let mut req = full_controls();
        req.kill_switches_live = false;
        req.human_review_routing_live = false;
        let v = RuntimeEnforcementService::evaluate_activation(&req);
        assert!(!v.permitted);
        assert!(v.missing_controls.contains(&"kill_switches".to_string()));
        assert!(v.missing_controls.contains(&"human_review_routing".to_string()));
    }

    #[test]
    fn blocks_activation_when_deployment_gate_fails() {
        let mut req = full_controls();
        req.maturity_score = Some(1);
        req.maturity_threshold = Some(3);
        let v = RuntimeEnforcementService::evaluate_activation(&req);
        assert!(!v.permitted);
        assert!(v.missing_controls.contains(&"maturity_floor".to_string()));
    }
}
