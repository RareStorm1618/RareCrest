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
